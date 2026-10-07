import { describe, it, expect, beforeEach } from 'bun:test';
import { api, authedApi } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';

// Project logo: a custom image per project, bytes in the object store under
// project-logos/<uuid>, the serve URL on project.logo_url. Mirrors the user
// avatar module and exercises the public, unauthenticated raw route
// /project-logos/:id/:uuid/raw.

function imageFile(name = 'logo.png', content = 'pngbytes', type = 'image/png') {
  return new File([content], name, { type });
}

// Pulls the id and uuid out of a stored logo serve URL.
function parseLogoUrl(url: string) {
  const match = url.match(/^\/project-logos\/(\d+)\/([^/]+)\/raw$/);
  if (!match) throw new Error(`unexpected logo url: ${url}`);
  return { id: Number(match[1]), uuid: match[2] };
}

async function setupProject() {
  const owner = await signUpTestUser();
  const asOwner = authedApi(owner.cookie);
  await asOwner.projects.post({ key: 'MKT', name: 'Marketing' });
  return { asOwner };
}

describe('project logo', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('uploads the logo, sets logoUrl, and serves the bytes publicly', async () => {
    const { asOwner } = await setupProject();

    const up = await asOwner.projects({ projectKey: 'MKT' }).logo.post({ file: imageFile() });
    expect(up.status).toBe(200);
    expect(up.data!.logoUrl).toMatch(/^\/project-logos\/\d+\/[^/]+\/raw$/);

    const detail = await asOwner.projects({ projectKey: 'MKT' }).get();
    expect(detail.data!.project.logoUrl).toBe(up.data!.logoUrl);

    const { id, uuid } = parseLogoUrl(up.data!.logoUrl);
    const raw = await api['project-logos']({ id })({ uuid }).raw.get();
    expect(raw.status).toBe(200);
    expect(String(raw.data)).toBe('pngbytes');
    expect(raw.response.headers.get('content-type')).toContain('image/png');
    expect(raw.response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('404s the raw route for a uuid that is not the current logo', async () => {
    const { asOwner } = await setupProject();
    const up = await asOwner.projects({ projectKey: 'MKT' }).logo.post({ file: imageFile() });
    const { id } = parseLogoUrl(up.data!.logoUrl);
    const raw = await api['project-logos']({ id })({ uuid: 'not-the-uuid' }).raw.get();
    expect(raw.status).toBe(404);
  });

  it('deletes the previous object when the logo is replaced', async () => {
    const { asOwner } = await setupProject();
    const first = await asOwner
      .projects({ projectKey: 'MKT' })
      .logo.post({ file: imageFile('a.png', 'first') });
    const a = parseLogoUrl(first.data!.logoUrl);
    const second = await asOwner
      .projects({ projectKey: 'MKT' })
      .logo.post({ file: imageFile('b.png', 'second') });
    const b = parseLogoUrl(second.data!.logoUrl);

    expect(b.uuid).not.toBe(a.uuid);
    expect((await api['project-logos']({ id: a.id })({ uuid: a.uuid }).raw.get()).status).toBe(404);
    const rawB = await api['project-logos']({ id: b.id })({ uuid: b.uuid }).raw.get();
    expect(String(rawB.data)).toBe('second');
  });

  it('removes the logo: clears logoUrl and the object', async () => {
    const { asOwner } = await setupProject();
    const up = await asOwner.projects({ projectKey: 'MKT' }).logo.post({ file: imageFile() });
    const { id, uuid } = parseLogoUrl(up.data!.logoUrl);

    const del = await asOwner.projects({ projectKey: 'MKT' }).logo.delete();
    expect(del.status).toBe(204);

    const detail = await asOwner.projects({ projectKey: 'MKT' }).get();
    expect(detail.data!.project.logoUrl).toBeNull();
    expect((await api['project-logos']({ id })({ uuid }).raw.get()).status).toBe(404);
  });

  it('rejects a non-raster type', async () => {
    const { asOwner } = await setupProject();

    const svg = await asOwner
      .projects({ projectKey: 'MKT' })
      .logo.post({ file: imageFile('x.svg', '<svg/>', 'image/svg+xml') });
    expect(svg.status).toBe(400);

    const txt = await asOwner
      .projects({ projectKey: 'MKT' })
      .logo.post({ file: imageFile('x.txt', 'hi', 'text/plain') });
    expect(txt.status).toBe(400);

    const detail = await asOwner.projects({ projectKey: 'MKT' }).get();
    expect(detail.data!.project.logoUrl).toBeNull();
  });

  it('rejects a file past the size limit', async () => {
    const { asOwner } = await setupProject();
    await asOwner.god['storage-settings'].put({ maxAvatarMb: 1 });

    const big = imageFile('big.png', 'x'.repeat(1024 * 1024 + 1));
    const res = await asOwner.projects({ projectKey: 'MKT' }).logo.post({ file: big });
    expect(res.status).toBe(413);
  });

  it('rejects an empty file', async () => {
    const { asOwner } = await setupProject();
    const res = await asOwner
      .projects({ projectKey: 'MKT' })
      .logo.post({ file: new File([], 'empty.png', { type: 'image/png' }) });
    expect(res.status).toBe(400);
  });

  it('denies a non-member uploading or removing the logo', async () => {
    const { asOwner } = await setupProject();
    const outsider = authedApi((await signUpTestUser()).cookie);

    const up = await outsider.projects({ projectKey: 'MKT' }).logo.post({ file: imageFile() });
    expect(up.status).toBe(403);

    await asOwner.projects({ projectKey: 'MKT' }).logo.post({ file: imageFile() });
    const del = await outsider.projects({ projectKey: 'MKT' }).logo.delete();
    expect(del.status).toBe(403);
  });
});
