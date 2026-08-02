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


    materialPreview.innerHTML = `
      <span>PUBLIC DISPLAY:</span>
      ${formatMaterialList(materials)}
    `;
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