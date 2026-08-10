import { FRONTEND_MODES } from "./auth/config.mjs";
import { getArchiveRepository } from "./data/archive-repository.mjs";
import { orderedProjectWorks } from "./data/archive-project-state.mjs";

const main = document.querySelector(".archive-project-main");
const projectId = new URL(window.location.href).searchParams.get("id");

function state(message) {
  const element = document.createElement("p");
  element.className = "archive-project-state";
  element.setAttribute("role", "status");
  element.textContent = message;
  return element;
}

function messageElement() {
  const element = document.createElement("p");
  element.className = "archive-project-message";
  element.setAttribute("role", "status");
  element.hidden = true;
  return element;
}

function setMessage(element, message = "") {
  element.textContent = message;
  element.hidden = !message;
}

function projectForm(project, onSubmit, onDelete = null) {
  const form = document.createElement("form");
  form.className = "archive-project-form";
  const titleLabel = document.createElement("label");
  titleLabel.textContent = "PROJECT TITLE";
  const title = document.createElement("input");
  title.name = "title";
  title.maxLength = 160;
  title.autocomplete = "off";
  title.value = project?.title || "";
  titleLabel.append(title);
  const descriptionLabel = document.createElement("label");
  descriptionLabel.textContent = "DESCRIPTION";
  const description = document.createElement("textarea");
  description.name = "description";
  description.maxLength = 2000;
  description.rows = 3;
  description.value = project?.description || "";
  descriptionLabel.append(description);
  const actions = document.createElement("div");
  actions.className = "archive-project-form-actions";
  const submit = document.createElement("button");
  submit.className = "text-action";
  submit.type = "submit";
  submit.textContent = project ? "[ SAVE PROJECT ]" : "[ CREATE PROJECT ]";
  actions.append(submit);
  if (onDelete) {
    const remove = document.createElement("button");
    remove.className = "text-action";
    remove.type = "button";
    remove.textContent = "[ DELETE PROJECT ]";
    onDelete(remove);
    actions.append(remove);
  }
  const message = messageElement();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!title.value.trim()) return setMessage(message, "ENTER A PROJECT TITLE");
    submit.disabled = true;
    try { await onSubmit(title.value, description.value, message); }
    catch { setMessage(message, project ? "PROJECT COULD NOT BE SAVED" : "PROJECT COULD NOT BE CREATED"); }
    finally { submit.disabled = false; }
  });
  form.append(titleLabel, descriptionLabel, actions, message);
  return form;
}

function projectWorks(project, works, items, repository, refresh) {
  const section = document.createElement("section");
  section.className = "archive-project-composition";
  const heading = document.createElement("h1");
  heading.textContent = "PROJECT WORKS";
  const grid = document.createElement("div");
  grid.className = "archive-project-work-grid";
  const ordered = orderedProjectWorks(works, items, project.id);
  if (!ordered.length) grid.append(state("NO SAVED WORKS HAVE BEEN ADDED TO THIS PROJECT"));
  ordered.forEach((work, index) => {
    const article = document.createElement("article");
    article.className = "archive-project-work";
    const imageLink = document.createElement("a");
    imageLink.href = work.artworkHref;
    const image = document.createElement("img");
    image.src = work.image.src;
    image.alt = `${work.title} by ${work.artistName}`;
    imageLink.append(image);
    const meta = document.createElement("div");
    meta.className = "archive-project-work-meta";
    const artist = document.createElement("a");
    artist.href = work.profileHref;
    artist.textContent = work.artistName;
    const title = document.createElement("span");
    title.textContent = work.title;
    const actions = document.createElement("div");
    actions.className = "archive-project-work-actions";
    const mutate = (label, task, disabled = false) => {
      const button = document.createElement("button");
      button.className = "text-action";
      button.type = "button";
      button.textContent = label;
      button.disabled = disabled;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await task(); await refresh(); }
        catch { button.disabled = false; }
      });
      return button;
    };
    actions.append(
      mutate("[ MOVE UP ]", async () => {
        const ids = ordered.map((entry) => entry.id);
        [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
        await repository.reorderProjectWorks(project.id, ids);
      }, index === 0),
      mutate("[ MOVE DOWN ]", async () => {
        const ids = ordered.map((entry) => entry.id);
        [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
        await repository.reorderProjectWorks(project.id, ids);
      }, index === ordered.length - 1),
      mutate("[ REMOVE FROM PROJECT ]", () => repository.removeProjectWork(project.id, work.id))
    );
    meta.append(artist, title, actions);
    article.append(imageLink, meta);
    grid.append(article);
  });
  section.append(heading, grid);
  return section;
}

