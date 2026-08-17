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
const alternativeName = document.querySelector("#profile-alternative-name");
const profileMeta = document.querySelector("#profile-meta");
const pronouns = document.querySelector("#profile-pronouns");
const city = document.querySelector("#profile-city");
const country = document.querySelector("#profile-country");
const biography = document.querySelector("#profile-biography");
const infoLinks = document.querySelector("#profile-info-links");
const websiteLink = document.querySelector("#profile-website-link");
const socialLink = document.querySelector("#profile-social-link");
const contactLink = document.querySelector("#profile-contact-link");
const primaryProfileLink = document.querySelector("#profile-primary-link");
const worksLink = document.querySelector("#profile-works-link");
const presentationsLink = document.querySelector(
  "#profile-presentations-link"
);
const agendaLink = document.querySelector("#profile-agenda-link");
const cvLink = document.querySelector("#profile-cv-link");
const pressLink = document.querySelector("#profile-press-link");
const followControl = document.querySelector("#profile-follow-control");
const followAction = document.querySelector("#profile-follow-action");
const followStatus = document.querySelector("#profile-follow-status");

function formatType(value) {
  return String(value || "").replaceAll("-", " ").toUpperCase();
}

function renderProfileInfo(profile) {
  alternativeName.textContent = profile.alternativeName || "";
  alternativeName.hidden = !profile.alternativeName;

  pronouns.textContent = profile.pronouns || "";
  pronouns.hidden = !profile.pronouns;

  city.textContent = profile.city || "";
  city.hidden = !profile.city;

  country.textContent = profile.country || "";
  country.hidden = !profile.country;

  profileMeta.hidden =
    !profile.pronouns &&
    !profile.city &&
    !profile.country;

  if (profile.websiteUrl) {
    websiteLink.href = profile.websiteUrl;
    websiteLink.hidden = false;
  } else {
    websiteLink.removeAttribute("href");
    websiteLink.hidden = true;
  }

  if (profile.socialUrl) {
    socialLink.href = profile.socialUrl;
    socialLink.hidden = false;
  } else {
    socialLink.removeAttribute("href");
    socialLink.hidden = true;
  }

  if (profile.publicContactEmail) {
    contactLink.href = `mailto:${profile.publicContactEmail}`;
    contactLink.textContent = "EMAIL \u2197";
    contactLink.hidden = false;
  } else {
    contactLink.removeAttribute("href");
    contactLink.textContent = "";
    contactLink.hidden = true;
  }

  infoLinks.hidden =
    !profile.websiteUrl &&
    !profile.socialUrl &&
    !profile.publicContactEmail;
}

function hideProfileInfo() {
  alternativeName.textContent = "";
  alternativeName.hidden = true;

  pronouns.textContent = "";
  pronouns.hidden = true;

  city.textContent = "";
  city.hidden = true;

  country.textContent = "";
  country.hidden = true;

  profileMeta.hidden = true;

  websiteLink.removeAttribute("href");
  websiteLink.hidden = true;

  socialLink.removeAttribute("href");
  socialLink.hidden = true;

  contactLink.removeAttribute("href");
  contactLink.textContent = "";
  contactLink.hidden = true;

  infoLinks.hidden = true;
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

  const materials = work.materials || "";
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
  hideProfileInfo();
  biography.hidden = true;
  worksLink.hidden = true;
  presentationsLink.hidden = true;
  agendaLink.hidden = true;
  cvLink.hidden = true;
  pressLink.hidden = true;
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
  renderProfileInfo(profile);
  primaryProfileLink.href = profileHref;
  worksLink.href = profileHref;
  worksLink.hidden =
    profile.showWorks !== true;

  if (profile.showPresentations === true && result.hasPublicPresentations) {
    presentationsLink.href =
      `profile-presentations.html?slug=${encodeURIComponent(
        profile.slug
      )}`;

    presentationsLink.hidden = false;
  } else {
    presentationsLink.hidden = true;
  }

  if (profile.showAgenda === true && result.hasPublicAgenda) {
    agendaLink.href =
      `profile-agenda.html?slug=${encodeURIComponent(
        profile.slug
      )}`;

    agendaLink.hidden = false;
  } else {
    agendaLink.hidden = true;
  }

  if (profile.showCv === true && result.hasPublicCv) {
    cvLink.href =
      `profile-cv.html?slug=${encodeURIComponent(
        profile.slug
      )}`;

    cvLink.hidden = false;
  } else {
    cvLink.hidden = true;
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
    biography.textContent = profile.biography;
    biography.hidden = false;
  } else {
    biography.hidden = true;
  }

  worksContainer.setAttribute("aria-busy", "false");
  if (profile.showWorks === true) {
    worksContainer.replaceChildren(
      ...(works.length
        ? works.map(createWorkArticle)
        : [createState("NO PUBLISHED WORKS")])
    );
  } else {
    worksContainer.replaceChildren();
  }
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
    if (runtime.mode !== FRONTEND_MODES.SUPABASE || !repository) {
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
