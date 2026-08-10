import { getCuratedRepository } from "./data/curated-repository.mjs";

const detail = document.querySelector(".curated-detail");

function state(message) {
  const element = document.createElement("p");
  element.className = "curated-state";
  element.setAttribute("role", "status");
  element.textContent = message;
  return element;
}

function collectionHeader(collection) {
  const header = document.createElement("header");
  header.className = "curated-detail-header";
  const eyebrow = document.createElement("p");
  eyebrow.className = "curated-eyebrow";
  eyebrow.textContent = "CURATED";
  const title = document.createElement("h1");
  title.textContent = collection.title;
  const publisher = document.createElement("p");
  publisher.textContent = collection.publisher.name;
  publisher.className = "curated-publisher";
  header.append(eyebrow, title, publisher);
  if (collection.description) {
    const description = document.createElement("p");
    description.className = "curated-description";
    description.textContent = collection.description;
    header.append(description);
  }
  return header;
}

function collectionWorks(collection) {
  const list = document.createElement("section");
  list.className = "curated-work-list";
  list.setAttribute("aria-label", "Works in this collection");
  if (!collection.works.length) {
    list.append(state("NO PUBLIC WORKS ARE CURRENTLY AVAILABLE"));
    return list;
  }
  collection.works.forEach((work) => {
    const article = document.createElement("article");
    article.className = "curated-work";
    const imageLink = document.createElement("a");
    imageLink.href = work.artworkHref;
    imageLink.setAttribute("aria-label", `View ${work.title} by ${work.artistName}`);
    const image = document.createElement("img");
    image.src = work.image.src;
    image.alt = `${work.title} by ${work.artistName}`;
    if (work.image.width) image.width = work.image.width;
    if (work.image.height) image.height = work.image.height;
    imageLink.append(image);
    const meta = document.createElement("div");
    meta.className = "curated-work-meta";
    const artist = document.createElement("a");
    artist.href = work.profileHref;
    artist.textContent = work.artistName;
    const title = document.createElement("a");
    title.href = work.artworkHref;
    title.textContent = work.title;
    meta.append(artist, title);
    if (work.yearLabel) {
      const year = document.createElement("span");
      year.textContent = work.yearLabel;
      meta.append(year);
    }
    article.append(imageLink, meta);
    list.append(article);
  });
  return list;
}

async function initialise() {
  const id = new URL(window.location.href).searchParams.get("id");
  const { repository } = await getCuratedRepository();
  if (!repository) {
    detail.replaceChildren(state("CURATED IS CURRENTLY UNAVAILABLE"));
    detail.setAttribute("aria-busy", "false");
    return;
  }
  const collection = await repository.getCollection(id);
  detail.replaceChildren(...(collection
    ? [collectionHeader(collection), collectionWorks(collection)]
    : [state("CURATED COLLECTION NOT AVAILABLE")]));
  detail.setAttribute("aria-busy", "false");
}

initialise().catch(() => {
  detail.replaceChildren(state("CURATED IS CURRENTLY UNAVAILABLE"));
  detail.setAttribute("aria-busy", "false");
});
