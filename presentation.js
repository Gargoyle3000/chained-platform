import { FRONTEND_MODES } from "./auth/config.mjs";
import { getPublicPresentationRepository } from "./data/public-presentation-repository.mjs";
import {
  createPublicPresentationLink,
  createPublicProfileLink,
  isValidPublicPresentationId
} from "./data/public-work-mapping.mjs";

const container = document.querySelector(".presentation-detail");

function cleanText(value) {
  return String(value || "").trim();
}

function formatType(value) {
  return cleanText(value)
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toUpperCase();
}

function formatDate(value) {
  if (!value) return "";

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";

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

function appendLine(fragment, value, className = "") {
  const text = cleanText(value);
  if (!text) return;

  const line = document.createElement("p");
  if (className) line.className = className;
  line.textContent = text;
  fragment.append(line);
}

function profileLink(profile) {
  return createPublicProfileLink(profile.slug) || "profile.html";
}

function presentationsLink(profile) {
  return `profile-presentations.html?slug=${encodeURIComponent(profile.slug)}`;
}

function validExternalUrl(value) {
  try {
    const url = new URL(cleanText(value));
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function renderUnavailable(connectionError = false) {
  document.title = "PRESENTATION NOT AVAILABLE — CHAINED";
  container.setAttribute("aria-busy", "false");
  container.replaceChildren(
    Object.assign(document.createElement("h1"), {
      textContent: connectionError
        ? "PRESENTATION CURRENTLY UNAVAILABLE"
        : "PRESENTATION NOT AVAILABLE"
    })
  );
}

function renderPresentation(result) {
  const { presentation, profile, participants = [], program = [], works = [] } = result;
  const fragment = document.createDocumentFragment();
  const artist = document.createElement("a");
  const title = document.createElement("h1");

  artist.className = "presentation-artist";
  artist.href = profileLink(profile);
  artist.textContent = profile.displayName;
  title.textContent = presentation.title;
  fragment.append(title);
  appendLine(fragment, formatType(presentation.activityType), "presentation-type");
  appendLine(fragment, formatDateRange(presentation.startDate, presentation.endDate), "presentation-date");
  appendLine(
    fragment,
    [presentation.venueName, presentation.city, presentation.country]
      .filter(Boolean)
      .join(", "),
    "presentation-location"
  );
  fragment.append(artist);
  appendLine(fragment, presentation.description, "presentation-description");

  const externalUrl = validExternalUrl(presentation.externalUrl);
  if (externalUrl) {
    const external = document.createElement("a");
    external.className = "presentation-external";
    external.href = externalUrl;
    external.target = "_blank";
    external.rel = "noopener noreferrer";
    external.textContent = "EXTERNAL LINK ↗";
    fragment.append(external);
  }

  if (works.length) {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    const grid = document.createElement("div");
    section.className = "presentation-context presentation-works";
    heading.textContent = "WORKS";
    grid.className = "presentation-work-grid";
    works.forEach((work) => {
      const article = document.createElement("article");
      const link = document.createElement("a");
      const image = document.createElement("img");
      const metadata = document.createElement("p");
      link.href = work.artworkHref;
      image.src = work.image;
      image.alt = `${work.title} by ${work.artistName}`;
      image.loading = "lazy";
      link.append(image);
      metadata.textContent = [work.title, work.yearLabel, work.workType].filter(Boolean).join(" · ");
      article.append(link, metadata);
      grid.append(article);
    });
    section.append(heading, grid);
    fragment.append(section);
  }

  if (participants.length) {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    const list = document.createElement("p");
    section.className = "presentation-context";
    heading.textContent = "PARTICIPANTS";
    participants.forEach((participant, index) => {
      if (index) list.append(document.createTextNode(" · "));
      if (participant.profileSlug) {
        const link = document.createElement("a");
        link.href = createPublicProfileLink(participant.profileSlug);
        link.textContent = participant.displayName;
        list.append(link);
      } else list.append(document.createTextNode(participant.displayName));
    });
    section.append(heading, list);
    fragment.append(section);
  }

  if (program.length) {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    section.className = "presentation-context";
    heading.textContent = "PROGRAM";
    section.append(heading);
    program.forEach((item) => {
      const line = document.createElement("p");
      line.textContent = [item.title, formatDateRange(item.startDate, item.endDate), item.startTime, [item.venueName, item.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
      section.append(line);
    });
    fragment.append(section);
  }

  const back = document.createElement("a");
  back.className = "presentation-back";
  back.href = presentationsLink(profile);
  back.textContent = "← SHOW PRESENTATIONS";
  fragment.append(back);

  document.title = `${presentation.title} — ${profile.displayName} — CHAINED`;
  container.setAttribute("aria-busy", "false");
  container.replaceChildren(fragment);
}

async function initialisePresentation() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!isValidPublicPresentationId(id)) {
    renderUnavailable();
    return;
  }

  try {
    const { runtime, repository } = await getPublicPresentationRepository();
    if (runtime.mode !== FRONTEND_MODES.SUPABASE || !repository) {
      renderUnavailable();
      return;
    }

    const result = await repository.getPresentation(id);
    if (result.kind !== "available") {
      renderUnavailable();
      return;
    }

    if (createPublicPresentationLink(result.presentation.id) === null) {
      renderUnavailable();
      return;
    }

    renderPresentation(result);
  } catch {
    renderUnavailable(true);
  }
}

initialisePresentation();
