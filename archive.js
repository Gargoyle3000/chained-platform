const works = [
  ...document.querySelectorAll(".saved-work")
];

const projectButtons = [
  ...document.querySelectorAll(".archive-project")
];

const filterButtons = [
  ...document.querySelectorAll(".archive-filter")
];

const clearButton =
  document.querySelector(".archive-clear");

const searchInput =
  document.querySelector(".archive-search input");

const resultCount =
  document.querySelector(".archive-result-count");

const currentProjectLabel =
  document.querySelector(".archive-current-project");

const emptyMessage =
  document.querySelector(".archive-empty");


const projectStorageKey =
  "chained-project-memberships";

let activeProject = "all";
const activeFilters = new Set();


/* =========================================================
   HELPERS
   ========================================================= */

function getProjectLabel(button) {
  const textNode = [...button.childNodes].find(
    (node) => node.nodeType === Node.TEXT_NODE
  );

  return textNode
    ? textNode.textContent.trim()
    : "";
}


const availableProjects = projectButtons
  .filter((button) => button.dataset.project !== "all")
  .map((button) => ({
    id: button.dataset.project,
    label: getProjectLabel(button)
  }));


function createDefaultMemberships() {
  const savedIds = new Set(
    window.ChainedSavedWorks.getAll()
  );

  const memberships = {};

  works.forEach((work) => {
    const workId = work.dataset.workId;

    memberships[workId] = savedIds.has(workId)
      ? (work.dataset.projects || "")
          .split(" ")
          .filter(Boolean)
      : [];
  });

  localStorage.setItem(
    projectStorageKey,
    JSON.stringify(memberships)
  );

  return memberships;
}


function readMemberships() {
  const storedValue =
    localStorage.getItem(projectStorageKey);

  if (!storedValue) {
    return createDefaultMemberships();
  }

  try {
    const parsedValue = JSON.parse(storedValue);

    return parsedValue &&
      typeof parsedValue === "object"
      ? parsedValue
      : createDefaultMemberships();
  } catch {
    return createDefaultMemberships();
  }
}


let projectMemberships = readMemberships();


function writeMemberships() {
  localStorage.setItem(
    projectStorageKey,
    JSON.stringify(projectMemberships)
  );
}


function getWorkProjects(workId) {
  return new Set(
    projectMemberships[workId] || []
  );
}


function closeProjectMenus(exceptMenu = null) {
  document
    .querySelectorAll(".archive-project-menu")
    .forEach((menu) => {
      if (menu !== exceptMenu) {
        menu.hidden = true;

        const button =
          menu.parentElement.querySelector(
            ".archive-add-project"
          );

        button?.setAttribute(
          "aria-expanded",
          "false"
        );
      }
    });
}


/* =========================================================
   WORK ACTIONS
   ========================================================= */

works.forEach((work) => {
  const metadata =
    work.querySelector(".saved-work-meta");

  if (!metadata) {
    return;
  }

  const actions =
    document.createElement("div");

  actions.className =
    "saved-work-actions";


  const addButton =
    document.createElement("button");

  addButton.className =
    "text-action archive-add-project";

  addButton.type = "button";
  addButton.dataset.toggleProjectMenu =
    work.dataset.workId;

  addButton.setAttribute(
    "aria-expanded",
    "false"
  );

  addButton.textContent =
    "[ ADD TO PROJECT ]";


  const projectMenu =
    document.createElement("div");

  projectMenu.className =
    "archive-project-menu";

  projectMenu.hidden = true;


  availableProjects.forEach((project) => {
    const option =
      document.createElement("button");

    option.className =
      "archive-project-option";

    option.type = "button";
    option.dataset.projectOption =
      project.id;

    option.dataset.workId =
      work.dataset.workId;

    projectMenu.appendChild(option);
  });


  const newProjectButton =
    document.createElement("button");

  newProjectButton.className =
    "archive-project-option";

  newProjectButton.type = "button";
  newProjectButton.textContent =
    "[ + NEW PROJECT ]";

  projectMenu.appendChild(
    newProjectButton
  );


  const removeButton =
    document.createElement("button");

  removeButton.className =
    "text-action archive-remove";

  removeButton.type = "button";
  removeButton.dataset.removeWork =
    work.dataset.workId;

  removeButton.textContent =
    "[ REMOVE FROM ARCHIVE ]";


  actions.append(
    addButton,
    projectMenu,
    removeButton
  );

  metadata.appendChild(actions);
});


