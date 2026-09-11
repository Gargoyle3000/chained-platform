document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const [{ getAdminInviteService, createAdminInviteSubmissionFlow, createArtistSlugFromName, normalizeArtistSlug, invitationMessage }, { readAdminAccess }, { getFrontendRuntime }] = await Promise.all([
    import("./data/admin-invite-service.mjs"),
    import("./auth/admin-access.mjs"),
    import("./auth/supabase-client.mjs")
  ]);

  const form = document.querySelector("#dashboard-admin-invite-form");
  const access = document.querySelector("#dashboard-admin-invite-access");
  const error = document.querySelector("#dashboard-admin-invite-error");
  const status = document.querySelector("#dashboard-admin-invite-status");
  const submit = document.querySelector("#dashboard-admin-invite-submit");
  const name = document.querySelector("#dashboard-admin-invite-name");
  const email = document.querySelector("#dashboard-admin-invite-email");
  const slug = document.querySelector("#dashboard-admin-invite-slug");
  let slugEdited = false;

  function show(element, message = "") {
    element.textContent = message;
    element.hidden = !message;
  }

  function setSending(sending) {
    submit.disabled = sending;
    submit.textContent = sending ? "SENDING INVITATION" : "SEND INVITATION";
  }

  const runtime = await getFrontendRuntime();
  if (!runtime.client) {
    document.body.removeAttribute("data-admin-protected");
    form.querySelectorAll("input,button").forEach((control) => {
      control.disabled = true;
    });
    show(access, "ADMIN ACCESS REQUIRED");
    return;
  }

  const permission = await readAdminAccess(runtime.client);
  if (permission.kind !== "admin") {
    show(access, invitationMessage(permission.kind));
    return;
  }

  document.body.removeAttribute("data-admin-protected");
  const flow = createAdminInviteSubmissionFlow(await getAdminInviteService());

  name.addEventListener("input", () => {
    if (!slugEdited) slug.value = createArtistSlugFromName(name.value);
  });

  slug.addEventListener("input", () => {
    slugEdited = true;
    slug.value = normalizeArtistSlug(slug.value);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (flow.sending) return;

    show(error);
    show(status);
    setSending(true);
    const result = await flow.submit({
      displayName: name.value,
      email: email.value,
      slug: slug.value
    });
    setSending(false);

    if (result.kind === "success") {
      show(status, invitationMessage(result.code));
      return;
    }

    if (result.kind !== "busy") show(error, invitationMessage(result.code));
  });
});
