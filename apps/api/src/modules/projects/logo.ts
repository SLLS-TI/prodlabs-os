import { db, project, getStorageSettings, MB } from '@repo/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { HttpError } from '#shared/lib';
import { putObject, getObject, deleteObject } from '@repo/storage';

// Custom logo image for a project. The bytes live in the object store under
// `project-logos/<uuid>`; the project's `logo_url` column holds the relative serve
// URL `/project-logos/<projectId>/<uuid>/raw`. The uuid in the URL is what keeps the
// immutable cache correct: a replace yields a new uuid, so the old URL goes stale.

// Raster image types only. SVG is excluded on purpose: it can carry script and the
// raw route is public and same-origin, so an inline SVG would be stored XSS.
const ALLOWED_TYPES = /^image\/(png|jpe?g|gif|webp|avif)$/i;

const logoKey = (uuid: string) => `project-logos/${uuid}`;

const logoUrl = (projectId: number, uuid: string) => `/project-logos/${projectId}/${uuid}/raw`;

// Pulls the uuid out of a stored logo_url, or null when it is not one of our logos
// (empty). Used to delete the previous object and to check the raw route's uuid.
function logoUuidFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/project-logos\/\d+\/([^/]+)\/raw$/);
  return match ? match[1] : null;
}

async function setProjectLogoUrl(projectId: number, url: string | null): Promise<void> {
  await db.update(project).set({ logoUrl: url }).where(eq(project.id, projectId));
}

async function deletePreviousLogo(url: string | null | undefined): Promise<void> {
  const uuid = logoUuidFromUrl(url);
  if (!uuid) return;
  await deleteObject(logoKey(uuid)).catch((err) => {
    console.error(
      `[planner] failed to delete previous project logo ${uuid}:`,
      err instanceof Error ? err.message : err,
    );
  });
}

// The size limit is the same instance setting avatars use, read per call so a change
// in god mode takes effect without a restart.
export async function replaceProjectLogo(
  projectId: number,
  currentLogoUrl: string | null | undefined,
  file: unknown,
): Promise<string> {
  if (!(file instanceof File)) throw new HttpError(400, 'No file uploaded (form field "file")');
  if (file.size === 0) throw new HttpError(400, 'Uploaded file is empty');
  const { maxAvatarMb } = await getStorageSettings();
  if (file.size > maxAvatarMb * MB) {
    throw new HttpError(413, `Image exceeds the ${maxAvatarMb} MB limit`);
  }
  const contentType = file.type || '';
  if (!ALLOWED_TYPES.test(contentType)) {
    throw new HttpError(400, 'Logo must be a PNG, JPEG, GIF, WebP, or AVIF image');
  }

  const uuid = randomUUID();
  const key = logoKey(uuid);
  try {
    await putObject(key, Buffer.from(await file.arrayBuffer()), contentType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[planner] project logo PUT failed (key=${key}, size=${file.size}):`, err);
    throw new HttpError(502, `Object store error: ${msg}`);
  }

  const url = logoUrl(projectId, uuid);
  // Point the project at the new object first, then drop the old one; a failed
  // cleanup only orphans bytes.
  await setProjectLogoUrl(projectId, url);
  await deletePreviousLogo(currentLogoUrl);
  return url;
}

export async function clearProjectLogo(
  projectId: number,
  currentLogoUrl: string | null | undefined,
): Promise<void> {
  await setProjectLogoUrl(projectId, null);
  await deletePreviousLogo(currentLogoUrl);
}

// Reads the object only if the project's current logo_url still references this uuid,
// so a stale or wrong uuid 404s rather than serving an orphaned object.
export async function readProjectLogo(projectId: number, uuid: string) {
  const [row] = await db
    .select({ logoUrl: project.logoUrl })
    .from(project)
    .where(eq(project.id, projectId));
  if (!row || logoUuidFromUrl(row.logoUrl) !== uuid) {
    throw new HttpError(404, 'Logo not found');
  }
  try {
    return await getObject(logoKey(uuid));
  } catch (err) {
    throw new HttpError(404, err instanceof Error ? err.message : 'Object not found');
  }
}