function publicationControls(project, publication, publishers, repository, refresh) {
  const section = document.createElement("section");
  section.className = "archive-project-publication";
  const label = document.createElement("label");
  label.textContent = "PUBLISH VIA";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Publisher profile for CURATED");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = publishers.length ? "SELECT ELIGIBLE PROFILE" : "NO ELIGIBLE PUBLISHING PROFILE";
  select.append(placeholder);
  publishers.forEach((publisher) => {
    const option = document.createElement("option");
    option.value = publisher.id;
    option.textContent = `${publisher.displayName} (${publisher.profileType.toUpperCase()})`;
    option.selected = publisher.id === project.publisherProfileId;
    select.append(option);
  });
  select.disabled = publishers.length === 0;
  label.append(select);
  const message = messageElement();
  if (publication?.status === "published") {
    const depublish = document.createElement("button");
    depublish.className = "text-action";
    depublish.type = "button";
    depublish.textContent = "[ DE-PUBLISH ]";
    depublish.addEventListener("click", async () => {
      depublish.disabled = true;
      try { await repository.depublishProject(project.id); await refresh(); }
      catch { depublish.disabled = false; setMessage(message, "PROJECT COULD NOT BE DE-PUBLISHED"); }
    });
    section.append(label, depublish, message);
    return section;
  }
  const publish = document.createElement("button");
  publish.className = "text-action";
  publish.type = "button";
  publish.textContent = "[ PUBLISH TO CURATED ]";
  publish.disabled = !select.value;
  select.addEventListener("change", () => { publish.disabled = !select.value; });
  publish.addEventListener("click", async () => {
    if (!select.value) return;
    publish.disabled = true;
    try { await repository.publishProject(project.id, select.value); await refresh(); }
    catch { publish.disabled = false; setMessage(message, "PROJECT COULD NOT BE PUBLISHED"); }
  });
  section.append(label, publish, message);
  return section;
}

async function initialise() {
  const { runtime, repository } = await getArchiveRepository();
  if (runtime.mode === FRONTEND_MODES.PROTOTYPE || !repository) {
    main.replaceChildren(state("PROJECT IS CURRENTLY UNAVAILABLE"));
    main.setAttribute("aria-busy", "false");
    return;
  }
  if (!projectId) {
    const form = projectForm(null, async (title, description) => {
      const project = await repository.createProject(title, description);
      window.location.assign(`archive.html?project=${encodeURIComponent(project.id)}`);
    });
    main.replaceChildren(document.querySelector(".archive-project-back"), form);
    main.setAttribute("aria-busy", "false");
    return;
  }
  async function load() {
    const [projects, items, works, publications, publishers] = await Promise.all([
      repository.listProjects(), repository.listProjectItems(), repository.listArchivedWorks(),
      repository.listProjectPublications(), repository.listEligiblePublisherProfiles()
    ]);
    const project = projects.find((entry) => entry.id === projectId);
    if (!project) throw new Error("PROJECT IS NOT AVAILABLE");
    const publication = publications.find((entry) => entry.projectId === projectId) || null;
    const back = document.querySelector(".archive-project-back");
    const refresh = async () => { await load(); };
    let deletePending = false;
    const form = projectForm(project, async (title, description, message) => {
      await repository.updateProject(project.id, title, description);
      setMessage(message, "PROJECT SAVED");
      await refresh();
    }, (button) => {
      button.addEventListener("click", async () => {
        if (!deletePending) { deletePending = true; button.textContent = "[ CONFIRM DELETE PROJECT ]"; return; }
        button.disabled = true;
        try { await repository.deleteProject(project.id); window.location.assign("archive.html"); }
        catch { button.disabled = false; button.textContent = "[ DELETE PROJECT ]"; deletePending = false; }
      });
    });
    main.replaceChildren(back, form, publicationControls(project, publication, publishers, repository, refresh), projectWorks(project, works, items, repository, refresh));
    main.setAttribute("aria-busy", "false");
  }
  await load();
}

function beginWhenAuthorised() {
  if (document.body.dataset.authMode) void initialise();
  else window.addEventListener("chained:auth-ready", () => void initialise(), { once: true });
}

beginWhenAuthorised();
