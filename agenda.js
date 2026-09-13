import { FRONTEND_MODES } from "./auth/config.mjs";
import { readApplicationSession } from "./auth/session.mjs";
import { getPublicAgendaRepository } from "./data/public-agenda-repository.mjs";

const results = document.querySelector("#agenda-results");
const count = document.querySelector("#agenda-result-count");
const currentView = document.querySelector(".agenda-current-view");
const searchInput = document.querySelector("#agenda-search");
const clearButton = document.querySelector("#agenda-clear");
const citySection = document.querySelector("#agenda-city-section");
const typeSection = document.querySelector("#agenda-type-section");
const cityFilters = document.querySelector("#agenda-city-filters");
const typeFilters = document.querySelector("#agenda-type-filters");
const viewButtons = [...document.querySelectorAll("[data-agenda-view]")];

const VIEW_ALL = "all";
const VIEW_FOLLOW = "follow";
const activeCities = new Set();
const activeTypes = new Set();

let allItems = [];
let items = [];
let followedRepository = null;
let canFollowAgenda = false;
let activeView = VIEW_ALL;

function cleanText(value) {
  return String(value || "").trim();
}

function normalized(value) {
  return cleanText(value).toLowerCase();
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);

  activeView = params.get("view") === VIEW_FOLLOW
    ? VIEW_FOLLOW
    : VIEW_ALL;

  activeCities.clear();

  params.getAll("city").forEach((city) => {
    const value = normalized(city);
    if (value) activeCities.add(value);
  });
}

function writeUrlState(mode = "push") {
  const url = new URL(window.location.href);

  url.searchParams.delete("view");
  url.searchParams.delete("city");

  if (activeView === VIEW_FOLLOW) {
    url.searchParams.set("view", VIEW_FOLLOW);
  }

  [...activeCities]
    .sort()
    .forEach((city) => url.searchParams.append("city", city));

  window.history[`${mode}State`](
    null,
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
}

function updateViewControls() {
  viewButtons.forEach((button) => {
    const isActive = button.dataset.agendaView === activeView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  currentView.textContent = activeView === VIEW_FOLLOW
    ? "FOLLOW EVENTS"
    : "ALL EVENTS";
}

function formatType(value) {
  return cleanText(value)
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .toUpperCase();
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMonth(value) {
  const date = parseDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric"
  }).format(date).toUpperCase();
}

function monthKey(value) {
  return cleanText(value).slice(0, 7);
}

function formatDay(value) {
  const date = parseDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short"
  }).format(date).toUpperCase();
}

function formatWeekday(value) {
  const date = parseDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short"
  }).format(date).toUpperCase();
}

function formatTime(value) {
  return cleanText(value).slice(0, 5);
}

function formatTimeRange(start, end) {
  const startValue = formatTime(start);
  const endValue = formatTime(end);
  if (!startValue) return "";
  return endValue ? `${startValue}–${endValue}` : startValue;
}

