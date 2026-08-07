import {
  getPublicAgendaRepository
} from "./data/public-agenda-repository.mjs";

const results =
  document.querySelector("#agenda-results");

const count =
  document.querySelector("#agenda-result-count");

const searchInput =
  document.querySelector("#agenda-search");

const clearButton =
  document.querySelector("#agenda-clear");

const citySection =
  document.querySelector("#agenda-city-section");

const typeSection =
  document.querySelector("#agenda-type-section");

const cityFilters =
  document.querySelector("#agenda-city-filters");

const typeFilters =
  document.querySelector("#agenda-type-filters");

const activeCities = new Set();
const activeTypes = new Set();

let items = [];

function cleanText(value) {
  return String(value || "").trim();
}

function normalized(value) {
  return cleanText(value).toLowerCase();
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

function formatMonth(value) {
  const date = parseDate(value);

  if (!date) return "";

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      month: "long",
      year: "numeric"
    }
  )
    .format(date)
    .toUpperCase();
}

function monthKey(value) {
  return cleanText(value).slice(0, 7);
}

function formatDay(value) {
  const date = parseDate(value);

  if (!date) return "";

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short"
    }
  )
    .format(date)
    .toUpperCase();
}

function formatWeekday(value) {
  const date = parseDate(value);

  if (!date) return "";

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      weekday: "short"
    }
  )
    .format(date)
    .toUpperCase();
}

function formatTime(value) {
  return cleanText(value).slice(0, 5);
}

function formatTimeRange(start, end) {
  const startValue = formatTime(start);
  const endValue = formatTime(end);

  if (!startValue) return "";
  if (!endValue) return startValue;

  return `${startValue}–${endValue}`;
}

function createFilterButton(
  value,
  type,
  activeSet
) {
  const button =
    document.createElement("button");

  button.type = "button";
  button.className = "agenda-filter";
  button.dataset.filterType = type;
  button.dataset.filterValue =
    normalized(value);

  button.textContent =
    type === "type"
      ? formatType(value)
      : cleanText(value).toUpperCase();

  button.addEventListener(
    "click",
    () => {
      const key =
        button.dataset.filterValue;

      if (activeSet.has(key)) {
        activeSet.delete(key);
        button.classList.remove("is-active");
      } else {
        activeSet.add(key);
        button.classList.add("is-active");
      }

      renderAgenda();
    }
  );

  return button;
}

function createFilters() {
  const cities = [
    ...new Set(
      items
        .map((item) => cleanText(item.city))
        .filter(Boolean)
    )
  ].sort();

  const types = [
    ...new Set(
      items
        .map((item) =>
          cleanText(item.occurrenceType)
        )
        .filter(Boolean)
    )
  ].sort();

  cityFilters.replaceChildren(
    ...cities.map((city) =>
      createFilterButton(
        city,
        "city",
        activeCities
      )
    )
  );

  typeFilters.replaceChildren(
    ...types.map((type) =>
      createFilterButton(
        type,
        "type",
        activeTypes
      )
    )
  );

  citySection.hidden = !cities.length;
  typeSection.hidden = !types.length;
}

function createEvent(item) {
  const article =
    document.createElement("article");

  const date =
    document.createElement("div");

  const day =
    document.createElement("span");

  const weekday =
    document.createElement("span");

  const main =
    document.createElement("div");

  const type =
    document.createElement("p");

  const title =
    document.createElement("h3");

  const artist =
    document.createElement("a");

  const details =
    document.createElement("div");

  article.className = "agenda-event";

  date.className = "agenda-date";
  day.textContent =
    formatDay(item.startDate);
  weekday.textContent =
    formatWeekday(item.startDate);

  date.append(day, weekday);

  main.className = "agenda-event-main";

  type.className = "agenda-event-type";
  type.textContent =
    formatType(item.occurrenceType);

  title.textContent = item.title;

  artist.href =
    `profile.html?slug=${encodeURIComponent(
      item.artist.slug
    )}`;

  artist.textContent =
    item.artist.displayName;

  main.append(type, title, artist);

  details.className =
    "agenda-event-details";

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

    location.forEach(
      (value, index) => {
        if (index) {
          line.append(
            document.createElement("br")
          );
        }

        line.append(
          document.createTextNode(value)
        );
      }
    );

    details.append(line);
  }

  article.append(
    date,
    main,
    details
  );

  return article;
}

