import { calculateAnchoredPopoverPosition } from "./anchored-popover.mjs";

const HELP_CONTEXTS = Object.freeze({
  dashboard: {
    title: "DASHBOARD",
    sections: [
      ["THIS PAGE", "Your private working overview. It shows the main areas of your Artist workspace."],
      ["EDIT HERE", "Dashboard is an overview rather than the place to edit Works or Presentation details."],
      ["CONNECTED TO", "Works, Presentations, Agenda and other workspace sections. REQUESTS appears only when something needs attention or a meaningful load failure must be shown."]
    ]
  },
  works: {
    title: "WORKS",
    sections: [
      ["THIS PAGE", "An overview of Works in your Artist workspace."],
      ["EDIT HERE", "Create or open Works here. Their details, images and publication state are edited in the Work editor."],
      ["CONNECTED TO", "Eligible published Works can appear on your public Profile and can be connected to Presentations where supported."]
    ]
  },
  "work-editor": { title: "WORK EDITOR", sections: [["THIS PAGE", "Create or manage one Work."], ["EDIT HERE", "Edit its type, title, year, images, medium, materials, dimensions, description, credits and visibility. Drafts remain private; publishing makes an eligible Work publicly visible."], ["CONNECTED TO", "Published Works can appear on your public Profile and may be linked to Presentations. A Work is used for an Agenda thumbnail only when it is explicitly selected through Agenda Edit; CHAINED never selects the first linked Work automatically."]] },
  presentations: {
    title: "PRESENTATIONS",
    sections: [
      ["THIS PAGE", "An overview of exhibitions and other Presentations you manage."],
      ["EDIT HERE", "Create or open Presentations here. Their details are managed in the Presentation editor."],
      ["CONNECTED TO", "Presentations can connect to Works, participants and dated Agenda occurrences."]
    ]
  },
  "presentation-editor": { title: "PRESENTATION EDITOR", sections: [["THIS PAGE", "Manage the Presentation itself."], ["EDIT HERE", "Edit its type, title, venue, location, description, external link, participants, co-operators, linked Works and Program where available."], ["CONNECTED TO", "A Presentation may have a dated Agenda occurrence. Manage that occurrence’s date, time, location and Agenda-specific image controls primarily in Agenda Edit."]] },
  agenda: {
    title: "AGENDA",
    sections: [
      ["THIS PAGE", "An overview of dated public activity in your workspace."],
      ["EDIT HERE", "Create or open Agenda items here. Their date, time, location and context are edited in Agenda Edit."],
      ["CONNECTED TO", "Agenda entries can link to Presentations and may appear in the public Agenda when eligible. Public visitors can use ALL or FOLLOW where available."]
    ]
  },
  "agenda-editor": { title: "AGENDA EDITOR", sections: [["THIS PAGE", "Manage one dated public Agenda occurrence."], ["EDIT HERE", "Edit its linked Presentation, type, title override, dates, times, time zone, venue and city. For a linked Presentation, manage Agenda-specific image controls here; edit the Presentation’s own details under Presentations."], ["CONNECTED TO", "Eligible items appear in the public Agenda. Thumbnail priority is a dedicated verified Agenda image, then an explicitly selected eligible representative Work, then text only; no first Work is selected automatically."]] },
  profile: {
    title: "PROFILE",
    sections: [
      ["THIS PAGE", "Manage your Artist identity and public Profile context."],
      ["EDIT HERE", "Edit your profile information, links, contact details and the visibility of Profile sections here."],
      ["CONNECTED TO", "A draft Profile remains outside public visibility. Public Profile content appears only when the Profile and the related material meet their own publication rules."]
    ]
  },
  cv: {
    title: "CV",
    sections: [
      ["THIS PAGE", "Your professional record and CV section."],
      ["EDIT HERE", "Add, edit and set the visibility of CV entries here."],
      ["CONNECTED TO", "Visible CV entries can appear through your public Profile when its CV section is enabled."]
    ]
  },
  press: {
    title: "PRESS",
    sections: [
      ["THIS PAGE", "Your press and references section."],
      ["EDIT HERE", "Add, edit and set the visibility of press entries here."],
      ["CONNECTED TO", "Visible press entries can appear through your public Profile when its Press section is enabled."]
    ]
  },
  archive: {
    title: "SELECT / ARCHIVE",
    sections: [
      ["THIS PAGE", "Your private workspace. Works from Artist Profiles you manage are available automatically, regardless of publication state; published Works you encounter from other artists are added with [+]."],
      ["EDIT HERE", "Use Tags as private labels and filters, and Projects as deliberate ordered selections. Work details remain managed in the Work editor. A Project can generate a private CHAINED SELECT PDF, including your own draft Works where authorized."],
      ["CONNECTED TO", "SELECT organisation or PDF export never publishes a Work. Ordinary Artist Projects stay private and exportable; only eligible Curator or Institution Profiles can publish a Project to CURATED."]
    ]
  }
});

