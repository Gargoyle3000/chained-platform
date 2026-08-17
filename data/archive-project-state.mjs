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

export function orderedProjectWorks(works, projectItems, projectId) {
  if (!projectId) return [...works];
  const worksById = new Map(works.map((work) => [work.id, work]));
  return projectItems
    .filter((item) => item.projectId === projectId)
    .sort((first, second) => first.position - second.position || first.workId.localeCompare(second.workId, "en"))
    .map((item) => worksById.get(item.workId))
    .filter(Boolean);
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