/* =========================================================
   UPDATE PROJECT MENU
   ========================================================= */

function updateProjectMenu(workId) {
  const memberships =
    getWorkProjects(workId);

  const work = works.find(
    (item) => item.dataset.workId === workId
  );

  if (!work) {
    return;
  }

  const options =
    work.querySelectorAll(
      "[data-project-option]"
    );

  options.forEach((option) => {
    const projectId =
      option.dataset.projectOption;

    const project =
      availableProjects.find(
        (item) => item.id === projectId
      );

    const isActive =
      memberships.has(projectId);

    option.classList.toggle(
      "is-active",
      isActive
    );

    option.textContent =
      `${isActive ? "[✓]" : "[ ]"} ${
        project?.label || projectId
      }`;
  });
}


works.forEach((work) => {
  updateProjectMenu(
    work.dataset.workId
  );
});


/* =========================================================
   PROJECT COUNTS
   ========================================================= */

function updateProjectCounts() {
  const savedIds = new Set(
    window.ChainedSavedWorks.getAll()
  );

  projectButtons.forEach((button) => {
    const projectId =
      button.dataset.project;

    const countElement =
      button.querySelector("span");

    if (!countElement) {
      return;
    }

    const count = works.filter((work) => {
      const workId =
        work.dataset.workId;

      if (!savedIds.has(workId)) {
        return false;
      }

      if (projectId === "all") {
        return true;
      }

      return getWorkProjects(workId)
        .has(projectId);
    }).length;

    countElement.textContent =
      String(count);
  });
}


/* =========================================================
   UPDATE ARCHIVE
   ========================================================= */

function updateArchive() {
  const searchTerm =
    searchInput.value
      .trim()
      .toLowerCase();

  const savedIds = new Set(
    window.ChainedSavedWorks.getAll()
  );

  let visibleCount = 0;

  works.forEach((work) => {
    const workId =
      work.dataset.workId;

    const artist =
      work.dataset.artist || "";

    const tags =
      (work.dataset.tags || "")
        .split(" ");

    const searchableText =
      work.textContent.toLowerCase();

    const workIsSaved =
      savedIds.has(workId);

    const matchesProject =
      activeProject === "all" ||
      getWorkProjects(workId)
        .has(activeProject);

    const matchesFilters =
      [...activeFilters].every(
        (filter) => {
          return (
            artist === filter ||
            tags.includes(filter)
          );
        }
      );

    const matchesSearch =
      searchTerm === "" ||
      searchableText.includes(
        searchTerm
      );

    const shouldShow =
      workIsSaved &&
      matchesProject &&
      matchesFilters &&
      matchesSearch;

    work.hidden = !shouldShow;

    if (shouldShow) {
      visibleCount += 1;
    }
  });

  resultCount.textContent =
    `${visibleCount} ${
      visibleCount === 1
        ? "WORK"
        : "WORKS"
    }`;

  emptyMessage.hidden =
    visibleCount !== 0;

  updateProjectCounts();
}


/* =========================================================
   PROJECT FILTERS
   ========================================================= */

projectButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeProject =
      button.dataset.project;

    projectButtons.forEach(
      (projectButton) => {
        projectButton.classList.toggle(
          "is-active",
          projectButton === button
        );
      }
    );

    currentProjectLabel.textContent =
      getProjectLabel(button);

    updateArchive();
  });
});


