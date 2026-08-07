import { FRONTEND_MODES } from "./auth/config.mjs";
import { readApplicationSession } from "./auth/session.mjs";
import { applyAuthenticatedNavigation } from "./auth/navigation.mjs";
import {
  getPublicPresentationRepository
} from "./data/public-presentation-repository.mjs";
import { createFollowService } from "./data/follow-service.mjs";
import {
  createPublicProfileLink,
  isValidProfileSlug
} from "./data/public-work-mapping.mjs";

const presentationsContainer =
  document.querySelector("#presentations");
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

function cleanText(value) {
  return String(value || "").trim();
}

function formatType(value) {
  return cleanText(value)
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toUpperCase();
}

function parseDate(value) {
  if (!value) return null;

  const parsed = new Date(`${value}T00:00:00Z`);

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed;
}

function formatDate(value) {
  const parsed = parseDate(value);

  if (!parsed) return "";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(parsed).toUpperCase();
}

function formatDateRange(startDate, endDate) {
  const start = formatDate(startDate);
  const end = formatDate(endDate);

  if (!start) return "";
  if (!end || endDate === startDate) return start;

  return `${start} — ${end}`;
}

function createPresentationLink(id) {
  return /^[0-9a-f-]{36}$/i.test(String(id || ""))
    ? `presentation.html?id=${encodeURIComponent(id)}`
    : null;
}

function createState(message, isError = false) {
  const state = document.createElement("p");

  state.className = "profile-works-state";
  state.classList.toggle("is-error", isError);
  state.setAttribute("role", "status");
  state.textContent = message;

  return state;
}

function appendLine(container, value, className = "") {
  const text = cleanText(value);

  if (!text) return;

  const line = document.createElement("p");

  if (className) {
    line.className = className;
  }

  line.textContent = text;
  container.append(line);
}

function createPresentationArticle(presentation) {
  const article = document.createElement("article");
  const metadata = document.createElement("div");
  const heading = document.createElement("h2");
  const detailLink =
    createPresentationLink(presentation.id);

  article.className = "profile-presentation";
  article.dataset.presentationId = presentation.id;

  metadata.className = "profile-presentation-meta";

  if (detailLink) {
    const titleLink = document.createElement("a");

    titleLink.href = detailLink;
    titleLink.textContent = presentation.title;
    heading.append(titleLink);
  } else {
    heading.textContent = presentation.title;
  }

  metadata.append(heading);

  appendLine(
    metadata,
    formatType(presentation.activityType),
    "profile-presentation-type"
  );

  appendLine(
    metadata,
    formatDateRange(
      presentation.startDate,
      presentation.endDate
    ),
    "profile-presentation-date"
  );

  const location = [
    presentation.venueName,
    presentation.city,
    presentation.country
  ].filter(Boolean).join(", ");

  appendLine(
    metadata,
    location,
    "profile-presentation-location"
  );

  if (presentation.description) {
    appendLine(
      metadata,
      presentation.description,
      "profile-presentation-description"
    );
  }

  if (presentation.externalUrl) {
    const externalLink =
      document.createElement("a");

    externalLink.className =
      "profile-presentation-external";
    externalLink.href =
      presentation.externalUrl;
    externalLink.target = "_blank";
    externalLink.rel = "noreferrer";
    externalLink.textContent =
      "EXTERNAL LINK ↗";

    metadata.append(externalLink);
  }

  article.append(metadata);

  return article;
}

function renderUnavailable(connectionError = false) {
  document.title =
    "PRESENTATIONS NOT AVAILABLE — CHAINED";

  profileName.textContent =
    "ARTIST PROFILE";
  biography.hidden = true;
  agendaLink.hidden = true;
  cvLink.hidden = true;

  presentationsContainer.setAttribute(
    "aria-busy",
    "false"
  );

  presentationsContainer.replaceChildren(
    createState(
      connectionError
        ? "PRESENTATIONS CURRENTLY UNAVAILABLE"
        : "ARTIST PROFILE NOT AVAILABLE",
      connectionError
    )
  );
}

function renderProfile(result) {
  const { profile, presentations } = result;

  const profileHref =
    createPublicProfileLink(profile.slug);

  const presentationsHref =
    `profile-presentations.html?slug=${encodeURIComponent(
      profile.slug
    )}`;

  document.title =
    `Presentations — ${profile.displayName} — CHAINED`;

  profileName.textContent =
    profile.displayName;

  primaryProfileLink.href =
    profileHref;
  worksLink.href =
    profileHref;
  presentationsLink.href =
    presentationsHref;

  if (result.hasPublicAgenda) {
    agendaLink.href =
      `profile-agenda.html?slug=${encodeURIComponent(
        profile.slug
      )}`;

    agendaLink.hidden = false;
  } else {
    agendaLink.hidden = true;
  }

  if (result.hasPublicCv) {
    cvLink.href =
      `profile-cv.html?slug=${encodeURIComponent(
        profile.slug
      )}`;

    cvLink.hidden = false;
  } else {
    cvLink.hidden = true;
  }

  if (profile.biography) {
    biography.textContent =
      profile.biography;
    biography.hidden = false;
  } else {
    biography.hidden = true;
  }

  presentationsContainer.setAttribute(
    "aria-busy",
    "false"
  );

  presentationsContainer.replaceChildren(
    ...(presentations.length
      ? presentations.map(
          createPresentationArticle
        )
      : [
          createState(
            "NO PUBLISHED PRESENTATIONS"
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

async function initialiseAuthenticatedNavigation(
  client
) {
  try {
    const session =
      await readApplicationSession(client);

    if (session.kind !== "active") return;

    await applyAuthenticatedNavigation(client);
  } catch (error) {
    console.error(
      "Profile authenticated navigation unavailable.",
      error
    );
  }
}

async function initialisePresentations() {
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
      await getPublicPresentationRepository();

    if (
      runtime.mode !==
        FRONTEND_MODES.LOCAL_SUPABASE ||
      !repository
    ) {
      renderUnavailable();
      return;
    }

    const result =
      await repository.getProfilePresentations(
        slug
      );

    if (result.kind !== "available") {
      renderUnavailable();
      return;
    }

    renderProfile(result);

    await initialiseAuthenticatedNavigation(
      runtime.client
    );

    await initialiseFollowControl(
      runtime.client,
      {
        id: result.profile.id,
        slug: result.profile.slug
      }
    );
  } catch {
    hideFollowControl();
    renderUnavailable(true);
  }
}

initialisePresentations();
