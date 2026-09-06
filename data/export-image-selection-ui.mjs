function text(value) { return typeof value === "string" ? value.trim() : ""; }

function eligibleImages(work) {
  return [...(work?.images || [])]
    .filter((image) => image?.id && image.uploadStatus === "ready")
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
}

/** Opens the export-local picker; confirmation is the only path into generation. */
export function openExportImageSelection(dialog, works, selection, { title = "SELECT IMAGES", onConfirm = () => {}, onChange = () => {}, resolveThumbnail = null } = {}) {
  const heading = dialog?.querySelector("[data-export-image-title]");
  const list = dialog?.querySelector("[data-export-image-list]");
  const close = dialog?.querySelector("[data-export-image-close]");
  const cancel = dialog?.querySelector("[data-export-image-cancel]");
  const confirm = dialog?.querySelector("[data-export-image-confirm]");
  const summary = dialog?.querySelector("[data-export-image-summary]");
  if (!dialog || !heading || !list || !close || !cancel || !confirm || !summary || !selection) return;
  heading.textContent = title;
  const render = () => {
    list.replaceChildren();
    (works || []).forEach((work) => {
      const workHeading = document.createElement("p");
      workHeading.className = "export-image-work-title";
      workHeading.textContent = text(work.title) || "UNTITLED";
      list.append(workHeading);
      eligibleImages(work).forEach((image, index) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        const thumbnail = document.createElement("img");
        const caption = document.createElement("span");
        label.className = "export-image-choice";
        input.type = "checkbox";
        input.checked = selection.ids(work.id).includes(image.id);
        input.setAttribute("aria-label", `Include ${text(work.title) || "untitled work"} image ${index + 1}`);
        input.addEventListener("change", () => { if (!selection.toggle(work.id, image.id)) input.checked = true; onChange(); render(); });
        thumbnail.src = "";
        thumbnail.alt = "";
        thumbnail.className = "export-image-thumbnail";
        caption.textContent = `${String(index + 1).padStart(2, "0")}${image.isCover ? " · COVER" : ""}`;
        label.append(input, thumbnail, caption);
        list.append(label);
        if (typeof resolveThumbnail === "function") {
          Promise.resolve(resolveThumbnail(image)).then((src) => {
            if (typeof src === "string" && src) thumbnail.src = src;
          }).catch(() => {});
        } else if (typeof image.src === "string" && image.src) thumbnail.src = image.src;
      });
    });
    const total = (works || []).reduce((count, work) => count + eligibleImages(work).length, 0);
    const selected = (works || []).reduce((count, work) => count + selection.count(work.id), 0);
    summary.textContent = `${(works || []).length} ${(works || []).length === 1 ? "WORK" : "WORKS"} · ${selected} / ${total} IMAGES`;
  };
  const dismiss = () => dialog.close();
  close.onclick = dismiss;
  cancel.onclick = dismiss;
  confirm.onclick = () => { dialog.close(); onConfirm(); };
  render();
  dialog.showModal();
}
