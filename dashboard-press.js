document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const { getPressRepository } =
    await import("./data/press-repository.mjs");

  const { normalizeHttpUrl } =
    await import("./data/url-normalization.mjs");

  const { renderDashboardAccountIdentity } =
    await import("./data/dashboard-context.mjs");

  const list =
    document.querySelector("#dashboard-press-list");

  const addForm =
    document.querySelector("#dashboard-press-add-form");

  const errorElement =
    document.querySelector("#dashboard-press-error");

  const noticeElement =
    document.querySelector("#dashboard-press-notice");

  const profileField =
    document.querySelector("#dashboard-press-profile-field");

  const profileSelect =
    document.querySelector("#dashboard-press-profile");

  let repository;
  let profiles = [];
  let selectedProfileId = null;

  function setError(message = "") {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  }

  function setNotice(message = "") {
    noticeElement.textContent = message;
    noticeElement.hidden = !message;
  }

  function clean(value) {
    return String(value || "").trim();
  }

  function yearScore(value) {
    const years =
      clean(value).match(/\d{4}/g) || [];

    if (!years.length) return 0;

    return Math.max(
      ...years.map((year) =>
        Number.parseInt(year, 10)
      )
    );
  }

  function sortItems(items) {
    return [...items].sort((first, second) => {
      const difference =
        yearScore(second.yearLabel) -
        yearScore(first.yearLabel);

      if (difference) return difference;

      const secondCreated =
        new Date(second.createdAt || 0).getTime();

      const firstCreated =
        new Date(first.createdAt || 0).getTime();

      if (secondCreated !== firstCreated) {
        return secondCreated - firstCreated;
      }

      return String(first.id).localeCompare(
        String(second.id)
      );
    });
  }

  function createTextButton(text, ariaLabel = "") {
    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "text-action";
    button.textContent = `[ ${text} ]`;

    if (ariaLabel) {
      button.setAttribute(
        "aria-label",
        ariaLabel
      );
    }

    return button;
  }

  function readForm(form) {
    const data = new FormData(form);

    return {
      yearLabel: clean(data.get("year")),
      title: clean(data.get("title")),
      author: clean(data.get("author")),
      body: clean(data.get("body")),
      url: normalizeHttpUrl(data.get("url"))
    };
  }

  function validate(record, form) {
    if (!record.yearLabel) {
      setError("ERROR: PLEASE FILL IN THE YEAR!");
      form.elements.year.focus();
      return false;
    }

    if (!record.title) {
      setError("ERROR: PLEASE FILL IN THE TITLE!");
      form.elements.title.focus();
      return false;
    }

    return true;
  }

  async function reload() {
    if (!selectedProfileId) return;

    const items =
      await repository.listPressItems([
        selectedProfileId
      ]);

    renderItems(sortItems(items));
  }

  function createVisibilityControls(item) {
    const container =
      document.createElement("div");

    const show =
      createTextButton(
        "SHOW",
        `Show ${item.title}`
      );

    const hide =
      createTextButton(
        "HIDE",
        `Hide ${item.title}`
      );

    container.className =
      "dashboard-press-visibility";

    show.classList.toggle(
      "is-active",
      item.isVisible
    );

    hide.classList.toggle(
      "is-active",
      !item.isVisible
    );

    show.disabled = item.isVisible;
    hide.disabled = !item.isVisible;

    show.addEventListener(
      "click",
      async () => {
        setError();
        show.disabled = true;
        hide.disabled = true;

        try {
          await repository.updatePressVisibility(
            item.id,
            true,
            item.updatedAt
          );

          await reload();
        } catch (error) {
          setError(
            error?.message ||
            "PRESS VISIBILITY COULD NOT BE UPDATED"
          );

          show.disabled = false;
          hide.disabled = false;
        }
      }
    );

    hide.addEventListener(
      "click",
      async () => {
        setError();
        show.disabled = true;
        hide.disabled = true;

        try {
          await repository.updatePressVisibility(
            item.id,
            false,
            item.updatedAt
          );

          await reload();
        } catch (error) {
          setError(
            error?.message ||
            "PRESS VISIBILITY COULD NOT BE UPDATED"
          );

          show.disabled = false;
          hide.disabled = false;
        }
      }
    );

    container.append(show, hide);

    return container;
  }

  function createEditor(item, row) {
    const form =
      document.createElement("form");

    form.className =
      "dashboard-press-form dashboard-press-edit-form";

    form.noValidate = true;

    const fields =
      document.createElement("div");

    fields.className =
      "dashboard-press-fields";

    fields.innerHTML = `
      <label>
        <span>YEAR</span>
        <input
          name="year"
          type="text"
          maxlength="40"
          required>
      </label>

      <label>
        <span>TITLE</span>
        <input
          name="title"
          type="text"
          maxlength="300"
          required>
      </label>

      <label>
        <span>AUTHOR</span>
        <input
          name="author"
          type="text"
          maxlength="300">
      </label>

      <label>
        <span>TEXT</span>
        <textarea
          name="body"
          rows="5"></textarea>
      </label>

      <label>
        <span>URL</span>
        <input
          name="url"
          type="url"
          placeholder="www.example.com"
          autocomplete="url">
      </label>
    `;

    form.append(fields);

    form.elements.year.value =
      item.yearLabel;

    form.elements.title.value =
      item.title;

    form.elements.author.value =
      item.author;

    form.elements.body.value =
      item.body;

    form.elements.url.value =
      item.url;

    const actions =
      document.createElement("div");

    actions.className =
      "dashboard-press-edit-actions";

    const save =
      document.createElement("button");

    save.type = "submit";
    save.className = "text-action";
    save.textContent = "[ SAVE ]";

    const cancel =
      createTextButton(
        "CANCEL",
        `Cancel editing ${item.title}`
      );

    cancel.addEventListener(
      "click",
      () => {
        reload().catch(() => {
          setError(
            "PRESS COULD NOT BE RELOADED"
          );
        });
      }
    );

    actions.append(save, cancel);
    form.append(actions);

    form.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        setError();

        let record;
        try {
          record = readForm(form);
        } catch {
          setError("URL MUST BE A VALID HTTP OR HTTPS URL");
          form.elements.url.setAttribute("aria-invalid", "true");
          form.elements.url.focus();
          return;
        }

        if (!validate(record, form)) {
          return;
        }

        save.disabled = true;
        cancel.disabled = true;

        try {
          await repository.updatePressItem(
            {
              ...item,
              ...record,
              isVisible: item.isVisible
            },
            item.updatedAt
          );

          await reload();
        } catch (error) {
          setError(
            error?.message ||
            "PRESS ITEM COULD NOT BE SAVED"
          );

          save.disabled = false;
          cancel.disabled = false;
        }
      }
    );

    row.replaceChildren(form);
    form.elements.title.focus();
  }

  function createItem(item) {
    const row =
      document.createElement("article");

    const year =
      document.createElement("p");

    const content =
      document.createElement("div");

    const title =
      document.createElement("h3");

    const author =
      document.createElement("p");

    const body =
      document.createElement("p");

    const url =
      document.createElement("a");

    const controls =
      document.createElement("div");

    row.className =
      "dashboard-press-item";

    if (!item.isVisible) {
      row.classList.add("is-hidden");
    }

    year.className =
      "dashboard-press-year";

    year.textContent =
      item.yearLabel;

    content.className =
      "dashboard-press-content";

    title.textContent =
      item.title;

    content.append(title);

    if (item.author) {
      author.className =
        "dashboard-press-author";

      author.textContent =
        item.author;

      content.append(author);
    }

    if (item.body) {
      body.className =
        "dashboard-press-body";

      body.textContent =
        item.body;

      content.append(body);
    }

    if (item.url) {
      url.className =
        "dashboard-press-url";

      url.href = item.url;
      url.target = "_blank";
      url.rel = "noreferrer";
      url.textContent = item.url;

      content.append(url);
    }

    controls.className =
      "dashboard-press-actions";

    const visibility =
      createVisibilityControls(item);

    const edit =
      createTextButton(
        "EDIT",
        `Edit ${item.title}`
      );

    const remove =
      createTextButton(
        "DELETE",
        `Delete ${item.title}`
      );

    remove.dataset.confirming = "false";

    edit.addEventListener(
      "click",
      () => {
        createEditor(item, row);
      }
    );

    remove.addEventListener(
      "click",
      async () => {
        if (
          remove.dataset.confirming !== "true"
        ) {
          remove.dataset.confirming = "true";
          remove.textContent =
            "[ CONFIRM DELETE ]";

          return;
        }

        setError();
        remove.disabled = true;

        try {
          await repository.deletePressItem(
            item.id
          );

          await reload();
        } catch (error) {
          setError(
            error?.message ||
            "PRESS ITEM COULD NOT BE DELETED"
          );

          remove.disabled = false;
          remove.dataset.confirming =
            "false";

          remove.textContent =
            "[ DELETE ]";
        }
      }
    );

    controls.append(
      visibility,
      edit,
      remove
    );

    row.append(
      year,
      content,
      controls
    );

    return row;
  }

  function renderItems(items) {
    if (!items.length) {
      const empty =
        document.createElement("p");

      empty.className =
        "dashboard-press-empty";

      empty.textContent =
        "NO PRESS ITEMS ADDED";

      list.replaceChildren(empty);
      return;
    }

    list.replaceChildren(
      ...items.map(createItem)
    );
  }

  function renderProfileSelector() {
    profileSelect.replaceChildren(
      ...profiles.map((profile) => {
        const option =
          document.createElement("option");

        option.value = profile.id;
        option.textContent = profile.name;

        return option;
      })
    );

    profileSelect.value =
      selectedProfileId;

    profileField.hidden =
      profiles.length < 2;
  }

  addForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      setError();

      if (!selectedProfileId) {
        setError(
          "ARTIST PROFILE SETUP REQUIRED"
        );

        return;
      }

      let record;
      try {
        record = readForm(addForm);
      } catch {
        setError("URL MUST BE A VALID HTTP OR HTTPS URL");
        addForm.elements.url.setAttribute("aria-invalid", "true");
        addForm.elements.url.focus();
        return;
      }

      if (!validate(record, addForm)) {
        return;
      }

      const submit =
        addForm.querySelector(
          'button[type="submit"]'
        );

      submit.disabled = true;

      try {
        await repository.createPressItem(
          {
            ...record,
            isVisible: true
          },
          selectedProfileId
        );

        addForm.reset();

        await reload();
      } catch (error) {
        setError(
          error?.message ||
          "PRESS ITEM COULD NOT BE CREATED"
        );
      } finally {
        submit.disabled = false;
      }
    }
  );

  document.addEventListener("input", (event) => {
    if (event.target.matches?.('input[name="url"]')) {
      event.target.removeAttribute("aria-invalid");
    }
  });

  profileSelect.addEventListener(
    "change",
    async () => {
      selectedProfileId =
        profileSelect.value;

      setError();

      try {
        await reload();
      } catch {
        setError(
          "PRESS ITEMS ARE CURRENTLY UNAVAILABLE"
        );
      }
    }
  );

  try {
    const selected =
      await getPressRepository();

    repository = selected.repository;

    await repository.initialise();

    if (
      repository.mode !== "supabase"
    ) {
      renderDashboardAccountIdentity(
        [],
        "prototype"
      );

      setNotice(
        "PRESS IS CURRENTLY UNAVAILABLE"
      );

      renderItems([]);
      addForm.hidden = true;

      return;
    }

    profiles =
      await repository.listManagedProfiles();

    renderDashboardAccountIdentity(
      profiles
    );

    if (!profiles.length) {
      setNotice(
        "ARTIST PROFILE SETUP REQUIRED"
      );

      renderItems([]);
      addForm.hidden = true;

      return;
    }

    selectedProfileId =
      profiles[0].id;

    renderProfileSelector();

    await reload();
  } catch (error) {
    console.error(error);

    renderDashboardAccountIdentity(
      [],
      "error"
    );

    setError(
      "PRESS IS CURRENTLY UNAVAILABLE"
    );

    renderItems([]);
    addForm.hidden = true;
  }
});
