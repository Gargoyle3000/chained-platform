document.addEventListener("DOMContentLoaded", async () => {
  const {
    getWorkRepository,
    getPrototypeWorkCount
  } = await import("./data/work-repository.mjs");
  const {
    publicationReadiness,
    createIdempotencyState,
    isValidWorkId
  } = await import("./data/work-mapping.mjs");
  const { validateImageFile } = await import("./data/work-media-service.mjs");
  const materialOptions = {
    primary: [
      "OIL PAINT",
      "ACRYLIC PAINT",
      "WATERCOLOUR",
      "GOUACHE",
      "INK",
      "GRAPHITE",
      "CHARCOAL",
      "PASTEL",
      "COLOURED PENCIL",
      "SPRAY PAINT",
      "ENAMEL PAINT",
      "PIGMENT",
      "DYE",
      "SCREEN PRINT",
      "LITHOGRAPHY",
      "ETCHING",
      "WOODCUT",
      "ARCHIVAL PIGMENT PRINT",
      "ANALOG PHOTOGRAPHY",
      "DIGITAL PHOTOGRAPHY",
      "COLLAGE",
      "ASSEMBLAGE",
      "CERAMIC",
      "SCULPTURE",
      "3D PRINT",
      "VIDEO",
      "ANIMATION",
      "SOUND",
      "PERFORMANCE",
      "LIGHT"
    ],

    support: [
      "CANVAS",
      "LINEN",
      "COTTON",
      "PAPER",
      "ARCHIVAL PAPER",
      "PHOTOGRAPHIC PAPER",
      "WOOD",
      "WOOD PANEL",
      "PLYWOOD",
      "MDF",
      "ALUMINIUM",
      "STEEL",
      "GLASS",
      "ACRYLIC GLASS",
      "CERAMIC",
      "PORCELAIN",
      "PLASTER",
      "CONCRETE",
      "RESIN",
      "TEXTILE",
      "LEATHER",
      "FOUND OBJECT",
      "WALL",
      "FLOOR",
      "VARIABLE SUPPORT"
    ],

    additional: [
      "PAPER",
      "WOOD",
      "PLYWOOD",
      "MDF",
      "EPOXY RESIN",
      "POLYESTER RESIN",
      "ACRYLIC GEL",
      "SILICONE",
      "PLASTER",
      "CONCRETE",
      "CEMENT",
      "CLAY",
      "CERAMIC",
      "PORCELAIN",
      "GLASS",
      "ACRYLIC GLASS",
      "ALUMINIUM",
      "STEEL",
      "STAINLESS STEEL",
      "BRASS",
      "COPPER",
      "CHAIN",
      "WIRE",
      "TEXTILE",
      "COTTON",
      "WOOL",
      "SILK",
      "LEATHER",
      "FAUX FUR",
      "PLASTIC",
      "PLA",
      "ABS",
      "PETG",
      "POLYURETHANE FOAM",
      "STYROFOAM",
      "RUBBER",
      "WAX",
      "PIGMENT",
      "GLITTER",
      "FAUX MOSS",
      "FOUND OBJECTS",
      "LED LIGHT",
      "ELECTRONICS",
      "MOTOR",
      "SOUND",
      "VIDEO",
      "INK",
      "OIL PAINT",
      "ACRYLIC PAINT",
      "SPRAY PAINT"
    ]
  };
Object.values(materialOptions).forEach((options) => {
  options.sort((a, b) => a.localeCompare(b));
});

  const comboboxes = [
    ...document.querySelectorAll(
      "[data-material-combobox]"
    )
  ];

  const materialPreview =
    document.querySelector(".work-material-preview");

  let workStore = null;
  let localSupabaseMode = false;
  const form = document.querySelector(".work-form");
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
  const prototypeNotice = document.querySelector("#work-prototype-notice");
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
      primaryMedium: formValue("primary-medium"),
      supportBase: formValue("support-base"),
      additionalMaterials: formValue("additional-materials"),
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


  function isValidOptionalUrl(value) {
    if (!value) {
      return true;
    }

    try {
      const url = new URL(value);

      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        Boolean(url.hostname)
      );
    } catch (error) {
      return false;
    }
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

    if (!isValidOptionalUrl(record.collaboratorUrl)) {
      invalidControls.push(form.elements.namedItem("collaborator-url"));
    }

    if (!isValidOptionalUrl(record.photoCreditUrl)) {
      invalidControls.push(form.elements.namedItem("photo-credit-url"));
    }

    invalidControls.forEach((control) => {
      control?.setAttribute("aria-invalid", "true");
    });

    if (invalidControls.length > 0) {
      setValidation(
        contextValidation,
        "OPTIONAL LINKS MUST USE A COMPLETE HTTP:// OR HTTPS:// URL."
      );
      invalidControls[0]?.focus();
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
      for (const image of mapped) {
        try {
          image.previewUrl = image.publicPath && currentVisibility() === "published"
            ? workStore.media.publicUrl(image.publicPath)
            : await workStore.media.privatePreview(image);
        } catch { image.previewUrl = ""; }
      }
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
      "primary-medium": work.primaryMedium,
      "support-base": work.supportBase,
      "additional-materials": work.additionalMaterials,
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
        showImageValidation([`${image.filename} COULD NOT BE ADDED.`]);
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
      localSupabaseMode = workStore.mode === "local-supabase";
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
        const prototypeCount = await getPrototypeWorkCount().catch(() => 0);
        if (prototypeCount) {
          prototypeNotice.textContent = `LOCAL PROTOTYPE WORKS HAVE NOT BEEN IMPORTED. (${prototypeCount})`;
          prototypeNotice.hidden = false;
        }
        const profiles = await workStore.listManagedProfiles();
        populateOwnerProfiles(profiles);
        if (!profiles.length) {
          showFormStatus("ARTIST PROFILE SETUP REQUIRED", true);
          setEditorBusy(true);
          return;
        }
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
      showFormStatus(localSupabaseMode ? "WORK IS CURRENTLY UNAVAILABLE" : "LOCAL WORK STORAGE IS UNAVAILABLE", true);
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


  function createOption(value) {
    const button = document.createElement("button");

    button.type = "button";
    button.dataset.materialOption = "";
    button.textContent = value;

    return button;
  }


  function populateCombobox(combobox) {
    const category =
      combobox.dataset.materialCategory;

    const menu = combobox.querySelector(
      ".material-combobox-menu"
    );

    const options =
      materialOptions[category] || [];

    menu.replaceChildren(
      ...options.map(createOption)
    );
  }


  function closeCombobox(combobox) {
    const input = combobox.querySelector("input");

    const menu = combobox.querySelector(
      ".material-combobox-menu"
    );

    combobox.classList.remove("is-open");
    menu.hidden = true;

    input.setAttribute(
      "aria-expanded",
      "false"
    );
  }


  function closeAllComboboxes(
    exceptCombobox = null
  ) {
    comboboxes.forEach((combobox) => {
      if (combobox !== exceptCombobox) {
        closeCombobox(combobox);
      }
    });
  }


  function openCombobox(combobox) {
    const input = combobox.querySelector("input");

    const menu = combobox.querySelector(
      ".material-combobox-menu"
    );

    closeAllComboboxes(combobox);

    combobox.classList.add("is-open");
    menu.hidden = false;

    input.setAttribute(
      "aria-expanded",
      "true"
    );
  }


  function filterOptions(combobox) {
    const input = combobox.querySelector("input");

    const searchTerm =
      input.value.trim().toLowerCase();

    const options = [
      ...combobox.querySelectorAll(
        "[data-material-option]"
      )
    ];

    options.forEach((option) => {
      const optionText =
        option.textContent.trim().toLowerCase();

      option.hidden =
        !optionText.includes(searchTerm);
    });
  }


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

    const primaryInput =
      document.querySelector(
        'input[name="primary-medium"]'
      );

    const supportInput =
      document.querySelector(
        'input[name="support-base"]'
      );

    const additionalInput =
      document.querySelector(
        'input[name="additional-materials"]'
      );


    const primary =
      primaryInput?.value.trim().toUpperCase() || "";

    const support =
      supportInput?.value.trim().toUpperCase() || "";

    const additional =
      additionalInput?.value
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean) || [];


    const materials = [
      primary,
      support,
      ...additional
    ].filter(Boolean);


    const previewLabel = document.createElement("span");

    previewLabel.textContent = "PUBLIC DISPLAY:";

    materialPreview.replaceChildren(
      previewLabel,
      document.createTextNode(
        ` ${formatMaterialList(materials)}`
      )
    );
  }


  comboboxes.forEach((combobox) => {
    populateCombobox(combobox);

    const input = combobox.querySelector("input");

    const toggle = combobox.querySelector(
      ".material-combobox-toggle"
    );


    toggle.addEventListener("click", () => {
      const isOpen =
        combobox.classList.contains("is-open");

      if (isOpen) {
        closeCombobox(combobox);
      } else {
        openCombobox(combobox);
        filterOptions(combobox);
        input.focus();
      }
    });


    input.addEventListener("focus", () => {
      openCombobox(combobox);
      filterOptions(combobox);
    });


    input.addEventListener("input", () => {
      openCombobox(combobox);
      filterOptions(combobox);
      updateMaterialPreview();
    });


    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeCombobox(combobox);
        input.blur();
      }
    });


    combobox.addEventListener("click", (event) => {
      const option = event.target.closest(
        "[data-material-option]"
      );

      if (!option) {
        return;
      }

      input.value =
        option.textContent.trim();

      closeCombobox(combobox);
      updateMaterialPreview();
      input.focus();
    });
  });


  document.addEventListener("click", (event) => {
    comboboxes.forEach((combobox) => {
      if (!combobox.contains(event.target)) {
        closeCombobox(combobox);
      }
    });
  });


  updateMaterialPreview();
  initialiseEditor();
});
