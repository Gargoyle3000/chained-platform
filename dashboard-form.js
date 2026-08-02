document.addEventListener("DOMContentLoaded", () => {
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

  const workStore = window.ChainedWorkStore;
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
  const supportedImageTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);
  const maximumImageSize = 25 * 1024 * 1024;
  const selectedImages = [];
  let currentWorkId = new URLSearchParams(window.location.search).get("id");


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


  function makeCoverImage(imageId) {
    const imageIndex = selectedImages.findIndex(
      (selectedImage) => selectedImage.id === imageId
    );

    if (imageIndex <= 0) {
      return;
    }

    const [coverImage] = selectedImages.splice(imageIndex, 1);

    selectedImages.unshift(coverImage);
    renderImagePreviews();
  }


  function removeImage(imageId) {
    const imageIndex = selectedImages.findIndex(
      (selectedImage) => selectedImage.id === imageId
    );

    if (imageIndex === -1) {
      return;
    }

    releasePreviewUrl(selectedImages[imageIndex]);
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

    image.src = selectedImage.previewUrl;
    image.alt = `Preview of ${selectedImage.filename}`;

    metadata.className = "work-image-preview-meta";
    details.className = "work-image-preview-details";
    actions.className = "work-image-preview-actions";

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

    if (index > 0) {
      actions.append(
        createImageAction(
          "MAKE COVER",
          `Make ${selectedImage.filename} the cover image`,
          () => makeCoverImage(selectedImage.id)
        )
      );
    }

    actions.append(
      createImageAction(
        "REMOVE",
        `Remove ${selectedImage.filename}`,
        () => removeImage(selectedImage.id)
      )
    );

    metadata.append(details, actions);
    preview.append(image, metadata);

    return preview;
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
      if (!isSupportedImage(file)) {
        validationMessages.push(
          `${file.name} was not added: choose a JPG, PNG or WEBP image.`
        );
        return;
      }

      if (file.size > maximumImageSize) {
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
        previewUrl: ""
      });
    });

    showImageValidation(validationMessages);
    renderImagePreviews();

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


  function loadSelectedImages(images = []) {
    releaseAllPreviewUrls();
    selectedImages.splice(
      0,
      selectedImages.length,
      ...images
        .sort((first, second) => first.order - second.order)
        .map((image) => ({
          id: image.id,
          filename: image.filename,
          mimeType: image.mimeType,
          size: image.size,
          blob: image.blob || null,
          src: image.src || "",
          objectUrl: "",
          previewUrl: ""
        }))
    );
    renderImagePreviews();
  }


  function populateForm(work) {
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
    loadSelectedImages(work.images);
    updateMaterialPreview();
  }


  async function saveWork(visibility) {
    clearValidationState();
    showFormStatus("");

    const record = buildWorkRecord(visibility);
    const urlsAreValid = validateLinkedUrls(record);
    const publishFieldsAreValid =
      visibility !== "published" || validateForPublishing(record);

    if (!urlsAreValid || !publishFieldsAreValid) {
      return;
    }

    setVisibility(visibility);
    setEditorBusy(true);

    try {
      const savedWork = currentWorkId
        ? await workStore.updateWork(record)
        : await workStore.createWork(record);

      setEditMode(savedWork.id);
      loadSelectedImages(savedWork.images);
      showFormStatus(
        visibility === "published" ? "WORK PUBLISHED" : "DRAFT SAVED"
      );
    } catch (error) {
      console.error("Could not save the CHAINED work record.", error);
      showFormStatus("WORK COULD NOT BE SAVED", true);
    } finally {
      setEditorBusy(false);
    }
  }


  async function initialiseEditor() {
    if (!form || !workStore) {
      console.error("CHAINED work editor dependencies are unavailable.");
      showFormStatus("LOCAL WORK STORAGE IS UNAVAILABLE", true);
      return;
    }

    try {
      await workStore.initialiseDatabase();

      if (!currentWorkId) {
        return;
      }

      const work = await workStore.getWork(currentWorkId);

      if (!work) {
        showFormStatus("WORK COULD NOT BE FOUND", true);
        currentWorkId = null;
        return;
      }

      setEditMode(work.id);
      populateForm(work);
    } catch (error) {
      console.error("Could not initialise CHAINED work storage.", error);
      showFormStatus("LOCAL WORK STORAGE IS UNAVAILABLE", true);
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
    event.target.removeAttribute?.("aria-invalid");

    if (["work-type", "title", "year"].includes(event.target.name)) {
      setValidation(basicValidation);
    }

    if (["collaborator-url", "photo-credit-url"].includes(event.target.name)) {
      setValidation(contextValidation);
    }
  });

  window.addEventListener("beforeunload", releaseAllPreviewUrls);


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
