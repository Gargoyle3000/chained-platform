import { FRONTEND_MODES } from "./auth/config.mjs";
import { readApplicationSession } from "./auth/session.mjs";
import { applyAuthenticatedNavigation } from "./auth/navigation.mjs";
import {
  getPublicAgendaRepository
} from "./data/public-agenda-repository.mjs";
import {
  getPublicProfileRepository
} from "./data/public-profile-repository.mjs";
import { createFollowService } from "./data/follow-service.mjs";
import {
  createPublicProfileLink,
  isValidProfileSlug
} from "./data/public-work-mapping.mjs";

const container =
  document.querySelector("#profile-agenda");

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
const pressLink = document.querySelector("#profile-press-link");

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
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .toUpperCase();
}

function parseDate(value) {
  if (!value) return null;

  const date =
    new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function formatDate(value) {
  const date = parseDate(value);

  if (!date) return "";

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  )
    .format(date)
    .toUpperCase();
}

function formatTime(value) {
  return cleanText(value).slice(0, 5);
}

function formatTimeRange(start, end) {
  const first = formatTime(start);
  const second = formatTime(end);

  if (!first) return "";
  if (!second) return first;

  return `${first}–${second}`;
}

function createState(message, isError = false) {
  const state =
    document.createElement("p");

  state.className = "profile-works-state";
  state.classList.toggle("is-error", isError);
  state.textContent = message;

  return state;
}

function createAgendaItem(item) {
  const article =
    document.createElement("article");

  const date =
    document.createElement("p");

  const content =
    document.createElement("div");

  const type =
    document.createElement("p");

  const title =
    document.createElement("h2");

  const details =
    document.createElement("div");

  article.className =
    "profile-agenda-item";

  date.className =
    "profile-agenda-date";

  date.textContent =
    formatDate(item.startDate);

  content.className =
    "profile-agenda-main";

  type.className =
    "profile-agenda-type";

  type.textContent =
    formatType(item.occurrenceType);

  title.textContent = item.title;

  content.append(type, title);

  details.className =
    "profile-agenda-details";

  const time =
    formatTimeRange(
      item.startTime,
      item.endTime
    );

  if (time) {
    const line =
      document.createElement("p");

    line.textContent = time;
    details.append(line);
  }

  const location = [
    item.venueName,
    item.city,
    item.country
  ].filter(Boolean);

  if (location.length) {
    const line =
      document.createElement("p");

    line.textContent =
      location.join(", ");

    details.append(line);
  }

  article.append(
    date,
    content,
    details
  );

  return article;
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
      await service.getFollowState(identity);
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

      try {
        await (
          removing
            ? service.unfollowProfile(identity)
            : service.followProfile(identity)
        );

        state =
          await service.getFollowState(identity);

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
      await readApplicationSession(client);

    if (session.kind !== "active") return;

    await applyAuthenticatedNavigation(client);
  } catch {
    // Public profile remains usable.
  }
}

async function initialiseProfileAgenda() {
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

    const agendaSelection =
      await getPublicAgendaRepository();

    if (
      profileSelection.runtime.mode !==
        FRONTEND_MODES.SUPABASE ||
      !profileSelection.repository ||
      !agendaSelection.repository
    ) {
      throw new Error("PUBLIC PROFILE UNAVAILABLE");
    }

    const result =
      await profileSelection.repository.getProfile(
        slug
      );

    if (result.kind !== "available") {
      throw new Error("PUBLIC PROFILE UNAVAILABLE");
    }

    const profile = result.profile;

    if (profile.showAgenda !== true) {
      document.title =
        "AGENDA NOT AVAILABLE — CHAINED";

      profileName.textContent =
        "ARTIST PROFILE";

      biography.hidden = true;
      worksLink.hidden = true;
      presentationsLink.hidden = true;
      agendaLink.hidden = true;
      cvLink.hidden = true;
      pressLink.hidden = true;

      hideFollowControl();

      container.setAttribute(
        "aria-busy",
        "false"
      );

      container.replaceChildren(
        createState(
          "ARTIST PROFILE NOT AVAILABLE"
        )
      );

      return;
    }

    const items =
      await agendaSelection.repository.listProfileAgenda(
        result.followIdentity.id
      );

    const profileHref =
      createPublicProfileLink(profile.slug);

    document.title =
      `Agenda — ${profile.displayName} — CHAINED`;

    profileName.textContent =
      profile.displayName;

    primaryProfileLink.href =
      profileHref;

    worksLink.href =
      profileHref;

    worksLink.hidden =
      profile.showWorks !== true;

    agendaLink.href =
      `profile-agenda.html?slug=${encodeURIComponent(
        profile.slug
      )}`;

    if (profile.showPresentations === true && result.hasPublicPresentations) {
      presentationsLink.href =
        `profile-presentations.html?slug=${encodeURIComponent(
          profile.slug
        )}`;

      presentationsLink.hidden = false;
    }

    if (profile.showCv === true && result.hasPublicCv) {
      cvLink.href =
        `profile-cv.html?slug=${encodeURIComponent(
          profile.slug
        )}`;

      cvLink.hidden = false;
    }

    if (profile.showPress === true && result.hasPublicPress) {
    pressLink.href =
      `profile-press.html?slug=${encodeURIComponent(
        profile.slug
      )}`;

    pressLink.hidden = false;
  } else {
    pressLink.hidden = true;
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
        ? items.map(createAgendaItem)
        : [
            createState(
              "NO CURRENT OR UPCOMING EVENTS"
            )
          ])
    );

    await initialiseAuthenticatedNavigation(
      profileSelection.runtime.client
    );

    await initialiseFollowControl(
      profileSelection.runtime.client,
      result.followIdentity
    );
  } catch (error) {
    console.error(
      "Profile Agenda unavailable.",
      error
    );

    hideFollowControl();

    container.setAttribute(
      "aria-busy",
      "false"
    );

    container.replaceChildren(
      createState(
        "AGENDA CURRENTLY UNAVAILABLE",
        true
      )
    );
  }
}

initialiseProfileAgenda();