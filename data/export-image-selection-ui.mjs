function text(value) { return typeof value === "string" ? value.trim() : ""; }

export function openExportImageSelection(dialog, work, selection, onChange = () => {}) {
  const title = dialog.querySelector("[data-export-image-title]");
  const list = dialog.querySelector("[data-export-image-list]");
  const close = dialog.querySelector("[data-export-image-close]");
  if (!dialog || !title || !list || !close || !work || !selection) return;
  title.textContent = text(work.title) || "UNTITLED";
  const render = () => {
    list.replaceChildren();
    [...(work.images || [])].filter((image) => image?.id && image.uploadStatus === "ready").sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0)).forEach((image, index) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      const thumbnail = document.createElement("img");
      const caption = document.createElement("span");
      label.className = "export-image-choice";
      input.type = "checkbox";
      input.checked = selection.ids(work.id).includes(image.id);
      input.setAttribute("aria-label", `Include image ${index + 1}`);
      input.addEventListener("change", () => { if (!selection.toggle(work.id, image.id)) input.checked = true; onChange(); render(); });
      caption.textContent = `${String(index + 1).padStart(2, "0")}${image.isCover ? " · COVER" : ""}`;
      thumbnail.src = image.src;
      thumbnail.alt = "";
      thumbnail.className = "export-image-thumbnail";
      label.append(input, thumbnail, caption);
      list.append(label);
    });
  };
  close.onclick = () => dialog.close();
  render();
  dialog.showModal();
}

export function openProjectExportImageSelection(dialog, works, selection, onChange = () => {}) {
  const title = dialog.querySelector("[data-export-image-title]");
  const list = dialog.querySelector("[data-export-image-list]");
  const close = dialog.querySelector("[data-export-image-close]");
  if (!dialog || !title || !list || !close || !selection) return;
  title.textContent = "PROJECT IMAGES";
  const render = () => {
    list.replaceChildren();
    (works || []).forEach((work) => {
      const heading = document.createElement("p");
      heading.className = "export-image-work-title";
      heading.textContent = text(work.title) || "UNTITLED";
      list.append(heading);
      [...(work.images || [])].filter((image) => image?.id && image.uploadStatus === "ready").sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0)).forEach((image, index) => {
        const label = document.createElement("label"); const input = document.createElement("input"); const thumbnail = document.createElement("img"); const caption = document.createElement("span");
        label.className = "export-image-choice"; input.type = "checkbox"; input.checked = selection.ids(work.id).includes(image.id);
        input.addEventListener("change", () => { if (!selection.toggle(work.id, image.id)) input.checked = true; onChange(); render(); });
        caption.textContent = `${String(index + 1).padStart(2, "0")}${image.isCover ? " · COVER" : ""}`;
        thumbnail.src = image.src; thumbnail.alt = ""; thumbnail.className = "export-image-thumbnail";
        label.append(input, thumbnail, caption); list.append(label);
      });
    });
  };
  close.onclick = () => dialog.close(); render(); dialog.showModal();
}
