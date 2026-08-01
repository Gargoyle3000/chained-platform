const page = document.body;
const viewButtons = document.querySelectorAll(".view-button");
const saveButtons = document.querySelectorAll(".save-work");
const artworkLinks = document.querySelectorAll(".discover-image-link");

const viewStorageKey = "chained-discover-view";
const scrollStorageKey = "chained-discover-scroll";

function setView(view) {
  page.dataset.view = view;

  viewButtons.forEach((button) => {
    const isActive = button.dataset.view === view;

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  localStorage.setItem(viewStorageKey, view);
}


/* VIEW SINGLE / GRID */

const storedView =
  localStorage.getItem(viewStorageKey) || "single";

setView(storedView);

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
  });
});


/* SAVE WORK */

saveButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const isSaved = button.classList.toggle("is-success");

    button.textContent = isSaved
      ? "[ SAVED ]"
      : "[ SAVE WORK ]";
  });
});


/* REMEMBER POSITION BEFORE OPENING AN ARTWORK */

artworkLinks.forEach((link) => {
  link.addEventListener("click", () => {
    sessionStorage.setItem(
      scrollStorageKey,
      String(window.scrollY)
    );
  });
});


/* RETURN TO THE SAVED DISCOVER POSITION */

const url = new URL(window.location.href);
const shouldRestore = url.searchParams.get("restore") === "1";

if (shouldRestore) {
  const savedScrollPosition =
    Number(sessionStorage.getItem(scrollStorageKey));

  history.scrollRestoration = "manual";

  window.addEventListener("load", () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({
          top: savedScrollPosition,
          left: 0,
          behavior: "instant"
        });

        sessionStorage.removeItem(scrollStorageKey);

        history.replaceState(
          {},
          "",
          window.location.pathname
        );
      });
    });
  });
}