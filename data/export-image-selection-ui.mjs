function text(value) { return typeof value === "string" ? value.trim() : ""; }

function eligibleImages(work) {
  return [...(work?.images || [])]
    .filter((image) => image?.id && image.uploadStatus === "ready")
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
}

export function createExportThumbnailSession({ resolveThumbnail = null, disposeThumbnail = () => {} } = {}) {
  const entries = new Map();
  let disposed = false;
  const imageId = (image) => typeof image?.id === "string" ? image.id.trim().toLowerCase() : "";

  return Object.freeze({
    state(image) { return entries.get(imageId(image)) || null; },
    resolve(image) {
      const id = imageId(image);
      if (!id || disposed) return Promise.resolve(null);
      const existing = entries.get(id);
      if (existing?.promise) return existing.promise;
      if (existing?.state === "ready") return Promise.resolve(existing.src);
      if (existing?.state === "failed") return Promise.resolve(null);
      const entry = { state: "pending", src: null, promise: null };
      entry.promise = Promise.resolve(typeof resolveThumbnail === "function" ? resolveThumbnail(image) : image?.src)
        .then((src) => {
          entry.state = typeof src === "string" && src ? "ready" : "failed";
          entry.src = entry.state === "ready" ? src : null;
          return entry.src;
        })
        .catch(() => { entry.state = "failed"; entry.src = null; return null; });
      entries.set(id, entry);
      return entry.promise;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      entries.forEach((entry) => { if (entry.state === "ready" && entry.src) disposeThumbnail(entry.src); });
      entries.clear();
    }
  });
}

/** Opens the export-local picker; confirmation is the only path into generation. */
export function openExportImageSelection(dialog, works, selection, { title = "SELECT IMAGES", onConfirm = () => {}, onChange = () => {}, resolveThumbnail = null, disposeThumbnail = () => {} } = {}) {
  const heading = dialog?.querySelector("[data-export-image-title]");
  const list = dialog?.querySelector("[data-export-image-list]");
  const close = dialog?.querySelector("[data-export-image-close]");
  const cancel = dialog?.querySelector("[data-export-image-cancel]");
  const confirm = dialog?.querySelector("[data-export-image-confirm]");
  const summary = dialog?.querySelector("[data-export-image-summary]");
  if (!dialog || !heading || !list || !close || !cancel || !confirm || !summary || !selection) return;
  heading.textContent = title;
  const thumbnails = createExportThumbnailSession({ resolveThumbnail, disposeThumbnail });
  let active = true;
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
        const thumbnailSlot = document.createElement("span");
        const thumbnail = document.createElement("img");
        const caption = document.createElement("span");
        label.className = "export-image-choice";
        input.type = "checkbox";
        input.checked = selection.ids(work.id).includes(image.id);
        input.setAttribute("aria-label", `Include ${text(work.title) || "untitled work"} image ${index + 1}`);
        input.addEventListener("change", () => { if (!selection.toggle(work.id, image.id)) input.checked = true; onChange(); render(); });
        thumbnail.alt = "";
        thumbnail.className = "export-image-thumbnail";
        thumbnail.hidden = true;
        thumbnailSlot.className = "export-image-thumbnail-slot";
        thumbnailSlot.append(thumbnail);
        caption.textContent = `${String(index + 1).padStart(2, "0")}${image.isCover ? " · COVER" : ""}`;
        label.append(input, thumbnailSlot, caption);
        list.append(label);
        const showThumbnail = (src) => {
          thumbnail.onload = () => { if (active) thumbnail.hidden = false; };
          thumbnail.onerror = () => { thumbnail.hidden = true; thumbnail.removeAttribute("src"); };
          thumbnail.src = src;
        };
        const state = thumbnails.state(image);
        if (state?.state === "ready" && state.src) {
          showThumbnail(state.src);
        } else if (state?.state !== "failed") {
          thumbnails.resolve(image).then((src) => {
            if (active && src) showThumbnail(src);
          });
        }
      });
    });
    const total = (works || []).reduce((count, work) => count + eligibleImages(work).length, 0);
    const selected = (works || []).reduce((count, work) => count + selection.count(work.id), 0);
    summary.textContent = `${(works || []).length} ${(works || []).length === 1 ? "WORK" : "WORKS"} · ${selected} / ${total} IMAGES`;
  };
  const dispose = () => { if (!active) return; active = false; thumbnails.dispose(); };
  const dismiss = () => dialog.close();
  close.onclick = dismiss;
  cancel.onclick = dismiss;
  confirm.onclick = () => { dialog.close(); onConfirm(); };
  dialog.onclose = dispose;
  render();
  dialog.showModal();
}
