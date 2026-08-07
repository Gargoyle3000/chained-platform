import { FRONTEND_MODES } from "./auth/config.mjs";
import { readApplicationSession } from "./auth/session.mjs";
import { applyAuthenticatedNavigation } from "./auth/navigation.mjs";
import {
  getPublicCvRepository
} from "./data/public-cv-repository.mjs";
import { createFollowService } from "./data/follow-service.mjs";
import {
  createPublicProfileLink,
  isValidProfileSlug
} from "./data/public-work-mapping.mjs";

const cvContainer =
  document.querySelector("#cv");

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

const cvLink =
  document.querySelector("#profile-cv-link");

const followControl =
  document.querySelector("#profile-follow-control");

const followAction =
  document.querySelector("#profile-follow-action");

const followStatus =
  document.querySelector("#profile-follow-status");

function createState(message, isError = false) {
  const state = document.createElement("p");

  state.className = "profile-works-state";
  state.classList.toggle("is-error", isError);
  state.setAttribute("role", "status");
  state.textContent = message;

  return state;
}

function createCvEntry(entry) {
  const row = document.createElement("div");
  const year = document.createElement("p");
  const line = document.createElement("p");

  row.className = "profile-cv-entry";

  year.className = "profile-cv-year";
  year.textContent = entry.yearLabel;

  line.className = "profile-cv-line";
  line.textContent = entry.line;

  row.append(year, line);

  return row;
}

function createCvCategory(category) {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const entries = document.createElement("div");

  section.className = "profile-cv-category";

  heading.textContent = category.label;

  entries.className = "profile-cv-entries";

  entries.replaceChildren(
    ...category.entries.map(
      createCvEntry
    )
  );

  section.append(
    heading,
    entries
  );

  return section;
}

function renderUnavailable(connectionError = false) {
  document.title =
    "CV NOT AVAILABLE — CHAINED";

  profileName.textContent =
    "ARTIST PROFILE";

  biography.hidden = true;
  presentationsLink.hidden = true;

  cvContainer.setAttribute(
    "aria-busy",
    "false"
  );

  cvContainer.replaceChildren(
    createState(
      connectionError
        ? "CV CURRENTLY UNAVAILABLE"
        : "ARTIST PROFILE NOT AVAILABLE",
      connectionError
    )
  );
}

function renderProfile(result) {
  const { profile, categories } = result;

  const profileHref =
    createPublicProfileLink(profile.slug);

  document.title =
    `CV — ${profile.displayName} — CHAINED`;

  profileName.textContent =
    profile.displayName;

  primaryProfileLink.href =
    profileHref;

  worksLink.href =
    profileHref;

  cvLink.href =
    `profile-cv.html?slug=${encodeURIComponent(
      profile.slug
    )}`;

  if (result.hasPublicPresentations) {
    presentationsLink.href =
      `profile-presentations.html?slug=${encodeURIComponent(
        profile.slug
      )}`;

    presentationsLink.hidden = false;
  } else {
    presentationsLink.hidden = true;
  }

  if (profile.biography) {
    biography.textContent =
      profile.biography;

    biography.hidden = false;
  } else {
    biography.hidden = true;
  }

  cvContainer.setAttribute(
    "aria-busy",
    "false"
  );

  cvContainer.replaceChildren(
    ...(categories.length
      ? categories.map(
          createCvCategory
        )
      : [
          createState(
            "CV NOT PUBLISHED"
          )
        ])
  );
}

function hideFollowControl() {
  followControl.hidden = true;
  followAction.disabled = false;
  followAction.removeAttribute("aria-busy");
  followStatus.textContent = "";
}

function renderFollowState(state) {
  if (
    !["following", "not-following"].includes(
      state.kind
    )
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

  followAction.setAttribute(
    "aria-label",
    isFollowing
      ? "Unfollow this artist profile"
      : "Follow this artist profile"
  );
}

async function initialiseFollowControl(
  client,
  identity
) {
  const followService =
    createFollowService(client);

  let state;

  try {
    state =
      await followService.getFollowState(
        identity
      );
  } catch {
    hideFollowControl();
    return;
  }

  renderFollowState(state);

  if (
    !["following", "not-following"].includes(
      state.kind
    )
  ) {
    return;
  }

  followAction.addEventListener(
    "click",
    async () => {
      if (followAction.disabled) return;

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

      followAction.setAttribute(
        "aria-busy",
        "true"
      );

      followStatus.textContent =
        removing
          ? "REMOVING FOLLOW"
          : "ADDING FOLLOW";

      try {
        await (
          removing
            ? followService.unfollowProfile(
                identity
              )
            : followService.followProfile(
                identity
              )
        );

        state =
          await followService.getFollowState(
            identity
          );

        renderFollowState(state);

        followStatus.textContent =
          state.kind === "following"
            ? "PROFILE FOLLOWED."
            : "PROFILE UNFOLLOWED.";
      } catch {
        followStatus.textContent =
          removing
            ? "THE PROFILE COULD NOT BE UNFOLLOWED. TRY AGAIN."
            : "THE PROFILE COULD NOT BE FOLLOWED. TRY AGAIN.";
      } finally {
        followAction.disabled = false;

        followAction.removeAttribute(
          "aria-busy"
        );
      }
    }
  );
}

async function initialiseAuthenticatedProfileNavigation(
  client
) {
  try {
    const applicationSession =
      await readApplicationSession(client);

    if (
      applicationSession.kind !== "active"
    ) {
      return;
    }

    await applyAuthenticatedNavigation(
      client
    );
  } catch (error) {
    console.error(
      "Profile authenticated navigation unavailable.",
      error
    );
  }
}

async function initialiseCv() {
  const slug =
    new URLSearchParams(
      window.location.search
    ).get("slug");

  if (!isValidProfileSlug(slug)) {
    renderUnavailable();
    return;
  }

  try {
    const { runtime, repository } =
      await getPublicCvRepository();

    if (
      runtime.mode !==
        FRONTEND_MODES.LOCAL_SUPABASE ||
      !repository
    ) {
      renderUnavailable();
      return;
    }

    const result =
      await repository.getProfileCv(slug);

    if (result.kind !== "available") {
      renderUnavailable();
      return;
    }

    renderProfile(result);

    await initialiseAuthenticatedProfileNavigation(
      runtime.client
    );

    await initialiseFollowControl(
      runtime.client,
      {
        id: result.profile.id,
        slug: result.profile.slug
      }
    );
  } catch (error) {
    console.error(
      "Public CV unavailable.",
      error
    );

    hideFollowControl();
    renderUnavailable(true);
  }
}

initialiseCv();