function validExternalUrl(value) {
  try {
    const url = new URL(cleanText(value));
    return ["http:", "https:"].includes(url.protocol) && url.hostname
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function createFilterButton(value, type, activeSet) {
  const button = document.createElement("button");
  const key = normalized(value);

  button.type = "button";
  button.className = "agenda-filter";
  button.dataset.filterType = type;
  button.dataset.filterValue = key;
  button.classList.toggle("is-active", activeSet.has(key));
  button.textContent = type === "type"
    ? formatType(value)
    : cleanText(value).toUpperCase();

  button.addEventListener("click", () => {
    if (activeSet.has(key)) activeSet.delete(key);
    else activeSet.add(key);

    if (type === "city") writeUrlState();
    createFilters();
    renderAgenda();
  });

  return button;
}

function createFilters() {
  const cities = [...new Set(
    items.map((item) => cleanText(item.city)).filter(Boolean)
  )].sort();
  const types = [...new Set(
    items.map((item) => cleanText(item.occurrenceType)).filter(Boolean)
  )].sort();

  cityFilters.replaceChildren(...cities.map((city) =>
    createFilterButton(city, "city", activeCities)
  ));
  typeFilters.replaceChildren(...types.map((type) =>
    createFilterButton(type, "type", activeTypes)
  ));
  citySection.hidden = !cities.length;
  typeSection.hidden = !types.length;
}

function createEvent(item) {
  const article = document.createElement("article");
  const date = document.createElement("div");
  const day = document.createElement("span");
  const weekday = document.createElement("span");
  const main = document.createElement("div");
  const type = document.createElement("p");
  const title = document.createElement("h3");
  const artist = document.createElement("a");
  const details = document.createElement("div");

  article.className = "agenda-event";
  date.className = "agenda-date";
  day.textContent = formatDay(item.startDate);
  weekday.textContent = formatWeekday(item.startDate);
  date.append(day, weekday);

  main.className = "agenda-event-main";
  type.className = "agenda-event-type";
  type.textContent = formatType(item.occurrenceType);

  if (item.presentationHref) {
    const presentation = document.createElement("a");
    presentation.className = "agenda-presentation-link";
    presentation.href = item.presentationHref;
    presentation.textContent = item.title;
    title.append(presentation);
  } else {
    title.textContent = item.title;
  }

  artist.href = `profile.html?slug=${encodeURIComponent(item.artist.slug)}`;
  artist.textContent = item.artist.displayName;
  main.append(type, title, artist);

  details.className = "agenda-event-details";
  const time = formatTimeRange(item.startTime, item.endTime);

  if (time) {
    const line = document.createElement("p");
    line.textContent = time;
    details.append(line);
  }

  const location = [item.venueName, item.city, item.country].filter(Boolean);
  if (location.length) {
    const line = document.createElement("p");
    location.forEach((value, index) => {
      if (index) line.append(document.createElement("br"));
      line.append(document.createTextNode(value));
    });
    details.append(line);
  }

  const externalUrl = validExternalUrl(item.externalUrl);
  if (externalUrl) {
    const external = document.createElement("a");
    external.className = "agenda-external";
    external.href = externalUrl;
    external.target = "_blank";
    external.rel = "noopener noreferrer";
    external.textContent = "EXTERNAL LINK ↗";
    details.append(external);
  }

  article.append(date, main, details);
  return article;
}

function groupByMonth(filtered) {
  const groups = new Map();
  filtered.forEach((item) => {
    const key = monthKey(item.startDate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}

function createMonth(monthItems) {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const events = document.createElement("div");

  section.className = "agenda-month";
  events.className = "agenda-events";
  heading.textContent = formatMonth(monthItems[0].startDate);
  events.replaceChildren(...monthItems.map(createEvent));
  section.append(heading, events);
  return section;
}

function filteredItems() {
  const search = normalized(searchInput.value);

  return items.filter((item) => {
    const city = normalized(item.city);
    const type = normalized(item.occurrenceType);
    const matchesCity = activeCities.size === 0 || activeCities.has(city);
    const matchesType = activeTypes.size === 0 || activeTypes.has(type);
    const searchable = [
      item.title,
      item.occurrenceType,
      item.venueName,
      item.city,
      item.country,
      item.artist.displayName
    ].join(" ").toLowerCase();

    return matchesCity && matchesType && (!search || searchable.includes(search));
  });
}

function updateClearButton() {
  clearButton.hidden = activeCities.size === 0 &&
    activeTypes.size === 0 &&
    !searchInput.value.trim();
}

function renderAgenda() {
  const filtered = filteredItems();
  count.textContent = `${filtered.length} ${filtered.length === 1 ? "EVENT" : "EVENTS"}`;
  updateClearButton();

  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "agenda-empty";
    empty.textContent = items.length
      ? "NO EVENTS MATCH YOUR FILTERS"
      : activeView === VIEW_FOLLOW
        ? "NO CURRENT OR UPCOMING EVENTS FROM FOLLOWED PROFILES"
        : "NO CURRENT OR UPCOMING EVENTS";
    results.replaceChildren(empty);
    results.setAttribute("aria-busy", "false");
    return;
  }

  results.replaceChildren(...[...groupByMonth(filtered).values()].map(createMonth));
  results.setAttribute("aria-busy", "false");
}

function sendAnonymousFollowToLogin() {
  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`login.html?next=${encodeURIComponent(next)}`);
}

async function applyView() {
  updateViewControls();

  if (activeView === VIEW_ALL) {
    items = allItems;
    createFilters();
    renderAgenda();
    return;
  }

  if (!canFollowAgenda || !followedRepository) {
    sendAnonymousFollowToLogin();
    return;
  }

  count.textContent = "LOADING";
  results.setAttribute("aria-busy", "true");
  items = await followedRepository.listAgenda();
  createFilters();
  renderAgenda();
}

searchInput.addEventListener("input", renderAgenda);

clearButton.addEventListener("click", () => {
  activeCities.clear();
  activeTypes.clear();
  searchInput.value = "";
  writeUrlState();
  createFilters();
  renderAgenda();
});

viewButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const nextView = button.dataset.agendaView;
    if (nextView === activeView) return;

    activeView = nextView === VIEW_FOLLOW ? VIEW_FOLLOW : VIEW_ALL;
    writeUrlState();

    try {
      await applyView();
    } catch (error) {
      console.error("Follow agenda unavailable.", error);
      count.textContent = "UNAVAILABLE";
      results.replaceChildren(Object.assign(document.createElement("p"), {
        className: "agenda-empty",
        textContent: "FOLLOW AGENDA CURRENTLY UNAVAILABLE"
      }));
      results.setAttribute("aria-busy", "false");
    }
  });
});

window.addEventListener("popstate", async () => {
  readUrlState();
  try {
    await applyView();
  } catch (error) {
    console.error("Agenda view unavailable.", error);
  }
});

async function initialiseAgenda() {
  try {
    readUrlState();
    const { runtime, repository, followedRepository: followRepository } =
      await getPublicAgendaRepository();

    if (!repository) throw new Error("AGENDA REPOSITORY UNAVAILABLE");

    allItems = await repository.listAgenda();
    followedRepository = followRepository;

    if (runtime.mode === FRONTEND_MODES.SUPABASE) {
      const session = await readApplicationSession(runtime.client);
      canFollowAgenda = session.kind === "active";
    }

    await applyView();
  } catch (error) {
    console.error("Public agenda unavailable.", error);
    count.textContent = "UNAVAILABLE";
    results.replaceChildren(Object.assign(document.createElement("p"), {
      className: "agenda-empty",
      textContent: "AGENDA CURRENTLY UNAVAILABLE"
    }));
    results.setAttribute("aria-busy", "false");
  }
}

initialiseAgenda();
