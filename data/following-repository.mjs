import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import { createPublicImageUrl } from "./public-data-request.mjs";
import {
  createFollowingCursor,
  FOLLOWING_FEED_FIELDS,
  mapFollowingFeed
} from "./following-mapping.mjs";

export const FOLLOWING_INITIAL_BATCH = 12;
export const FOLLOWING_DATA_SOURCE = "supabase-only";

export function createFollowingRepository(client, pageSize = FOLLOWING_INITIAL_BATCH) {
  return Object.freeze({
    mode: FRONTEND_MODES.LOCAL_SUPABASE,

    async hasAnyFollows() {
      const { data, error } = await client
        .from("profile_follows")
        .select("profile_id")
        .limit(1);
      if (error) throw new Error("following_unavailable");
      return Array.isArray(data) && data.length > 0;
    },

    async loadFollowingFeed(cursor = null) {
      const { data, error } = await client.rpc("list_following_feed", {
        feed_cursor_published_at: cursor?.publishedAt || null,
        feed_cursor_work_id: cursor?.workId || null,
        feed_page_size: pageSize + 1
      });
      if (error) throw new Error("following_unavailable");

      const mapped = mapFollowingFeed(data, (path) => createPublicImageUrl(client, path));
      const items = mapped.slice(0, pageSize);
      return Object.freeze({
        fields: FOLLOWING_FEED_FIELDS,
        items,
        hasMore: mapped.length > pageSize,
        nextCursor: items.length ? createFollowingCursor(items.at(-1)) : null
      });
    }
  });
}

export async function getFollowingRepository() {
  const runtime = await getFrontendRuntime();
  return resolveFollowingRepository(runtime);
}

export function resolveFollowingRepository(runtime) {
  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    return Object.freeze({ runtime, repository: null });
  }

  return Object.freeze({
    runtime,
    repository: createFollowingRepository(runtime.client)
  });
}
