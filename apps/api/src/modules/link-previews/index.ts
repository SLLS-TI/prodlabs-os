import { Elysia } from 'elysia';
import { clientProjectIds } from '@repo/db';
import { authContext } from '#shared/auth-context';
import { errors } from '#shared/responses';
import { linkPreviewMaxAge } from './cache';
import { linkPreviewQuery, LinkPreviewResponse } from './model';
import { getLinkPreview } from './service';

export const linkPreviewRoutes = new Elysia({
  name: 'link-previews',
  detail: { tags: ['Link previews'] },
})
  .use(authContext)
  .get(
    '/link-previews',
    async ({ query, set, user }) => {
      // A linked page can name and picture an agency member (a profile, a commit), so a
      // client gets the bare link.
      if (user && (await clientProjectIds(user.id)).length > 0) {
        set.headers['Cache-Control'] = 'private, no-store';
        return { url: query.url, title: null, description: null, image: null, siteName: null };
      }
      const preview = await getLinkPreview(query.url);
      set.headers['Cache-Control'] = `private, max-age=${linkPreviewMaxAge(preview)}`;
      return preview;
    },
    {
      query: linkPreviewQuery,
      response: { 200: LinkPreviewResponse, ...errors(400, 401) },
      detail: {
        summary: 'Preview a public web link',
        description:
          'Read public HTML metadata without sending account cookies or credentials to the destination.',
      },
    },
  );
