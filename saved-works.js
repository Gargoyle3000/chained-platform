(() => {
  const storageKey = "chained-saved-work-ids";

  const defaultSavedWorks = [
    "the-new-order-i",
    "birds-dont-sing",
    "hey-man",
    "medusa",
    "mes"
  ];

  function writeSavedWorks(ids, notify = true) {
    const uniqueIds = [...new Set(ids)];

    localStorage.setItem(
      storageKey,
      JSON.stringify(uniqueIds)
    );

    if (notify) {
      window.dispatchEvent(
        new CustomEvent("chained:saved-works-changed", {
          detail: {
            ids: uniqueIds
          }
        })
      );
    }

    return uniqueIds;
  }

  function getSavedWorks() {
    const storedValue = localStorage.getItem(storageKey);

    if (storedValue === null) {
      return writeSavedWorks(defaultSavedWorks, false);
    }

    try {
      const parsedValue = JSON.parse(storedValue);

      return Array.isArray(parsedValue)
        ? parsedValue
        : [];
    } catch {
      return [];
    }
  }

  function isSaved(workId) {
    return getSavedWorks().includes(workId);
  }

  function addWork(workId) {
    if (!workId || isSaved(workId)) {
      return;
    }

    writeSavedWorks([
      ...getSavedWorks(),
      workId
    ]);
  }

  function removeWork(workId) {
    writeSavedWorks(
      getSavedWorks().filter((id) => id !== workId)
    );
  }

  function toggleWork(workId) {
    if (isSaved(workId)) {
      removeWork(workId);
    } else {
      addWork(workId);
    }
  }

  function updateSaveButtons(root = document) {
    const buttons = root.querySelectorAll(
      "[data-save-work][data-work-id]"
    );

    buttons.forEach((button) => {
      const saved = isSaved(button.dataset.workId);

      button.classList.toggle("is-success", saved);
      button.setAttribute("aria-pressed", String(saved));

      button.textContent = saved
        ? "[ SAVED ]"
        : "[ SAVE WORK ]";
    });
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest(
      "[data-save-work][data-work-id]"
    );

    if (!button) {
      return;
    }

    toggleWork(button.dataset.workId);
  });

  window.addEventListener(
    "chained:saved-works-changed",
    () => {
      updateSaveButtons();
    }
  );

  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) {
      updateSaveButtons();
    }
  });

  window.ChainedSavedWorks = {
    getAll: getSavedWorks,
    isSaved,
    add: addWork,
    remove: removeWork,
    toggle: toggleWork,
    updateButtons: updateSaveButtons
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => updateSaveButtons()
    );
  } else {
    updateSaveButtons();
  }
})();