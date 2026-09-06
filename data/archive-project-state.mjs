import { materialSearchTerms } from "./material-terms.mjs";

const ARCHIVE_PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isArchiveProjectId(value) {
  return typeof value === "string" && ARCHIVE_PROJECT_ID_PATTERN.test(value);
}

export function resolveArchiveProjectId(search, projects) {
  const parameters = new URLSearchParams(search);
  const projectIds = parameters.getAll("project");
  const projectId = projectIds[0];
  if (projectIds.length !== 1 || !isArchiveProjectId(projectId)) return null;
  return projects.some((project) => project?.id === projectId) ? projectId : null;
}

export function archiveProjectLocation(href, projectId) {
  const url = new URL(href, "http://localhost");
  if (projectId === null) {
    url.searchParams.delete("project");
  } else if (isArchiveProjectId(projectId)) {
    url.searchParams.set("project", projectId);
  } else {
    throw new Error("INVALID ARCHIVE PROJECT");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Return the next owned Project selection; selecting the current Project clears it. */
export function toggleArchiveProjectId(currentProjectId, clickedProjectId, projects) {
  if (typeof clickedProjectId !== "string" || !projects.some((project) => project?.id === clickedProjectId)) {
    return null;
  }
  return currentProjectId === clickedProjectId ? null : clickedProjectId;
}

/** Toggle one tag while preserving any unrelated active Archive filters. */
export function toggleArchiveTagId(activeTagIds, tagId) {
  const next = new Set(activeTagIds);
  if (next.has(tagId)) next.delete(tagId);
  else next.add(tagId);
  return next;
}

export function orderedProjectWorks(works, projectItems, projectId) {
  if (!projectId) return [...works];
  const worksById = new Map(works.map((work) => [work.id, work]));
  return projectItems
    .filter((item) => item.projectId === projectId)
    .sort((first, second) => first.position - second.position || first.workId.localeCompare(second.workId, "en"))
    .map((item) => worksById.get(item.workId))
    .filter(Boolean);
}

export function projectSelectWorkIds(projectItems, projectId) {
  return [...(projectItems || [])]
    .filter((item) => item?.projectId === projectId && typeof item.workId === "string")
    .sort((first, second) => first.position - second.position || first.workId.localeCompare(second.workId, "en"))
    .map((item) => item.workId);
}

export function projectChainedSelectSource(project, projectItems) {
  if (!project?.id || typeof project.title !== "string") return null;
  return Object.freeze({
    source: "project",
    title: project.title,
    workIds: Object.freeze(projectSelectWorkIds(projectItems, project.id))
  });
}

/** Re-read persisted Project state so an export never uses stale membership. */
export async function currentProjectChainedSelectSource(repository, projectId) {
  if (!repository || typeof repository.listProjects !== "function" || typeof repository.listProjectItems !== "function") {
    throw new Error("ARCHIVE PROJECT IS CURRENTLY UNAVAILABLE");
  }
  const [projects, projectItems] = await Promise.all([repository.listProjects(), repository.listProjectItems()]);
  const project = [...(projects || [])].find((entry) => entry?.id === projectId) || null;
  const source = projectChainedSelectSource(project, projectItems);
  return source ? Object.freeze({ project, source }) : null;
}

export function filterArchiveProjectWorks(works, searchTerm, activeTagIds, tagIdsForWork) {
  const term = String(searchTerm || "").trim().toLocaleLowerCase();
  return works.filter((work) => {
    const materials = Array.isArray(work.materialTerms)
      ? work.materialTerms
      : materialSearchTerms(work.materials);
    const searchText = [
      work.title,
      work.yearLabel,
      work.artistName,
      work.workType,
      ...materials
    ]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    return (!term || searchText.includes(term)) &&
      [...activeTagIds].every((tagId) => tagIdsForWork(work.id).has(tagId));
  });
}
