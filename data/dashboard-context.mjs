export function renderDashboardAccountIdentity(profiles = [], mode = "") {
  const name = document.querySelector("[data-dashboard-profile-name]");
  const type = document.querySelector("[data-dashboard-account-type]");

  if (!name || !type) return;

  const managedProfiles = Array.isArray(profiles) ? profiles : [];

  if (mode === "prototype") {
    name.textContent = "LOCAL PROTOTYPE";
    type.textContent = "ARTIST ACCOUNT";
    return;
  }

  if (mode === "error") {
    name.textContent = "PROFILE UNAVAILABLE";
    type.textContent = "ARTIST ACCOUNT";
    return;
  }

  if (managedProfiles.length === 0) {
    name.textContent = "PROFILE SETUP REQUIRED";
    type.textContent = "ARTIST ACCOUNT";
    return;
  }

  if (managedProfiles.length === 1) {
    name.textContent = String(
      managedProfiles[0].name || "UNTITLED PROFILE"
    ).toUpperCase();
    type.textContent = "ARTIST ACCOUNT";
    return;
  }

  name.textContent = `${managedProfiles.length} MANAGED PROFILES`;
  type.textContent = "ARTIST ACCOUNT";
}