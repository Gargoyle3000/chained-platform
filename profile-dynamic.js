import { FRONTEND_MODES } from "./auth/config.mjs";
import { readApplicationSession } from "./auth/session.mjs";
import { applyAuthenticatedNavigation } from "./auth/navigation.mjs";
import { getPublicProfileRepository } from "./data/public-profile-repository.mjs";
import { createFollowService } from "./data/follow-service.mjs";
import {
  createPublicProfileLink,
  isValidProfileSlug
} from "./data/public-work-mapping.mjs";

const worksContainer = document.querySelector("#works");
const profileName = document.querySelector("#profile-name");
const biography = document.querySelector("#profile-biography");
const primaryProfileLink = document.querySelector("#profile-primary-link");
const presentationsLink = document.querySelector(
  "#profile-presentations-link"
);
const cvLink = document.querySelector("#profile-cv-link");
const followControl = document.querySelector("#profile-follow-control");
const followAction = document.querySelector("#profile-follow-action");
const followStatus = document.querySelector("#profile-follow-status");

function formatType(value) {
  return String(value || "").replaceAll("-", " ").toUpperCase();
}

function formatDimensions(work) {
  if (!Number.isFinite(work.height) || !Number.isFinite(work.width)) return "";
  const dimensions = [work.height, work.width];
  if (Number.isFinite(work.depth)) dimensions.push(work.depth);
  return `${dimensions.join(" × ")}${work.dimensionUnit ? ` ${work.dimensionUnit.toUpperCase()}` : ""}`;
}

function createState(message, isError = false) {
  const state = document.createElement("p");
  state.className = "profile-works-state";
  state.classList.toggle("is-error", isError);
  state.setAttribute("role", "status");
  state.textContent = message;
  return state;
}

function replaceBrokenImage(imageLink) {
  const state = document.createElement("span");
  state.className = "profile-image-placeholder";
  state.textContent = "IMAGE NOT AVAILABLE";
  imageLink.replaceChildren(state);
}

function applyOrientation(article, image, dimensions) {
  const setOrientation = (width, height) => {
    article.classList.toggle("profile-work-landscape", width >= height);
    article.classList.toggle("profile-work-portrait", width < height);
  };

  if (dimensions.width && dimensions.height) {
    setOrientation(dimensions.width, dimensions.height);
    return;
  }

  image.addEventListener("load", () => {
    setOrientation(image.naturalWidth, image.naturalHeight);
  }, { once: true });
}

function createWorkArticle(work) {
  const article = document.createElement("article");
  const imageLink = document.createElement("a");
  const image = document.createElement("img");
  const metadata = document.createElement("div");
  const heading = document.createElement("h2");
  const titleLink = document.createElement("a");

  article.className = "profile-work";
  article.dataset.workId = work.id;
  imageLink.className = "profile-image-link";
  imageLink.href = work.artworkHref;
  imageLink.setAttribute("aria-label", `View ${work.title} by ${work.artistName}`);
  image.src = work.image.src;
  image.alt = `${work.title} by ${work.artistName}`;
  image.addEventListener("error", () => replaceBrokenImage(imageLink), { once: true });
  applyOrientation(article, image, work.image);
  imageLink.append(image);

  metadata.className = "profile-work-meta";
  titleLink.href = work.artworkHref;
  titleLink.textContent = work.title;
  heading.append(titleLink);
  metadata.append(heading);

  if (work.yearLabel) {
    const year = document.createElement("span");
    year.className = "profile-year";
    year.textContent = work.yearLabel;
    metadata.append(year);
  }

  const classification = formatType(work.format || work.workType);
  if (classification) {
    const type = document.createElement("p");
    type.textContent = classification;
    metadata.append(type);
  }

  const materials = [
    work.primaryMedium,
    work.supportBase,
    ...work.additionalMaterials
  ].filter(Boolean).join(", ");
  if (materials) {
    const line = document.createElement("p");
    line.textContent = materials;
    metadata.append(line);
  }

  const dimensions = formatDimensions(work);
  if (dimensions) {
    const line = document.createElement("p");
    line.textContent = dimensions;
    metadata.append(line);
  }

  article.append(imageLink, metadata);
  return article;
}

