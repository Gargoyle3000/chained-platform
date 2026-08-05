function resolveDaypart(date = new Date()) {
  const hour = date.getHours();

  if (hour < 12) return "GOOD MORNING";
  if (hour < 18) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

function resolveDashboardIdentity(profiles = [], mode = "") {
  const managedProfiles = Array.isArray(profiles) ? profiles : [];

  if (mode === "prototype") {
    return {
      name: "LOCAL PROTOTYPE",
      greetingName: "LOCAL PROTOTYPE"
    };
  }

  if (mode === "error") {
    return {
      name: "PROFILE UNAVAILABLE",
      greetingName: ""
    };
  }

  if (managedProfiles.length === 0) {
    return {
      name: "PROFILE SETUP REQUIRED",
      greetingName: ""
    };
  }

  if (managedProfiles.length === 1) {
    const profileName = String(
      managedProfiles[0].name || "UNTITLED PROFILE"
    ).toUpperCase();

    return {
      name: profileName,
      greetingName: profileName
    };
  }

  return {
    name: `${managedProfiles.length} MANAGED PROFILES`,
    greetingName: ""
  };
}

export function renderDashboardAccountIdentity(
  profiles = [],
  mode = ""
) {
  const name = document.querySelector(
    "[data-dashboard-profile-name]"
  );
  const type = document.querySelector(
    "[data-dashboard-account-type]"
  );
  const greeting = document.querySelector(
    "[data-dashboard-greeting]"
  );

  const identity = resolveDashboardIdentity(profiles, mode);

  if (name) {
    name.textContent = identity.name;
  }

  if (type) {
    type.textContent = "ARTIST ACCOUNT";
  }

  if (greeting) {
    const daypart = resolveDaypart();

    greeting.textContent = identity.greetingName
      ? `${daypart}, ${identity.greetingName}.`
      : `${daypart}.`;
  }
}