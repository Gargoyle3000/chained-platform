import { FRONTEND_MODES } from "./auth/config.mjs";
import { readApplicationSession } from "./auth/session.mjs";
import { applyAuthenticatedNavigation } from "./auth/navigation.mjs";

import {
  getPublicProfileRepository
} from "./data/public-profile-repository.mjs";

import {
  getPublicPressRepository
} from "./data/public-press-repository.mjs";

import {
  createFollowService
} from "./data/follow-service.mjs";

import {
  createPublicProfileLink,
  isValidProfileSlug
} from "./data/public-work-mapping.mjs";


const container =
  document.querySelector("#profile-press");

const profileName =
  document.querySelector("#profile-name");

const biography =
  document.querySelector("#profile-biography");

const primaryProfileLink =
  document.querySelector("#profile-primary-link");

const worksLink =
  document.querySelector("#profile-works-link");

const presentationsLink =
  document.querySelector("#profile-presentations-link");

const agendaLink =
  document.querySelector("#profile-agenda-link");

const cvLink =
  document.querySelector("#profile-cv-link");

const followControl =
  document.querySelector("#profile-follow-control");

const followAction =
  document.querySelector("#profile-follow-action");

const followStatus =
  document.querySelector("#profile-follow-status");


function createState(message, isError = false) {
  const state =
    document.createElement("p");

  state.className = "profile-works-state";
  state.classList.toggle(
    "is-error",
    isError
  );

  state.textContent = message;

  return state;
}


function createPressItem(item) {
  const article =
    document.createElement("article");

  const year =
    document.createElement("p");

  const content =
    document.createElement("div");

  const title =
    document.createElement("h2");

  const author =
    document.createElement("p");

  const body =
    document.createElement("p");

  article.className =
    "profile-press-item";

  year.className =
    "profile-press-year";

  year.textContent =
    item.yearLabel;

  content.className =
    "profile-press-content";

  title.textContent =
    item.title;

  content.append(title);

  if (item.author) {
    author.className =
      "profile-press-author";

    author.textContent =
      item.author;

    content.append(author);
  }

  if (item.body) {
    body.className =
      "profile-press-body";

    body.textContent =
      item.body;

    content.append(body);
  }

  if (item.url) {
    const link =
      document.createElement("a");

    link.className =
      "profile-press-link";

    link.href = item.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "[ READ ↗ ]";

    content.append(link);
  }

  article.append(
    year,
    content
  );

  return article;
}


function hideFollowControl() {
  followControl.hidden = true;
  followAction.disabled = false;
  followAction.removeAttribute(
    "aria-busy"
  );

  followStatus.textContent = "";
}


function renderFollowState(state) {
  if (
    ![
      "following",
      "not-following"
    ].includes(state.kind)
  ) {
    hideFollowControl();
    return;
  }

  const isFollowing =
    state.kind === "following";

  followControl.hidden = false;

  followAction.dataset.following =
    String(isFollowing);

  followAction.textContent =
    isFollowing
      ? "[ FOLLOWING ]"
      : "[ FOLLOW ]";
}


async function initialiseFollowControl(
  client,
  identity
) {
  const service =
    createFollowService(client);

  let state;

  try {
    state =
      await service.getFollowState(
        identity
      );
  } catch {
    hideFollowControl();
    return;
  }

  renderFollowState(state);

  if (
    ![
      "following",
      "not-following"
    ].includes(state.kind)
  ) {
    return;
  }

  followAction.addEventListener(
    "click",
    async () => {
      if (followAction.disabled) {
        return;
      }

      const removing =
        state.kind === "following";

      if (
        removing &&
        !window.confirm(
          "STOP FOLLOWING THIS PROFILE?"
        )
      ) {
        return;
      }

      followAction.disabled = true;

      try {
        if (removing) {
          await service.unfollowProfile(
            identity
          );
        } else {
          await service.followProfile(
            identity
          );
        }

        state =
          await service.getFollowState(
            identity
          );

        renderFollowState(state);
      } finally {
        followAction.disabled = false;
      }
    }
  );
}


async function initialiseAuthenticatedNavigation(
  client
) {
  try {
    const session =
      await readApplicationSession(
        client
      );

    if (session.kind !== "active") {
      return;
    }

    await applyAuthenticatedNavigation(
      client
    );
  } catch {
    // Public profile remains usable.
  }
}


async function initialiseProfilePress() {
  const slug =
    new URLSearchParams(
      window.location.search
    ).get("slug");

  if (!isValidProfileSlug(slug)) {
    container.replaceChildren(
      createState(
        "ARTIST PROFILE NOT AVAILABLE"
      )
    );

    return;
  }

  try {
    const profileSelection =
      await getPublicProfileRepository();

    const pressSelection =
      await getPublicPressRepository();

    if (
      profileSelection.runtime.mode !==
        FRONTEND_MODES.LOCAL_SUPABASE ||
      !profileSelection.repository ||
      !pressSelection.repository
    ) {
      throw new Error(
        "PUBLIC PROFILE UNAVAILABLE"
      );
    }

    const [
      profileResult,
      pressResult
    ] = await Promise.all([
      profileSelection.repository.getProfile(
        slug
      ),
      pressSelection.repository.getProfilePress(
        slug
      )
    ]);

    if (
      profileResult.kind !== "available" ||
      pressResult.kind !== "available"
    ) {
      throw new Error(
        "PUBLIC PROFILE UNAVAILABLE"
      );
    }

    const profile =
      profileResult.profile;

    const items =
      pressResult.items;

    const profileHref =
      createPublicProfileLink(
        profile.slug
      );

    document.title =
      `Press — ${profile.displayName} — CHAINED`;

    profileName.textContent =
      profile.displayName;

    primaryProfileLink.href =
      profileHref;

    worksLink.href =
      profileHref;

    if (
      profileResult.hasPublicPresentations
    ) {
      presentationsLink.href =
        `profile-presentations.html?slug=${encodeURIComponent(
          profile.slug
        )}`;

      presentationsLink.hidden = false;
    }

    if (
      profileResult.hasPublicAgenda
    ) {
      agendaLink.href =
        `profile-agenda.html?slug=${encodeURIComponent(
          profile.slug
        )}`;

      agendaLink.hidden = false;
    }

    if (
      profileResult.hasPublicCv
    ) {
      cvLink.href =
        `profile-cv.html?slug=${encodeURIComponent(
          profile.slug
        )}`;

      cvLink.hidden = false;
    }

    if (profile.biography) {
      biography.textContent =
        profile.biography;

      biography.hidden = false;
    }

    container.setAttribute(
      "aria-busy",
      "false"
    );

    container.replaceChildren(
      ...(items.length
        ? items.map(createPressItem)
        : [
            createState(
              "NO PUBLISHED PRESS"
            )
          ])
    );

    await initialiseAuthenticatedNavigation(
      profileSelection.runtime.client
    );

    await initialiseFollowControl(
      profileSelection.runtime.client,
      profileResult.followIdentity
    );
  } catch (error) {
    console.error(
      "Profile Press unavailable.",
      error
    );

    hideFollowControl();

    container.setAttribute(
      "aria-busy",
      "false"
    );

    container.replaceChildren(
      createState(
        "PRESS CURRENTLY UNAVAILABLE",
        true
      )
    );
  }
}


initialiseProfilePress();