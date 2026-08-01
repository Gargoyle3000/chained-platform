const tagButtons = [...document.querySelectorAll(".tag")];
const archiveItems = [...document.querySelectorAll(".archive-item")];
const activeTagsContainer = document.getElementById("activeTags");
const clearButton = document.getElementById("clearFilters");
const searchInput = document.getElementById("archiveSearch");
const resultCount = document.getElementById("resultCount");

const activeTags = new Set();

function renderActiveTags() {
  activeTagsContainer.innerHTML = "";

  activeTags.forEach((tag) => {
    const button = document.createElement("button");
    button.className = "tag is-active";
    button.type = "button";
    button.textContent = `[ ${tag} × ]`;
    button.addEventListener("click", () => {
      activeTags.delete(tag);
      const sourceButton = tagButtons.find((item) => item.dataset.tag === tag);
      sourceButton?.classList.remove("is-active");
      updateArchive();
    });
    activeTagsContainer.appendChild(button);
  });
}

function updateArchive() {
  const query = searchInput.value.trim().toUpperCase();
  let visible = 0;

  archiveItems.forEach((item) => {
    const itemTags = new Set(item.dataset.tags.split(" "));
    const title = item.dataset.title.toUpperCase();

    const matchesTags = [...activeTags].every((tag) => {
      if (tag.includes(" ")) {
        return item.dataset.tags.includes(tag);
      }
      return itemTags.has(tag);
    });

    const matchesSearch =
      query.length === 0 ||
      title.includes(query) ||
      item.dataset.tags.includes(query);

    const shouldShow = matchesTags && matchesSearch;
    item.hidden = !shouldShow;

    if (shouldShow) visible += 1;
  });

  renderActiveTags();
  resultCount.textContent = `RESULTS: ${visible} WORK${visible === 1 ? "" : "S"}`;
}

tagButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tag = button.dataset.tag;

    if (activeTags.has(tag)) {
      activeTags.delete(tag);
      button.classList.remove("is-active");
    } else {
      activeTags.add(tag);
      button.classList.add("is-active");
    }

    updateArchive();
  });
});

clearButton.addEventListener("click", () => {
  activeTags.clear();
  tagButtons.forEach((button) => button.classList.remove("is-active"));
  searchInput.value = "";
  updateArchive();
});

searchInput.addEventListener("input", updateArchive);

updateArchive();
