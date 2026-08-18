document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const {
    createPortfolioPlan,
    createPortfolioSourceCache,
    generateWithinBudget,
    portfolioFilename,
    renderPortfolioPdf,
    PortfolioExportError
  } = await import("./data/portfolio-export.mjs");
  const { createPortfolioSelectionState } = await import("./data/portfolio-selection-state.mjs");
  const { getWorkRepository } = await import("./data/work-repository.mjs");
  const { renderDashboardAccountIdentity } = await import("./data/dashboard-context.mjs");

  const selectionRoot = document.querySelector("#portfolio-work-selection");
  const orderRoot = document.querySelector("#portfolio-selected-works");
  const selectionCount = document.querySelector("#portfolio-selection-count");
  const titlePage = document.querySelector("#portfolio-title-page");
  const titleLabel = document.querySelector(".portfolio-title-label");
  const titleInput = document.querySelector("#portfolio-document-title");
  const artistNameElement = document.querySelector("#portfolio-artist-name");
  const generateButton = document.querySelector("#portfolio-generate");
  const statusElement = document.querySelector("#portfolio-export-status");
  const errorElement = document.querySelector("#portfolio-export-error");
  const fontUrl = "assets/fonts/CascadiaCode-Regular.ttf";
  let selection = createPortfolioSelectionState();
  let works = [];
  let profilesById = new Map();
  let repository = null;
  let fontBytesPromise = null;

  function setError(message = "") {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  }

  function setStatus(message = "") {
    statusElement.textContent = message;
  }

  function setBusy(isBusy) {
    generateButton.disabled = isBusy;
    generateButton.setAttribute("aria-busy", String(isBusy));
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function readyImageCount(work) {
    return (work.images || []).filter((image) => image.uploadStatus === "ready").length;
  }

  function selectedWorks() {
    const worksById = new Map(works.map((work) => [work.id, work]));
    return selection.ids().map((id) => worksById.get(id)).filter(Boolean);
  }

  function selectedArtist() {
    const ownerIds = [...new Set(selectedWorks().map((work) => work.ownerProfileId).filter(Boolean))];
    return ownerIds.length === 1 ? profilesById.get(ownerIds[0]) || null : null;
  }

  function updateArtistName() {
    const selected = selectedWorks();
    const artist = selectedArtist();
    artistNameElement.textContent = !selected.length
      ? "SELECT WORKS TO SET ARTIST NAME"
      : artist
        ? artist.name
        : "SELECT WORKS FROM ONE ARTIST PROFILE";
  }

  function createAction(label, ariaLabel, handler, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-action";
    button.textContent = label;
    button.setAttribute("aria-label", ariaLabel);
    button.disabled = disabled;
    button.addEventListener("click", handler);
    return button;
  }

  function workSummary(work) {
    return [
      text(work.year),
      text(work.format || work.workType).replaceAll("-", " ").toUpperCase(),
      `${readyImageCount(work)} IMAGE${readyImageCount(work) === 1 ? "" : "S"}`
    ].filter(Boolean).join(" · ");
  }

  function renderSelection() {
    selectionRoot.replaceChildren();
    works.forEach((work) => {
      const row = document.createElement("div");
      const input = document.createElement("input");
      const label = document.createElement("label");
      const title = document.createElement("strong");
      const meta = document.createElement("small");
      const imageCount = readyImageCount(work);
      const isSelected = selection.has(work.id);
      const inputId = `portfolio-work-${work.id}`;
      row.className = "portfolio-work-option";
      input.id = inputId;
      input.type = "checkbox";
      input.checked = isSelected;
      input.disabled = imageCount === 0;
      input.setAttribute("aria-label", `Include ${work.title || "untitled work"}`);
      input.addEventListener("change", () => {
        if (input.checked) selection.select(work.id);
        else selection.deselect(work.id);
        renderComposition();
      });
      label.htmlFor = inputId;
      title.textContent = text(work.title) || "UNTITLED";
      meta.textContent = workSummary(work);
      label.append(title, meta);
      row.append(input, label);
      if (!imageCount) {
        const unavailable = document.createElement("small");
        unavailable.dataset.noImages = "true";
        unavailable.textContent = "NO READY IMAGES";
        row.append(unavailable);
      }
      selectionRoot.append(row);
    });
  }

  function renderOrder() {
    orderRoot.replaceChildren();
    const selected = selectedWorks();
    if (!selected.length) {
      const empty = document.createElement("p");
      empty.className = "portfolio-export-empty";
      empty.textContent = "SELECT WORKS TO SET PORTFOLIO ORDER";
      orderRoot.append(empty);
      return;
    }
    selected.forEach((work, index) => {
      const row = document.createElement("article");
      const number = document.createElement("span");
      const title = document.createElement("div");
      const heading = document.createElement("strong");
      const meta = document.createElement("small");
      const actions = document.createElement("div");
      row.className = "portfolio-selected-work";
      number.className = "portfolio-selected-work-number";
      number.textContent = String(index + 1).padStart(2, "0");
      title.className = "portfolio-selected-work-title";
      heading.textContent = text(work.title) || "UNTITLED";
      meta.textContent = workSummary(work);
      actions.className = "portfolio-selected-work-actions";
      actions.append(
        createAction("[ MOVE UP ]", `Move ${work.title || "untitled work"} up`, () => {
          selection.move(work.id, -1);
          renderComposition();
        }, index === 0),
        createAction("[ MOVE DOWN ]", `Move ${work.title || "untitled work"} down`, () => {
          selection.move(work.id, 1);
          renderComposition();
        }, index === selected.length - 1),
        createAction("[ REMOVE ]", `Remove ${work.title || "untitled work"} from portfolio`, () => {
          selection.deselect(work.id);
          renderComposition();
        })
      );
      title.append(heading, meta);
      row.append(number, title, actions);
      orderRoot.append(row);
    });
  }

  function renderComposition() {
    renderSelection();
    renderOrder();
    updateArtistName();
    const count = selection.ids().length;
    selectionCount.textContent = `${count} SELECTED`;
  }

  function updateTitleControl() {
    const enabled = titlePage.checked;
    titleLabel.hidden = !enabled;
    titleInput.disabled = !enabled;
    if (!enabled) titleInput.value = "";
  }

  async function fontBytes() {
    if (!fontBytesPromise) {
      fontBytesPromise = fetch(fontUrl)
        .then((response) => {
          if (!response.ok) throw new Error("font unavailable");
          return response.arrayBuffer();
        });
    }
    return fontBytesPromise;
  }

  async function imageFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = url;
      });
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("image dimensions unavailable");
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("image encoding failed")), "image/jpeg", quality);
    });
  }

  async function prepareImage(image, tier, sourceCache) {
    let canvas = null;
    try {
      const source = await sourceCache.get(image);
      const decoded = await imageFromBlob(source);
      const scale = Math.min(1, tier.maxDimension / Math.max(decoded.naturalWidth, decoded.naturalHeight));
      canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(decoded.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(decoded.naturalHeight * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("canvas unavailable");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded, 0, 0, canvas.width, canvas.height);
      decoded.src = "";
      const encoded = await canvasBlob(canvas, tier.jpegQuality);
      return Object.freeze({ mimeType: "image/jpeg", bytes: new Uint8Array(await encoded.arrayBuffer()) });
    } catch {
      throw new PortfolioExportError("ONE OR MORE IMAGES COULD NOT BE PREPARED FOR EXPORT");
    } finally {
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
    }
  }

  function download(bytes, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function generatePortfolio() {
    setError();
    const selected = selectedWorks();
    const artist = selectedArtist();
    if (!selected.length) return setError("SELECT AT LEAST ONE WORK");
    if (!artist) return setError("SELECT WORKS FROM ONE ARTIST PROFILE");
    if (titlePage.checked && !text(titleInput.value)) return setError("ENTER A DOCUMENT TITLE OR TURN OFF TITLE PAGE");
    const plan = createPortfolioPlan(selected);
    if (!plan.works.length) return setError("SELECTED WORKS NEED AT LEAST ONE READY IMAGE");
    if (!window.PDFLib || !window.fontkit) return setError("PDF GENERATION IS CURRENTLY UNAVAILABLE");

    let sourceCache = null;
    setBusy(true);
    try {
      setStatus("PREPARING PORTFOLIO");
      const embeddedFont = await fontBytes();
      sourceCache = createPortfolioSourceCache(
        (images) => repository.media.downloadAuthorizedPrivateMedia(images, { purpose: "pdf_export", concurrency: 4 })
      );
      await sourceCache.prepare();
      await sourceCache.preload(plan.imagePages.map((entry) => entry.image));
      const result = await generateWithinBudget({
        renderTier: async (tier) => {
          setStatus(`GENERATING PORTFOLIO · ${tier.id.toUpperCase()}`);
          return renderPortfolioPdf({
            PDFLib: window.PDFLib,
            fontkit: window.fontkit,
            fontBytes: embeddedFont,
            plan,
            artistName: artist.name,
            documentTitle: text(titleInput.value),
            includeTitlePage: titlePage.checked,
            tier,
            loadPreparedImage: (image, tier) => prepareImage(image, tier, sourceCache)
          });
        }
      });
      download(result.bytes, portfolioFilename(artist.name, titleInput.value));
      setStatus(`PORTFOLIO READY · ${(result.size / (1024 * 1024)).toFixed(1)} MB · ${result.tier.id.toUpperCase()}`);
    } catch (error) {
      setStatus();
      setError(error instanceof PortfolioExportError ? error.message : "PDF GENERATION FAILED");
    } finally {
      setBusy(false);
      try { await sourceCache?.clear(); }
      finally { repository?.media?.urls.revokeAll(); }
    }
  }

  titlePage.addEventListener("change", updateTitleControl);
  generateButton.addEventListener("click", () => { void generatePortfolio(); });

  try {
    const selected = await getWorkRepository();
    repository = selected.repository;
    await repository.initialise();
    const profiles = repository.mode === "supabase" ? await repository.listManagedProfiles() : [];
    renderDashboardAccountIdentity(profiles, repository.mode === "prototype" ? "prototype" : "");
    if (!profiles.length) {
      setError("ARTIST PROFILE SETUP REQUIRED");
      generateButton.disabled = true;
      return;
    }
    profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    works = await repository.listWorks(profiles.map((profile) => profile.id));
    selection = createPortfolioSelectionState(works.filter((work) => readyImageCount(work) > 0).map((work) => work.id));
    if (!works.length) {
      const empty = document.createElement("p");
      empty.className = "portfolio-export-empty";
      empty.textContent = "NO WORKS ADDED";
      selectionRoot.replaceChildren(empty);
      orderRoot.replaceChildren();
      generateButton.disabled = true;
      return;
    }
    updateTitleControl();
    renderComposition();
  } catch {
    renderDashboardAccountIdentity([], "error");
    setError("PORTFOLIO EXPORT IS CURRENTLY UNAVAILABLE");
    generateButton.disabled = true;
  }

  window.addEventListener("beforeunload", () => repository?.media?.urls.revokeAll());
});
