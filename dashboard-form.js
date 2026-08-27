import { FORMAT_DISCIPLINES } from "./data/work-format-disciplines.mjs";

document.addEventListener("DOMContentLoaded", async () => {
  const { getWorkRepository } = await import("./data/work-repository.mjs");
  const { renderDashboardAccountIdentity } =
    await import("./data/dashboard-context.mjs");
  const {
    publicationReadiness,
    createIdempotencyState,
    isValidWorkId
  } = await import("./data/work-mapping.mjs");
  const { validateImageFile } = await import("./data/work-media-service.mjs");
  const { normalizeHttpUrl } = await import("./data/url-normalization.mjs");
  const { materialDisplayValues } = await import("./data/material-terms.mjs");

  const materialPreview =
    document.querySelector(".work-material-preview");

  let workStore = null;
  let localSupabaseMode = false;
  const form = document.querySelector(".work-form");
  const formatSelect = form?.elements.namedItem("format");
  const materialsInput = form?.elements.namedItem("materials");
  const editorHeading = document.querySelector("#work-editor-heading");
  const editorContext = document.querySelector("#work-editor-context");
  const formStatus = document.querySelector("#work-form-status");
  const basicValidation = document.querySelector("#work-basic-validation");
  const contextValidation = document.querySelector(
    "#work-context-validation"
  );
  const saveDraftButton = document.querySelector(".work-form-save");
  const publishButton = document.querySelector(".work-form-publish");
  const imageInput = document.querySelector("#work-images-input");
  const imageValidation = document.querySelector("#work-image-validation");
  const imagePreviews = document.querySelector(".work-image-previews");
  const profileField = document.querySelector("#work-owner-field");
  const profileSelect = document.querySelector("#work-owner-profile");
  const unpublishButton = document.querySelector("#work-unpublish");
  const deleteWorkButton = document.querySelector("#work-delete");
  const publicWorkLink = document.querySelector("#work-public-link");
  const supportedImageTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);
  const maximumImageSize = 25 * 1024 * 1024;
  const selectedImages = [];
  let currentWorkId = new URLSearchParams(window.location.search).get("id");
  let expectedUpdatedAt = null;
  let selectedOwnerProfileId = null;
  let unsavedChanges = false;
  let imageOperationBusy = false;
  let currentWorkPublished = false;
  const publishAttempt = createIdempotencyState();
  const unpublishAttempt = createIdempotencyState();

  function populateFormatDisciplines() {
    if (!(formatSelect instanceof HTMLSelectElement)) return;

    const selected = formatSelect.value;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "SELECT MEDIUM";
    formatSelect.replaceChildren(
      placeholder,
      ...FORMAT_DISCIPLINES.map(({ value, label }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
      })
    );
    formatSelect.value = selected;
  }


  function createImageId() {
    const uniquePart =
      window.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return `image-${uniquePart}`;
  }


  function isSupportedImage(file) {
    if (file.type) {
      return supportedImageTypes.has(file.type.toLowerCase());
    }

    return /\.(jpe?g|png|webp)$/i.test(file.name);
  }


  function formatFileSize(size) {
    if (size >= 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    }

    if (size >= 1024) {
      return `${Math.ceil(size / 1024)} KB`;
    }

    return `${size} B`;
  }


  function setValidation(element, message = "") {
    if (!element) {
      return;
    }

    element.textContent = message;
    element.hidden = !message;
  }


  function showImageValidation(messages) {
    setValidation(imageValidation, messages.join(" "));
  }


  function showFormStatus(message, isError = false) {
    if (!formStatus) {
      return;
    }

    formStatus.textContent = message;
    formStatus.hidden = !message;
    formStatus.classList.toggle("is-error", isError);
  }


  function setEditorBusy(isBusy) {
    if (saveDraftButton) {
      saveDraftButton.disabled = isBusy;
    }

    if (publishButton) {
      publishButton.disabled = isBusy;
    }
    if (unpublishButton) unpublishButton.disabled = isBusy;
    if (deleteWorkButton) deleteWorkButton.disabled = isBusy;
    if (imageInput) imageInput.disabled = isBusy || currentWorkPublished;
  }


  function releasePreviewUrl(selectedImage) {
    if (!selectedImage?.objectUrl) {
      return;
    }

    URL.revokeObjectURL(selectedImage.objectUrl);
    selectedImage.objectUrl = "";
    selectedImage.previewUrl = "";
  }


  function releaseAllPreviewUrls() {
    selectedImages.forEach(releasePreviewUrl);
  }


  function preparePreviewUrl(selectedImage) {
    if (selectedImage.serverRecord) {
      return;
    }
    releasePreviewUrl(selectedImage);

    if (selectedImage.blob) {
      selectedImage.objectUrl = URL.createObjectURL(selectedImage.blob);
      selectedImage.previewUrl = selectedImage.objectUrl;
      return;
    }

    selectedImage.previewUrl = selectedImage.src;
  }


  function createImageAction(label, ariaLabel, onClick) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "work-image-preview-action";
    button.textContent = `[ ${label} ]`;
    button.setAttribute("aria-label", ariaLabel);
    button.addEventListener("click", onClick);

    return button;
  }


  async function makeCoverImage(imageId) {
    const imageIndex = selectedImages.findIndex(
      (selectedImage) => selectedImage.id === imageId
    );

    if (imageIndex <= 0) {
      return;
    }

    const [coverImage] = selectedImages.splice(imageIndex, 1);

    selectedImages.unshift(coverImage);
    renderImagePreviews();
    if (localSupabaseMode && currentWorkId && coverImage.serverRecord) {
      try {
        setEditorBusy(true);
        const images = await workStore.reorderImages(currentWorkId, selectedImages.map((image) => image.id), imageId);
        await loadSelectedImages(images);
      } catch { showFormStatus("IMAGE ORDER COULD NOT BE SAVED", true); }
      finally { setEditorBusy(false); }
    }
  }


  async function removeImage(imageId) {
    const imageIndex = selectedImages.findIndex(
      (selectedImage) => selectedImage.id === imageId
    );

    if (imageIndex === -1) {
      return;
    }

    const target = selectedImages[imageIndex];
    if (localSupabaseMode && target.serverRecord) {
      if (!window.confirm("REMOVE THIS IMAGE?")) return;
      try {
        setEditorBusy(true);
        const result = await workStore.media.deleteImage(imageId);
        showFormStatus(result.cleanup_status === "cleanup_pending" ? "IMAGE HIDDEN · CLEANUP PENDING" : "IMAGE REMOVED");
        await reloadCurrentWork();
      } catch { showFormStatus("IMAGE COULD NOT BE REMOVED", true); }
      finally { setEditorBusy(false); }
      return;
    }
    releasePreviewUrl(target);
    selectedImages.splice(imageIndex, 1);

    if (imageInput) {
      imageInput.value = "";
    }

    if (selectedImages.length === 0) {
      showImageValidation([]);
    }

    renderImagePreviews();
  }


  function createImagePreview(selectedImage, index) {
    const preview = document.createElement("article");
    const image = document.createElement("img");
    const metadata = document.createElement("div");
    const details = document.createElement("div");
    const filename = document.createElement("p");
    const filesize = document.createElement("p");
    const actions = document.createElement("div");

    preview.className = "work-image-preview";

    if (selectedImage.previewUrl) image.src = selectedImage.previewUrl;
    image.alt = `Preview of ${selectedImage.filename}`;

    metadata.className = "work-image-preview-meta";
    details.className = "work-image-preview-details";
    actions.className = "work-image-preview-actions";
    const mediaLocked = localSupabaseMode && selectedImage.serverRecord && currentWorkPublished;

    if (index === 0) {
      const coverLabel = document.createElement("p");

      coverLabel.className = "work-image-cover";
      coverLabel.textContent = "COVER IMAGE";
      details.append(coverLabel);
    }

    filename.className = "work-image-filename";
    filename.textContent = selectedImage.filename;

    filesize.className = "work-image-filesize";
    filesize.textContent = formatFileSize(selectedImage.size);

    details.append(filename, filesize);

    if (selectedImage.uploadStatus && selectedImage.uploadStatus !== "ready") {
      const state = document.createElement("p");
      state.className = "work-image-upload-state";
      state.textContent = selectedImage.uploadStatus.replaceAll("_", " ").toUpperCase();
      details.append(state);
    }

    if (index > 0 && !mediaLocked) {
      actions.append(
        createImageAction(
          "MAKE COVER",
          `Make ${selectedImage.filename} the cover image`,
          () => makeCoverImage(selectedImage.id)
        )
      );
    }

    if (localSupabaseMode && selectedImage.serverRecord && !mediaLocked) {
      if (["reserved", "failed"].includes(selectedImage.uploadStatus)) {
        actions.append(createImageAction("RETRY VERIFY", `Retry verification for ${selectedImage.filename}`, () => retryImageVerification(selectedImage.id)));
      }
      if (index > 0) actions.append(createImageAction("MOVE UP", `Move ${selectedImage.filename} up`, () => moveImage(selectedImage.id, -1)));
      if (index < selectedImages.length - 1) actions.append(createImageAction("MOVE DOWN", `Move ${selectedImage.filename} down`, () => moveImage(selectedImage.id, 1)));
    }

    if (!mediaLocked) {
      actions.append(
        createImageAction(
          "REMOVE",
          `Remove ${selectedImage.filename}`,
          () => removeImage(selectedImage.id)
        )
      );
    }

    metadata.append(details, actions);
    if (selectedImage.previewUrl) {
      preview.append(image);
    } else {
      const unavailable = document.createElement("p");
      unavailable.className = "work-image-preview-unavailable";
      unavailable.textContent = "PREVIEW UNAVAILABLE";
      preview.append(unavailable);
    }
    preview.append(metadata);

    return preview;
  }

  async function retryImageVerification(imageId) {
    try {
      setEditorBusy(true);
      showFormStatus("VERIFYING");
      await workStore.media.finalize(imageId);
      await reloadCurrentWork();
      showFormStatus("READY");
    } catch { showFormStatus("IMAGE VERIFICATION COULD NOT BE COMPLETED", true); }
    finally { setEditorBusy(false); }
  }

  async function moveImage(imageId, offset) {
    const index = selectedImages.findIndex((image) => image.id === imageId);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= selectedImages.length) return;
    [selectedImages[index], selectedImages[next]] = [selectedImages[next], selectedImages[index]];
    renderImagePreviews();
    try {
      setEditorBusy(true);
      const cover = selectedImages.find((image) => image.isCover) || selectedImages[0];
      const images = await workStore.reorderImages(currentWorkId, selectedImages.map((image) => image.id), cover.id);
      await loadSelectedImages(images);
    } catch { showFormStatus("IMAGE ORDER COULD NOT BE SAVED", true); }
    finally { setEditorBusy(false); }
  }


  function renderImagePreviews() {
    if (!imagePreviews) {
      return;
    }

    selectedImages.forEach(preparePreviewUrl);
    imagePreviews.replaceChildren(
      ...selectedImages.map(createImagePreview)
    );
  }


  function addSelectedImages(files) {
    const validationMessages = [];

    files.forEach((file) => {
      if (localSupabaseMode) {
        try { validateImageFile(file); }
        catch (error) { validationMessages.push(`${file.name} was not added: ${error.message}.`); return; }
      } else if (!isSupportedImage(file)) {
        validationMessages.push(
          `${file.name} was not added: choose a JPG, PNG or WEBP image.`
        );
        return;
      }

      if (!localSupabaseMode && file.size > maximumImageSize) {
        validationMessages.push(
          `${file.name} was not added: the maximum file size is 25 MB.`
        );
        return;
      }

      selectedImages.push({
        id: createImageId(),
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        blob: file,
        src: "",
        objectUrl: "",
        previewUrl: "",
        uploadStatus: localSupabaseMode ? "selected" : "ready",
        serverRecord: false,
        isCover: selectedImages.length === 0
      });
    });

    showImageValidation(validationMessages);
    renderImagePreviews();
    if (files.length > validationMessages.length) unsavedChanges = true;

    if (imageInput) {
      imageInput.value = "";
    }
  }


  function formValue(name) {
    const control = form?.elements.namedItem(name);

    return typeof control?.value === "string" ? control.value.trim() : "";
  }


  function setFormValue(name, value) {
    const control = form?.elements.namedItem(name);

    if (control && "value" in control) {
      control.value = value || "";
    }
  }


  function serialiseImages() {
    return selectedImages.map((selectedImage, index) => ({
      id: selectedImage.id,
      filename: selectedImage.filename,
      mimeType: selectedImage.mimeType,
      size: selectedImage.size,
      blob: selectedImage.blob || null,
      src: selectedImage.src || "",
      order: index,
      isCover: index === 0
    }));
  }


  function buildWorkRecord(visibility) {
    return {
      id: currentWorkId || undefined,
      title: formValue("title"),
      year: formValue("year"),
      workType: formValue("work-type"),
      format: formValue("format"),
      materials: formValue("materials"),
      height: formValue("height"),
      width: formValue("width"),
      depth: formValue("depth"),
      dimensionUnit: formValue("dimension-unit") || "cm",
      duration: formValue("duration"),
      edition: formValue("edition"),
      description: formValue("description"),
      collaboratorName: formValue("collaborator-name"),
      collaboratorUrl: formValue("collaborator-url"),
      photoCreditName: formValue("photo-credit"),
      photoCreditUrl: formValue("photo-credit-url"),
      visibility,
      images: serialiseImages()
    };
  }


  function clearValidationState() {
    setValidation(basicValidation);
    setValidation(contextValidation);
    showImageValidation([]);

    form?.querySelectorAll('[aria-invalid="true"]').forEach((control) => {
      control.removeAttribute("aria-invalid");
    });
  }


  function validateLinkedUrls(record) {
    const invalidControls = [];
    const fields = [
      ["collaboratorUrl", "collaborator-url", "COLLABORATOR LINK"],
      ["photoCreditUrl", "photo-credit-url", "PHOTO CREDIT LINK"]
    ];

    fields.forEach(([property, name, label]) => {
      try {
        const normalized = normalizeHttpUrl(record[property]);
        record[property] = normalized;
        setFormValue(name, normalized);
      } catch {
        invalidControls.push([form.elements.namedItem(name), label]);
      }
    });

    invalidControls.forEach(([control]) => {
      control?.setAttribute("aria-invalid", "true");
    });

    if (invalidControls.length > 0) {
      setValidation(
        contextValidation,
        `${invalidControls[0][1]} MUST BE A VALID HTTP OR HTTPS URL.`
      );
      invalidControls[0][0]?.focus();
      return false;
    }

    return true;
  }


  function validateForPublishing(record) {
    const missingControls = [];
    const workType = form.elements.namedItem("work-type");
    const title = form.elements.namedItem("title");
    const year = form.elements.namedItem("year");
    const numericYear = Number(record.year);

    if (!record.workType) {
      missingControls.push(workType);
    }

    if (!record.title) {
      missingControls.push(title);
    }

    if (
      !record.year ||
      !Number.isInteger(numericYear) ||
      numericYear < 1900 ||
      numericYear > 2100
    ) {
      missingControls.push(year);
    }

    missingControls.forEach((control) => {
      control?.setAttribute("aria-invalid", "true");
    });

    if (missingControls.length > 0) {
      setValidation(
        basicValidation,
        "WORK TYPE, TITLE, AND A YEAR FROM 1900 TO 2100 ARE REQUIRED TO PUBLISH."
      );
    }

    if (record.images.length === 0) {
      showImageValidation([
        "Add at least one image before publishing this work."
      ]);
      imageInput?.setAttribute("aria-invalid", "true");
    }

    if (missingControls.length > 0) {
      missingControls[0]?.focus();
    } else if (record.images.length === 0) {
      imageInput?.focus();
    }

    return missingControls.length === 0 && record.images.length > 0;
  }


  function setVisibility(visibility) {
    const radio = form?.querySelector(
      `input[name="visibility"][value="${visibility}"]`
    );

    if (radio) {
      radio.checked = true;
    }
  }


  function setEditMode(workId) {
    currentWorkId = workId;
    editorHeading.textContent = "EDIT WORK";
    editorContext.textContent = "WORKS / EDIT WORK";
    document.title = "Edit Work — CHAINED Dashboard";

    const url = new URL(window.location.href);

    url.searchParams.set("id", workId);
    window.history.replaceState({}, "", url);
  }


  async function loadSelectedImages(images = []) {
    releaseAllPreviewUrls();
    const mapped = images
      .sort((first, second) => first.order - second.order)
      .map((image) => ({
        id: image.id,
        filename: image.filename,
        mimeType: image.mimeType,
        size: image.size,
        blob: image.blob || null,
        src: image.src || "",
        objectUrl: "",
        previewUrl: "",
        uploadStatus: image.uploadStatus || "ready",
        serverRecord: localSupabaseMode,
        privatePath: image.privatePath || null,
        publicPath: image.publicPath || null,
        isCover: image.isCover === true
      }));
    if (localSupabaseMode) {
      const privateImages = mapped.filter((image) => !(image.publicPath && currentVisibility() === "published"));
      let privatePreviews = new Map();
      try { privatePreviews = await workStore.media.privatePreviewBatch(privateImages); }
      catch { privatePreviews = new Map(); }
      mapped.forEach((image) => {
        image.previewUrl = image.publicPath && currentVisibility() === "published"
          ? workStore.media.publicUrl(image.publicPath)
          : privatePreviews.get(String(image.id).toLowerCase()) || "";
      });
    }
    selectedImages.splice(
      0,
      selectedImages.length,
      ...mapped
    );
    renderImagePreviews();
  }

  function currentVisibility() {
    return form?.querySelector('input[name="visibility"]:checked')?.value || "draft";
  }


  async function populateForm(work) {
    const values = {
      "work-type": work.workType,
      title: work.title,
      year: work.year,
      format: work.format,
      materials: work.materials || materialDisplayValues([
        work.primaryMedium,
        work.supportBase,
        work.additionalMaterials
      ]).join(", "),
      height: work.height,
      width: work.width,
      depth: work.depth,
      "dimension-unit": work.dimensionUnit,
      duration: work.duration,
      edition: work.edition,
      description: work.description,
      "collaborator-name": work.collaboratorName,
      "collaborator-url": work.collaboratorUrl,
      "photo-credit": work.photoCreditName,
      "photo-credit-url": work.photoCreditUrl
    };

    Object.entries(values).forEach(([name, value]) => {
      setFormValue(name, value);
    });

    setVisibility(work.visibility);
    expectedUpdatedAt = work.updatedAt;
    updateLifecycleControls(work);
    await loadSelectedImages(work.images);
    unsavedChanges = false;
    updateMaterialPreview();
  }

  function updateLifecycleControls(work) {
    const published = work?.visibility === "published";
    currentWorkPublished = published;
    if (imageInput) imageInput.disabled = published;
    if (unpublishButton) unpublishButton.hidden = !published;
    if (deleteWorkButton) deleteWorkButton.hidden = !work || published;
    if (publicWorkLink) {
      publicWorkLink.hidden = !published;
      if (published) publicWorkLink.href = `artwork.html?id=${encodeURIComponent(work.id)}`;
    }
    if (publishButton) publishButton.hidden = published;
  }


  async function uploadPendingImages(workId) {
    const pending = selectedImages.filter((image) => !image.serverRecord && image.blob);
    let failure = null;
    for (const image of pending) {
      if (imageOperationBusy) break;
      imageOperationBusy = true;
      try {
        await workStore.media.upload(workId, image.blob, selectedImages.indexOf(image) === 0, (stage) => {
          image.uploadStatus = stage.toLowerCase();
          showFormStatus(stage);
          renderImagePreviews();
        });
      } catch (error) {
        failure = error;
        image.uploadStatus = "failed";
        showImageValidation([`${image.filename} COULD NOT BE ADDED: ${error.message}`]);
      } finally { imageOperationBusy = false; }
    }
    await reloadCurrentWork();
    if (failure) throw failure;
  }

  async function persistMetadata(record) {
    const saved = currentWorkId
      ? await workStore.updateWork(record, expectedUpdatedAt)
      : await workStore.createWork(record, selectedOwnerProfileId);
    setEditMode(saved.id);
    expectedUpdatedAt = saved.updatedAt;
    unsavedChanges = false;
    return saved;
  }

  async function saveWork(visibility) {
    clearValidationState();
    showFormStatus("");

    const record = buildWorkRecord(visibility);
    const urlsAreValid = validateLinkedUrls(record);
    const publishFieldsAreValid = visibility !== "published" || validateForPublishing(record);

    if (!urlsAreValid || !publishFieldsAreValid) {
      return;
    }

    setEditorBusy(true);

    try {
      if (!localSupabaseMode) {
        setVisibility(visibility);
        const savedWork = currentWorkId ? await workStore.updateWork(record) : await workStore.createWork(record);
        setEditMode(savedWork.id);
        await loadSelectedImages(savedWork.images);
        showFormStatus(visibility === "published" ? "WORK PUBLISHED" : "DRAFT SAVED");
        return;
      }

      showFormStatus(visibility === "published" ? "PREPARING" : "SAVING DRAFT");
      await persistMetadata(record);
      if (selectedImages.some((image) => !image.serverRecord && image.blob)) await uploadPendingImages(currentWorkId);
      let authoritative = await workStore.getWork(currentWorkId);
      await populateForm(authoritative);
      if (visibility === "published") {
        const readiness = publicationReadiness(authoritative);
        if (!readiness.ready) {
          const message = readiness.reasons.includes("unready_image") ? "ALL IMAGES MUST BE READY BEFORE PUBLISHING" : readiness.reasons.includes("missing_cover") ? "ONE COVER IMAGE IS REQUIRED" : "REQUIRED WORK DETAILS AND ONE IMAGE ARE NEEDED";
          showFormStatus(message, true);
          return;
        }
        showFormStatus("PUBLISHING");
        await workStore.media.publish(currentWorkId, publishAttempt.current());
        publishAttempt.reset();
        authoritative = await workStore.getWork(currentWorkId);
        await populateForm(authoritative);
        showFormStatus("PUBLISHED");
      } else showFormStatus("DRAFT SAVED");
    } catch (error) {
      showFormStatus(error?.code === "conflict" ? "THIS WORK CHANGED ELSEWHERE · RELOAD BEFORE SAVING" : error?.message === "YEAR MUST BE BETWEEN 1900 AND 2100" ? error.message : "WORK COULD NOT BE SAVED", true);
    } finally {
      setEditorBusy(false);
    }
  }

  async function reloadCurrentWork() {
    if (!currentWorkId) return null;
    const work = await workStore.getWork(currentWorkId);
    if (!work) throw new Error("Work unavailable.");
    await populateForm(work);
    return work;
  }

  function populateOwnerProfiles(profiles) {
    profileSelect.replaceChildren(...profiles.map((profile) => {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.name;
      return option;
    }));
    profileField.hidden = profiles.length <= 1;
    if (profiles.length) {
      selectedOwnerProfileId = profiles[0].id;
      profileSelect.value = selectedOwnerProfileId;
    }
  }


  async function initialiseEditor() {
    try {
      const selected = await getWorkRepository();
      workStore = selected.repository;
      localSupabaseMode = workStore.mode === "supabase";
      await workStore.initialise();

      if (localSupabaseMode) {
        imageInput.accept = "image/jpeg,image/png,image/webp,image/avif";
        const requirements = document.querySelector("#work-image-requirements");
        if (requirements) requirements.textContent = "JPEG, PNG, WEBP OR AVIF · MAX 50 MB PER IMAGE";
        if (currentWorkId && !isValidWorkId(currentWorkId)) {
          showFormStatus("WORK COULD NOT BE FOUND", true);
          form.querySelectorAll("input, select, textarea, button").forEach((control) => { control.disabled = true; });
          return;
        }
        const profiles = await workStore.listManagedProfiles();
        populateOwnerProfiles(profiles);
        renderDashboardAccountIdentity(profiles);
        if (!profiles.length) {
          showFormStatus("ARTIST PROFILE SETUP REQUIRED", true);
          setEditorBusy(true);
          return;
        }
      } else {
        renderDashboardAccountIdentity([], "prototype");
      }
      if (!currentWorkId) {
        updateLifecycleControls(null);
        return;
      }

      const work = await workStore.getWork(currentWorkId);

      if (!work) {
        showFormStatus("WORK COULD NOT BE FOUND", true);
        currentWorkId = null;
        return;
      }

      setEditMode(work.id);
      selectedOwnerProfileId = work.ownerProfileId || selectedOwnerProfileId;
      if (profileSelect) profileSelect.value = selectedOwnerProfileId;
      if (localSupabaseMode) profileSelect.disabled = true;
      await populateForm(work);
    } catch {
      renderDashboardAccountIdentity([], "error");
      showFormStatus(
        localSupabaseMode
          ? "WORK IS CURRENTLY UNAVAILABLE"
          : "WORK STORAGE IS UNAVAILABLE",
        true
      );
    }
  }


  if (imageInput && imagePreviews && imageValidation) {
    imageInput.addEventListener("change", () => {
      addSelectedImages([...imageInput.files]);
    });
  }

  saveDraftButton?.addEventListener("click", () => {
    saveWork("draft");
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveWork("published");
  });

  form?.addEventListener("input", (event) => {
    unsavedChanges = true;
    event.target.removeAttribute?.("aria-invalid");

    if (["work-type", "title", "year"].includes(event.target.name)) {
      setValidation(basicValidation);
    }

    if (["collaborator-url", "photo-credit-url"].includes(event.target.name)) {
      setValidation(contextValidation);
    }
  });

  profileSelect?.addEventListener("change", () => {
    if (!currentWorkId) selectedOwnerProfileId = profileSelect.value;
  });

  unpublishButton?.addEventListener("click", async () => {
    if (!currentWorkId || !window.confirm("UNPUBLISH THIS WORK?")) return;
    try {
      setEditorBusy(true);
      showFormStatus("UNPUBLISHING");
      const result = await workStore.media.unpublish(currentWorkId, unpublishAttempt.current());
      unpublishAttempt.reset();
      await reloadCurrentWork();
      showFormStatus(result.cleanup_status === "cleanup_pending" ? "WORK HIDDEN · PUBLIC CLEANUP PENDING" : "WORK UNPUBLISHED");
    } catch { showFormStatus("WORK COULD NOT BE UNPUBLISHED", true); }
    finally { setEditorBusy(false); }
  });

  deleteWorkButton?.addEventListener("click", async () => {
    if (!currentWorkId || !window.confirm("DELETE THIS DRAFT WORK?")) return;
    try {
      setEditorBusy(true);
      await workStore.deleteWork(currentWorkId);
      unsavedChanges = false;
      window.location.assign("dashboard-works.html");
    } catch { showFormStatus("WORK COULD NOT BE DELETED", true); setEditorBusy(false); }
  });

  window.addEventListener("beforeunload", (event) => {
    releaseAllPreviewUrls();
    workStore?.media?.urls.revokeAll();
    if (unsavedChanges) { event.preventDefault(); event.returnValue = ""; }
  });


  function formatMaterialList(values) {
    if (values.length === 0) {
      return "MATERIALS WILL APPEAR HERE";
    }

    if (values.length === 1) {
      return values[0];
    }

    if (values.length === 2) {
      return `${values[0]} AND ${values[1]}`;
    }

    return (
      `${values.slice(0, -1).join(", ")} ` +
      `AND ${values.at(-1)}`
    );
  }


  function updateMaterialPreview() {
    if (!materialPreview) {
      return;
    }

    const materials = materialDisplayValues(materialsInput?.value);


    const previewLabel = document.createElement("span");

    previewLabel.textContent = "PUBLIC DISPLAY:";

    materialPreview.replaceChildren(
      previewLabel,
      document.createTextNode(
        ` ${formatMaterialList(materials)}`
      )
    );
  }


  populateFormatDisciplines();
  materialsInput?.addEventListener("input", updateMaterialPreview);
  updateMaterialPreview();
  initialiseEditor();
});