function groupByMonth(filtered) {
  const groups = new Map();

  filtered.forEach((item) => {
    const key = monthKey(item.startDate);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(item);
  });

  return groups;
}

function createMonth(monthItems) {
  const section =
    document.createElement("section");

  const heading =
    document.createElement("h2");

  const events =
    document.createElement("div");

  section.className = "agenda-month";
  events.className = "agenda-events";

  heading.textContent =
    formatMonth(
      monthItems[0].startDate
    );

  events.replaceChildren(
    ...monthItems.map(createEvent)
  );

  section.append(
    heading,
    events
  );

  return section;
}

function filteredItems() {
  const search =
    normalized(searchInput.value);

  return items.filter((item) => {
    const city =
      normalized(item.city);

    const type =
      normalized(item.occurrenceType);

    const matchesCity =
      activeCities.size === 0 ||
      activeCities.has(city);

    const matchesType =
      activeTypes.size === 0 ||
      activeTypes.has(type);

    const searchable = [
      item.title,
      item.occurrenceType,
      item.venueName,
      item.city,
      item.country,
      item.artist.displayName
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !search ||
      searchable.includes(search);

    return (
      matchesCity &&
      matchesType &&
      matchesSearch
    );
  });
}

function updateClearButton() {
  clearButton.hidden =
    activeCities.size === 0 &&
    activeTypes.size === 0 &&
    !searchInput.value.trim();
}

function renderAgenda() {
  const filtered =
    filteredItems();

  count.textContent =
    `${filtered.length} ${
      filtered.length === 1
        ? "EVENT"
        : "EVENTS"
    }`;

  updateClearButton();

  if (!filtered.length) {
    const empty =
      document.createElement("p");

    empty.className = "agenda-empty";

    empty.textContent =
      items.length
        ? "NO EVENTS MATCH YOUR FILTERS"
        : "NO CURRENT OR UPCOMING EVENTS";

    results.replaceChildren(empty);
    results.setAttribute(
      "aria-busy",
      "false"
    );

    return;
  }

  const months =
    groupByMonth(filtered);

  results.replaceChildren(
    ...[...months.values()].map(
      createMonth
    )
  );

  results.setAttribute(
    "aria-busy",
    "false"
  );
}

searchInput.addEventListener(
  "input",
  renderAgenda
);

clearButton.addEventListener(
  "click",
  () => {
    activeCities.clear();
    activeTypes.clear();

    searchInput.value = "";

    document
      .querySelectorAll(
        ".agenda-filter.is-active"
      )
      .forEach((button) => {
        button.classList.remove(
          "is-active"
        );
      });

    renderAgenda();
  }
);

async function initialiseAgenda() {
  try {
    const { repository } =
      await getPublicAgendaRepository();

    if (!repository) {
      throw new Error(
        "AGENDA REPOSITORY UNAVAILABLE"
      );
    }

    items =
      await repository.listAgenda();

    createFilters();
    renderAgenda();
  } catch (error) {
    console.error(
      "Public agenda unavailable.",
      error
    );

    count.textContent = "UNAVAILABLE";

    const state =
      document.createElement("p");

    state.className = "agenda-empty";
    state.textContent =
      "AGENDA CURRENTLY UNAVAILABLE";

    results.replaceChildren(state);

    results.setAttribute(
      "aria-busy",
      "false"
    );
  }
}

initialiseAgenda();