function renderUnavailable(connectionError = false) {
  document.title = "ARTIST PROFILE NOT AVAILABLE — CHAINED";
  profileName.textContent = "ARTIST PROFILE";
  biography.hidden = true;
  presentationsLink.hidden = true;
  worksContainer.setAttribute("aria-busy", "false");
  worksContainer.replaceChildren(createState(
    connectionError ? "ARTIST PROFILE CURRENTLY UNAVAILABLE" : "ARTIST PROFILE NOT AVAILABLE",
    connectionError
  ));
}

function renderProfile(result) {
  const { profile, works } = result;
  const profileHref = createPublicProfileLink(profile.slug);
  document.title = `${profile.displayName} — CHAINED`;
  profileName.textContent = profile.displayName;
  primaryProfileLink.href = profileHref;

  if (result.hasPublicPresentations) {
    presentationsLink.href =
      `profile-presentations.html?slug=${encodeURIComponent(
        profile.slug
      )}`;

    presentationsLink.hidden = false;
  } else {
    presentationsLink.hidden = true;
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
    biography.textContent = profile.biography;
    biography.hidden = false;
  } else {
    biography.hidden = true;
  }

  worksContainer.setAttribute("aria-busy", "false");
  worksContainer.replaceChildren(
    ...(works.length
      ? works.map(createWorkArticle)
      : [createState("NO PUBLISHED WORKS")])
  );
}

function hideFollowControl() {
  followControl.hidden = true;
  followAction.disabled = false;
  followAction.removeAttribute("aria-busy");
  followStatus.textContent = "";
}

function renderFollowState(state) {
  if (!["following", "not-following"].includes(state.kind)) {
    hideFollowControl();
    return;
  }

  const isFollowing = state.kind === "following";
  followControl.hidden = false;
  followAction.dataset.following = String(isFollowing);
  followAction.textContent = isFollowing ? "[ FOLLOWING ]" : "[ FOLLOW ]";
  followAction.setAttribute(
    "aria-label",
    isFollowing ? "Unfollow this artist profile" : "Follow this artist profile"
  );
}

async function initialiseFollowControl(client, identity) {
  const followService = createFollowService(client);
  let state;
  try {
    state = await followService.getFollowState(identity);
  } catch {
    hideFollowControl();
    return;
  }
  renderFollowState(state);
  if (!["following", "not-following"].includes(state.kind)) return;

  followAction.addEventListener("click", async () => {
    if (followAction.disabled) return;
    const removing = state.kind === "following";
    if (removing && !window.confirm("STOP FOLLOWING THIS PROFILE?")) return;

    followAction.disabled = true;
    followAction.setAttribute("aria-busy", "true");
    followStatus.textContent = removing ? "REMOVING FOLLOW" : "ADDING FOLLOW";

    try {
      await (removing
        ? followService.unfollowProfile(identity)
        : followService.followProfile(identity));
      state = await followService.getFollowState(identity);
      renderFollowState(state);
      followStatus.textContent = state.kind === "following"
        ? "PROFILE FOLLOWED."
        : "PROFILE UNFOLLOWED.";
    } catch {
      followStatus.textContent = removing
        ? "THE PROFILE COULD NOT BE UNFOLLOWED. TRY AGAIN."
        : "THE PROFILE COULD NOT BE FOLLOWED. TRY AGAIN.";
    } finally {
      followAction.disabled = false;
      followAction.removeAttribute("aria-busy");
    }
  });
}

async function initialiseAuthenticatedProfileNavigation(client) {
  try {
    const applicationSession = await readApplicationSession(client);

    if (applicationSession.kind !== "active") return;

    await applyAuthenticatedNavigation(client);
  } catch (error) {
    console.error("Profile authenticated navigation unavailable.", error);
  }
}

async function initialiseProfile() {
  const slug = new URLSearchParams(window.location.search).get("slug");
  if (!isValidProfileSlug(slug)) {
    renderUnavailable();
    return;
  }

  try {
    const { runtime, repository } = await getPublicProfileRepository();
    if (runtime.mode !== FRONTEND_MODES.LOCAL_SUPABASE || !repository) {
      renderUnavailable();
      return;
    }

    const result = await repository.getProfile(slug);
    if (result.kind !== "available") {
      renderUnavailable();
      return;
    }

    renderProfile(result);
    await initialiseAuthenticatedProfileNavigation(runtime.client);
    await initialiseFollowControl(runtime.client, result.followIdentity);
  } catch {
    hideFollowControl();
    renderUnavailable(true);
  }
}

initialiseProfile();
