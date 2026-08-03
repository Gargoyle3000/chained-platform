import { readApplicationSession } from "../auth/session.mjs";
import {
  isValidProfileSlug,
  isValidPublicWorkId
} from "./public-work-mapping.mjs";

export const FOLLOW_MESSAGES = Object.freeze({
  unavailable: "FOLLOWING IS CURRENTLY UNAVAILABLE.",
  followFailed: "THE PROFILE COULD NOT BE FOLLOWED. TRY AGAIN.",
  unfollowFailed: "THE PROFILE COULD NOT BE UNFOLLOWED. TRY AGAIN."
});

export class FollowError extends Error {
  constructor(operation) {
    super(operation === "unfollow" ? FOLLOW_MESSAGES.unfollowFailed : FOLLOW_MESSAGES.followFailed);
    this.name = "FollowError";
    this.operation = operation;
  }
}

export function resolveFollowAccess(applicationSession) {
  if (applicationSession?.kind === "unauthenticated") return "signed-out";
  if (applicationSession?.kind === "active") return "active";
  return "unavailable";
}

function validIdentity(identity) {
  return Boolean(
    identity &&
    isValidPublicWorkId(identity.id) &&
    isValidProfileSlug(identity.slug)
  );
}

function duplicateError(error) {
  return error?.code === "23505";
}

export function createFollowService(client, readSession = readApplicationSession) {
  async function sessionFor(identity) {
    if (!validIdentity(identity)) return Object.freeze({ kind: "unavailable" });

    const applicationSession = await readSession(client);
    const access = resolveFollowAccess(applicationSession);
    if (access !== "active") return Object.freeze({ kind: access });

    return Object.freeze({
      kind: "active",
      accountId: applicationSession.user.id,
      profileId: identity.id
    });
  }

  async function readState(identity, activeSession = null) {
    const session = activeSession || await sessionFor(identity);
    if (session.kind !== "active") return session;

    const { data, error } = await client
      .from("profile_follows")
      .select("profile_id")
      .eq("account_id", session.accountId)
      .eq("profile_id", session.profileId)
      .maybeSingle();

    if (error) return Object.freeze({ kind: "unavailable" });
    return Object.freeze({
      kind: data ? "following" : "not-following"
    });
  }

  return Object.freeze({
    getFollowState(identity) {
      return readState(identity);
    },

    async followProfile(identity) {
      const session = await sessionFor(identity);
      if (session.kind !== "active") throw new FollowError("follow");

      const { error } = await client.from("profile_follows").insert({
        account_id: session.accountId,
        profile_id: session.profileId
      });
      if (error && !duplicateError(error)) throw new FollowError("follow");

      const state = await readState(identity, session);
      if (state.kind !== "following") throw new FollowError("follow");
      return state;
    },

    async unfollowProfile(identity) {
      const session = await sessionFor(identity);
      if (session.kind !== "active") throw new FollowError("unfollow");

      const { error } = await client
        .from("profile_follows")
        .delete()
        .eq("account_id", session.accountId)
        .eq("profile_id", session.profileId);
      if (error) throw new FollowError("unfollow");

      const state = await readState(identity, session);
      if (state.kind !== "not-following") throw new FollowError("unfollow");
      return state;
    }
  });
}
