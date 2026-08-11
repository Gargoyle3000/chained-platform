import { FRONTEND_MODES } from "../auth/config.mjs";
import { readApplicationSession } from "../auth/session.mjs";
import { getArchiveRepository } from "./archive-repository.mjs";
import { createDiscoverArchiveState } from "./discover-archive-state.mjs";

export async function loadArchiveWorkState() {
  try {
    const { runtime, repository } = await getArchiveRepository();
    if (runtime.mode !== FRONTEND_MODES.SUPABASE || !repository) return null;

    const applicationSession = await readApplicationSession(runtime.client);
    if (applicationSession.kind !== "active") return null;

    return createDiscoverArchiveState(repository, await repository.listArchivedWorkIds());
  } catch {
    return null;
  }
}

export function updateArchiveWorkAction(button, work, isSaved) {
  button.classList.toggle("is-saved", isSaved);
  button.setAttribute("aria-pressed", String(isSaved));
  button.setAttribute(
    "aria-label",
    `${isSaved ? "Remove" : "Save"} ${work.title} ${isSaved ? "from" : "to"} Archive`
  );
}

export function createArchiveWorkAction(work, archiveState, announce = () => {}, className = "") {
  const button = document.createElement("button");
  button.className = ["text-action", "archive-work-action", className]
    .filter(Boolean)
    .join(" ");
  button.type = "button";
  button.textContent = "+";
  updateArchiveWorkAction(button, work, archiveState.isSaved(work.id));

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");

    try {
      const isSaved = await archiveState.toggle(work.id);
      updateArchiveWorkAction(button, work, isSaved);
    } catch {
      announce("ARCHIVE IS CURRENTLY UNAVAILABLE");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  });

  return button;
}
