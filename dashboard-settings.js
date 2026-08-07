document.addEventListener(
  "DOMContentLoaded",
  async () => {
    "use strict";

    const { getSettingsRepository } =
      await import(
        "./data/settings-repository.mjs"
      );

    const {
      renderDashboardAccountIdentity
    } = await import(
      "./data/dashboard-context.mjs"
    );


    const form =
      document.querySelector(
        "#dashboard-settings-form"
      );

    const errorElement =
      document.querySelector(
        "#dashboard-settings-error"
      );

    const noticeElement =
      document.querySelector(
        "#dashboard-settings-notice"
      );

    const statusElement =
      document.querySelector(
        "#dashboard-settings-status"
      );

    const saveButton =
      document.querySelector(
        "#dashboard-settings-save"
      );

    const profileField =
      document.querySelector(
        "#dashboard-settings-profile-field"
      );

    const profileSelect =
      document.querySelector(
        "#dashboard-settings-profile"
      );

    const emailElement =
      document.querySelector(
        "#settings-account-email"
      );

    const accountStatusElement =
      document.querySelector(
        "#settings-account-status"
      );

    const planElement =
      document.querySelector(
        "#settings-account-plan"
      );

    const legacyRow =
      document.querySelector(
        "#settings-legacy-row"
      );

    const legacyElement =
      document.querySelector(
        "#settings-account-legacy"
      );


    let repository;
    let profiles = [];
    let selectedProfile = null;


    function clean(value) {
      return String(value ?? "").trim();
    }


    function normalizeUrl(value) {
      const cleaned = clean(value);

      if (!cleaned) return "";

      if (/^https?:\/\//i.test(cleaned)) {
        return cleaned;
      }

      return `https://${cleaned}`;
    }


    function validHttpUrl(value) {
      if (!value) return true;

      try {
        const url = new URL(value);

        return (
          url.protocol === "http:" ||
          url.protocol === "https:"
        );
      } catch {
        return false;
      }
    }


    function setError(message = "") {
      errorElement.textContent = message;
      errorElement.hidden = !message;
    }


    function setNotice(message = "") {
      noticeElement.textContent = message;
      noticeElement.hidden = !message;
    }


    function setStatus(message = "") {
      statusElement.textContent = message;
      statusElement.hidden = !message;
    }


    function pretty(value) {
      return clean(value)
        .replaceAll("_", " ")
        .toUpperCase();
    }


    function control(name) {
      return document.querySelector(
        `[data-setting-control="${name}"]`
      );
    }


    function setControl(
      name,
      value
    ) {
      const container = control(name);

      if (!container) return;

      const stringValue =
        String(value);

      container.dataset.value =
        stringValue;

      container
        .querySelectorAll(
          "button[data-value]"
        )
        .forEach((button) => {
          const active =
            button.dataset.value ===
            stringValue;

          button.classList.toggle(
            "is-active",
            active
          );

          button.disabled = active;
        });
    }


    function readBooleanControl(name) {
      return (
        control(name)?.dataset.value ===
        "true"
      );
    }


    function bindControls() {
      document
        .querySelectorAll(
          "[data-setting-control]"
        )
        .forEach((container) => {
          container
            .querySelectorAll(
              "button[data-value]"
            )
            .forEach((button) => {
              button.addEventListener(
                "click",
                () => {
                  setControl(
                    container.dataset
                      .settingControl,
                    button.dataset.value
                  );

                  setStatus();
                }
              );
            });
        });
    }


    function renderAccount(account) {
      if (!account) {
        emailElement.textContent = "—";
        accountStatusElement.textContent =
          "UNAVAILABLE";
        planElement.textContent = "—";
        legacyRow.hidden = true;
        return;
      }

      emailElement.textContent =
        account.email || "—";

      accountStatusElement.textContent =
        pretty(account.status);

      planElement.textContent =
        pretty(account.plan);

      if (account.legacyStatus) {
        legacyElement.textContent =
          pretty(account.legacyStatus);

        legacyRow.hidden = false;
      } else {
        legacyElement.textContent = "";
        legacyRow.hidden = true;
      }
    }


    function renderProfile(profile) {
      selectedProfile = profile;

      if (!profile) {
        form
          .querySelectorAll(
            "input,textarea,button"
          )
          .forEach((element) => {
            element.disabled = true;
          });

        return;
      }

      form.elements["display-name"].value =
        profile.displayName;

      form.elements[
        "alternative-name"
      ].value =
        profile.alternativeName;

      form.elements.city.value =
        profile.city;

      form.elements.country.value =
        profile.country;

      form.elements.biography.value =
        profile.biography;

      form.elements["website-url"].value =
        profile.websiteUrl;

      form.elements["social-url"].value =
        profile.socialUrl;

      form.elements.pronouns.value =
        profile.pronouns;

      form.elements[
        "contact-email"
      ].value =
        profile.publicContactEmail;


      setControl(
        "publication",
        profile.publicationStatus
      );

      setControl(
        "works",
        profile.showWorks
      );

      setControl(
        "presentations",
        profile.showPresentations
      );

      setControl(
        "agenda",
        profile.showAgenda
      );

      setControl(
        "cv",
        profile.showCv
      );

      setControl(
        "press",
        profile.showPress
      );

      setError();
      setStatus();
    }


    function readProfile() {
      return {
        id: selectedProfile.id,

        displayName:
          clean(
            form.elements[
              "display-name"
            ].value
          ),

        alternativeName:
          clean(
            form.elements[
              "alternative-name"
            ].value
          ),

        city:
          clean(form.elements.city.value),

        country:
          clean(
            form.elements.country.value
          ),

        biography:
          clean(
            form.elements.biography.value
          ),

        websiteUrl:
          normalizeUrl(
            form.elements[
              "website-url"
            ].value
          ),

        socialUrl:
          normalizeUrl(
            form.elements[
              "social-url"
            ].value
          ),

        pronouns:
          clean(
            form.elements.pronouns.value
          ),

        publicContactEmail:
          clean(
            form.elements[
              "contact-email"
            ].value
          ),

        publicationStatus:
          control("publication")
            .dataset.value,

        showWorks:
          readBooleanControl("works"),

        showPresentations:
          readBooleanControl(
            "presentations"
          ),

        showAgenda:
          readBooleanControl("agenda"),

        showCv:
          readBooleanControl("cv"),

        showPress:
          readBooleanControl("press")
      };
    }


    function validate(record) {
      if (!record.displayName) {
        setError(
          "ERROR: PLEASE FILL IN YOUR DISPLAY NAME!"
        );

        form.elements[
          "display-name"
        ].focus();

        return false;
      }

      if (
        record.websiteUrl &&
        !validHttpUrl(record.websiteUrl)
      ) {
        setError(
          "ERROR: THAT WEBSITE URL LOOKS A LITTLE TOO UNCHAINED!"
        );

        form.elements[
          "website-url"
        ].focus();

        return false;
      }

      if (
        record.socialUrl &&
        !validHttpUrl(record.socialUrl)
      ) {
        setError(
          "ERROR: THAT SOCIAL LINK DOES NOT LOOK RIGHT!"
        );

        form.elements[
          "social-url"
        ].focus();

        return false;
      }

      const email =
        record.publicContactEmail;

      if (
        email &&
        !/^[^\s@]+@[^\s@]+$/.test(email)
      ) {
        setError(
          "ERROR: PLEASE CHECK THAT CONTACT EMAIL!"
        );

        form.elements[
          "contact-email"
        ].focus();

        return false;
      }

      return true;
    }


    function renderProfileSelector() {
      profileSelect.replaceChildren();

      profiles.forEach((profile) => {
        const option =
          document.createElement(
            "option"
          );

        option.value = profile.id;
        option.textContent =
          profile.displayName;

        profileSelect.append(option);
      });

      profileField.hidden =
        profiles.length <= 1;
    }


    profileSelect.addEventListener(
      "change",
      () => {
        const next =
          profiles.find(
            (profile) =>
              profile.id ===
              profileSelect.value
          );

        if (next) {
          renderProfile(next);
        }
      }
    );


    form.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        if (!selectedProfile) {
          return;
        }

        setError();
        setStatus();

        const record =
          readProfile();

        if (!validate(record)) {
          return;
        }

        saveButton.disabled = true;
        setStatus("SAVING SETTINGS");

        try {
          const saved =
            await repository
              .updateProfileSettings(
                record,
                selectedProfile.updatedAt
              );

          const index =
            profiles.findIndex(
              (profile) =>
                profile.id === saved.id
            );

          if (index >= 0) {
            profiles[index] = saved;
          }

          renderDashboardAccountIdentity(
            profiles
          );

          renderProfile(saved);

          profileSelect
            .querySelector(
              `option[value="${saved.id}"]`
            )
            ?.replaceChildren(
              document.createTextNode(
                saved.displayName
              )
            );

          setStatus("SETTINGS SAVED");
        } catch (error) {
          setError(
            error?.message ||
            "SETTINGS COULD NOT BE SAVED"
          );

          setStatus();
        } finally {
          saveButton.disabled = false;
        }
      }
    );


    bindControls();


    try {
      const selected =
        await getSettingsRepository();

      repository =
        selected.repository;

      await repository.initialise();

      const [
        account,
        managedProfiles
      ] = await Promise.all([
        repository.getAccountSettings(),
        repository.listManagedProfiles()
      ]);

      profiles =
        Array.isArray(managedProfiles)
          ? managedProfiles
          : [];

      renderAccount(account);

      renderDashboardAccountIdentity(
        profiles
      );

      renderProfileSelector();

      if (!profiles.length) {
        renderProfile(null);

        setNotice(
          "PROFILE SETTINGS REQUIRE OWNER OR MANAGER ACCESS"
        );

        return;
      }

      selectedProfile =
        profiles[0];

      profileSelect.value =
        selectedProfile.id;

      renderProfile(selectedProfile);

    } catch (error) {
      console.error(
        "Could not initialise Settings.",
        error
      );

      renderDashboardAccountIdentity(
        [],
        "error"
      );

      setError(
        error?.message ||
        "SETTINGS ARE CURRENTLY UNAVAILABLE"
      );
    }
  }
);