/* =========================================================
   TAG FILTERS
   ========================================================= */

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter =
      button.dataset.filter;

    if (activeFilters.has(filter)) {
      activeFilters.delete(filter);
      button.classList.remove(
        "is-active"
      );
    } else {
      activeFilters.add(filter);
      button.classList.add(
        "is-active"
      );
    }

    updateArchive();
  });
});


searchInput.addEventListener(
  "input",
  updateArchive
);


/* =========================================================
   CLEAR FILTERS
   ========================================================= */

clearButton.addEventListener(
  "click",
  () => {
    activeProject = "all";
    activeFilters.clear();
    searchInput.value = "";

    projectButtons.forEach(
      (button) => {
        button.classList.toggle(
          "is-active",
          button.dataset.project === "all"
        );
      }
    );

    filterButtons.forEach(
      (button) => {
        button.classList.remove(
          "is-active"
        );
      }
    );

    currentProjectLabel.textContent =
      "ALL SAVED WORKS";

    updateArchive();
  }
);


/* =========================================================
   WORK ACTIONS
   ========================================================= */

document.addEventListener(
  "click",
  (event) => {
    const menuButton =
      event.target.closest(
        "[data-toggle-project-menu]"
      );

    if (menuButton) {
      const workId =
        menuButton.dataset
          .toggleProjectMenu;

      const work = works.find(
        (item) =>
          item.dataset.workId === workId
      );

      const menu =
        work?.querySelector(
          ".archive-project-menu"
        );

      if (!menu) {
        return;
      }

      const willOpen =
        menu.hidden;

      closeProjectMenus(menu);

      menu.hidden = !willOpen;

      menuButton.setAttribute(
        "aria-expanded",
        String(willOpen)
      );

      updateProjectMenu(workId);

      return;
    }


    const projectOption =
      event.target.closest(
        "[data-project-option]"
      );

    if (projectOption) {
      const workId =
        projectOption.dataset.workId;

      const projectId =
        projectOption.dataset
          .projectOption;

      const memberships =
        getWorkProjects(workId);

      if (memberships.has(projectId)) {
        memberships.delete(projectId);
      } else {
        memberships.add(projectId);
      }

      projectMemberships[workId] =
        [...memberships];

      writeMemberships();
      updateProjectMenu(workId);
      updateArchive();

      return;
    }


    const removeButton =
      event.target.closest(
        "[data-remove-work]"
      );

    if (removeButton) {
      const workId =
        removeButton.dataset.removeWork;

      const belongsToProjects =
        getWorkProjects(workId).size > 0;

      if (belongsToProjects) {
        const confirmed =
          window.confirm(
            "Remove this work from Archive and all projects?"
          );

        if (!confirmed) {
          return;
        }
      }

      projectMemberships[workId] = [];
      writeMemberships();

      window.ChainedSavedWorks.remove(
        workId
      );

      closeProjectMenus();
      updateArchive();

      return;
    }


    if (
      !event.target.closest(
        ".saved-work-actions"
      )
    ) {
      closeProjectMenus();
    }
  }
);


window.addEventListener(
  "chained:saved-works-changed",
  updateArchive
);


updateArchive();

/* =========================================================
   ARCHIVE VIEW
   ========================================================= */

const archiveViewButtons = [
  ...document.querySelectorAll(
    ".archive-view-button"
  )
];

const archiveViewStorageKey =
  "chained-archive-view";


function setArchiveView(view) {
  document.body.dataset.view = view;

  archiveViewButtons.forEach((button) => {
    const isActive =
      button.dataset.archiveView === view;

    button.classList.toggle(
      "is-active",
      isActive
    );

    button.setAttribute(
      "aria-pressed",
      String(isActive)
    );
  });

  localStorage.setItem(
    archiveViewStorageKey,
    view
  );
}


const storedArchiveView =
  localStorage.getItem(
    archiveViewStorageKey
  ) || "grid";

setArchiveView(storedArchiveView);


archiveViewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setArchiveView(
      button.dataset.archiveView
    );
  });
});