const PATH_CONTEXTS = Object.freeze({
  "dashboard.html": "dashboard", "dashboard-works.html": "works", "dashboard-work-edit.html": "work-editor", "dashboard-presentations.html": "presentations", "dashboard-presentation-edit.html": "presentation-editor", "dashboard-agenda.html": "agenda", "dashboard-agenda-edit.html": "agenda-editor", "dashboard-settings.html": "profile", "dashboard-cv.html": "cv", "dashboard-press.html": "press", "archive.html": "archive", "archive-project.html": "archive"
});

function filename(pathname = "") {
  return String(pathname).split("/").filter(Boolean).at(-1) || "dashboard.html";
}

export function contextualHelpKey(pathname) {
  return PATH_CONTEXTS[filename(pathname)] || null;
}

export function contextualHelpContext(pathname) {
  const key = contextualHelpKey(pathname);
  return key ? HELP_CONTEXTS[key] || null : null;
}

function createPanel(document) {
  const panel = document.createElement("aside");
  const content = document.createElement("div");
  panel.className = "contextual-help-panel";
  panel.id = "contextual-help-panel";
  panel.hidden = true;
  panel.tabIndex = -1;
  panel.setAttribute("role", "region");
  content.className = "contextual-help-content";
  panel.append(content);
  document.body.append(panel);
  return panel;
}

function renderContext(panel, context, key) {
  const content = panel.querySelector(".contextual-help-content");
  if (!content || !context) return;
  panel.setAttribute("aria-label", `Contextual help: ${context.title}`);
  panel.dataset.contextualHelpKey = key;
  content.replaceChildren(...context.sections.map(([heading, copy]) => {
    const section = document.createElement("section");
    const label = document.createElement("h3");
    const paragraph = document.createElement("p");
    label.textContent = heading;
    paragraph.textContent = copy;
    section.append(label, paragraph);
    return section;
  }));
}

export function mountContextualHelp(pathname = window.location.pathname) {
  if (document.body.dataset.authProtected !== "true") return null;
  const key = contextualHelpKey(pathname);
  const context = contextualHelpContext(pathname);
  if (!key || !context) return null;
  let trigger = document.querySelector(".contextual-help-trigger");
  let panel = document.querySelector("#contextual-help-panel");
  if (!panel) panel = createPanel(document);
  renderContext(panel, context, key);
  if (!trigger) {
    trigger = document.createElement("button");
    trigger.className = "contextual-help-trigger";
    trigger.type = "button";
    trigger.textContent = "[ ? ]";
    trigger.setAttribute("aria-label", "Open contextual help");
    trigger.setAttribute("aria-controls", panel.id);
    trigger.setAttribute("aria-expanded", "false");
    document.body.append(trigger);
  }
  if (trigger.dataset.contextualHelpReady === "true") return trigger;
  trigger.dataset.contextualHelpReady = "true";
  let reposition = null;
  const closePanel = ({ returnFocus = false } = {}) => {
    if (panel.hidden) return;
    panel.hidden = true;
    window.removeEventListener("scroll", reposition, true);
    window.removeEventListener("resize", reposition);
    reposition = null;
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocus) trigger.focus();
  };
  const openPanel = () => {
    panel.hidden = false;
    reposition = () => {
      const placement = calculateAnchoredPopoverPosition({
        trigger: trigger.getBoundingClientRect(),
        popover: panel.getBoundingClientRect(),
        viewport: { width: window.innerWidth, height: window.innerHeight }
      });
      panel.style.left = `${placement.left}px`;
      panel.style.top = `${placement.top}px`;
    };
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    trigger.setAttribute("aria-expanded", "true");
    panel.focus();
  };
  trigger.addEventListener("click", () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePanel({ returnFocus: true });
  });
  document.addEventListener("click", (event) => {
    if (panel.hidden || panel.contains(event.target) || trigger.contains(event.target)) return;
    closePanel();
  });
  return trigger;
}

export { HELP_CONTEXTS };
