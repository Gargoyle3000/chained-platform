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

  const imageInput =
    document.querySelector("#work-images-input");

  const imageValidation =
    document.querySelector("#work-image-validation");

  const imagePreviews =
    document.querySelector(".work-image-previews");

  const supportedImageTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);

  const maximumImageSize = 25 * 1024 * 1024;
  const selectedImages = [];
  let nextImageId = 0;


  function isSupportedImage(file) {
    if (file.type) {
      return supportedImageTypes.has(
        file.type.toLowerCase()
      );
    }

    return /\.(jpe?g|png|webp)$/i.test(file.name);
  }


  function formatFileSize(size) {
    if (size >= 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    }

    return `${Math.max(1, Math.ceil(size / 1024))} KB`;
  }


  function showImageValidation(messages) {
    if (!imageValidation) {
      return;
    }

    imageValidation.textContent = messages.join(" ");
    imageValidation.hidden = messages.length === 0;
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

    URL.revokeObjectURL(selectedImages[imageIndex].url);
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

    image.src = selectedImage.url;
    image.alt = `Preview of ${selectedImage.file.name}`;

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
    filename.textContent = selectedImage.file.name;

    filesize.className = "work-image-filesize";
    filesize.textContent = formatFileSize(selectedImage.file.size);

    details.append(filename, filesize);

    if (index > 0) {
      actions.append(
        createImageAction(
          "MAKE COVER",
          `Make ${selectedImage.file.name} the cover image`,
          () => makeCoverImage(selectedImage.id)
        )
      );
    }

    actions.append(
      createImageAction(
        "REMOVE",
        `Remove ${selectedImage.file.name}`,
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
        id: nextImageId,
        file,
        url: URL.createObjectURL(file)
      });

      nextImageId += 1;
    });

    showImageValidation(validationMessages);
    renderImagePreviews();

    if (imageInput) {
      imageInput.value = "";
    }
  }


  if (imageInput && imagePreviews && imageValidation) {
    imageInput.addEventListener("change", () => {
      addSelectedImages([...imageInput.files]);
    });

    window.addEventListener("beforeunload", () => {
      selectedImages.forEach((selectedImage) => {
        URL.revokeObjectURL(selectedImage.url);
      });
    });
  }


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
});
