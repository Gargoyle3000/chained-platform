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
      ["THIS PAGE", "Your private working collection. Works from Artist Profiles you manage are available automatically, including drafts; published Works from other artists are added with their Work-level [+]."],
      ["EDIT HERE", "Use Tags as private labels for filtering and retrieval. Use Projects as deliberate ordered selections; their order controls private CHAINED SELECT PDF output. A Project can include your managed draft Works, and PDF export is not publication."],
      ["CONNECTED TO", "Your own Works remain managed in WORKS, and saved external Works remain owned by their Artist. Ordinary Artist Projects stay private and exportable; CURATED publication is reserved for eligible Curator or Institution Profiles."]
    ]
  },
  project: {
    title: "SELECT PROJECT",
    sections: [
      ["THIS PAGE", "An ordered selection inside your private SELECT workspace."],
      ["EDIT HERE", "Add, remove and order Works for this Project. Removing a Work from a Project does not delete the Work or change its place in SELECT. Project order controls CHAINED SELECT PDF output."],
      ["CONNECTED TO", "A Project PDF is private and never publishes a Work. An ordinary Artist Project is not CURATED publication; the Works themselves remain managed in WORKS or by their original Artist."]
    ]
  },
  discover: {
    title: "DISCOVER",
    sections: [
      ["THIS PAGE", "A viewing and discovery surface for published Works and Artist practices, not an editing workspace."],
      ["EDIT HERE", "There is normally nothing to edit here. A Work-level [+] saves another Artist’s Work privately to SELECT. Your managed Works have no Work-level [+] because they already belong to SELECT automatically. Open an Artist name to view their public Profile."],
      ["CONNECTED TO", "A Work-level [+] leads to private SELECT only; it does not publish anything or notify the Artist. FOLLOW tracks an Artist or practice, not one Work. The main-navigation [+] is different: it opens your Artist workspace / Dashboard."]
    ]
  },
  following: {
    title: "FOLLOW",
    sections: [
      ["THIS PAGE", "Published Works from Artist Profiles you follow privately."],
      ["EDIT HERE", "Manage following from an Artist’s public Profile. A Work-level [+] saves that individual Work to SELECT; following an Artist does not automatically save their Works."],
      ["CONNECTED TO", "Following changes this FOLLOW feed and the public Agenda FOLLOW scope. FOLLOW and SELECT are separate private systems."]
    ]
  },
  "public-profile": {
    title: "ARTIST PROFILE",
    sections: [
      ["THIS PAGE", "The public representation of an Artist Profile. What appears here comes from eligible published records and Profile visibility settings."],
      ["EDIT HERE", "FOLLOW privately follows this Artist. Profile, Works, CV and Press editing happens in the relevant Artist workspace areas, not on this public page."],
      ["CONNECTED TO", "Published Works and enabled CV or Press sections can appear here, alongside Presentations and Agenda context where available. Profile publication is the gate for public visibility."]
    ]
  },
  "public-work": {
    title: "WORK",
    sections: [
      ["THIS PAGE", "The public view of one published Work."],
      ["EDIT HERE", "A Work-level [+] saves another Artist’s Work to SELECT. Your managed Works have no [+] here because they already belong to SELECT automatically. Work data is edited in WORKS by its manager."],
      ["CONNECTED TO", "This Work connects to its Artist Profile, any linked Presentations and your private SELECT when saved."]
    ]
  },
  "public-agenda": {
    title: "AGENDA",
    sections: [
      ["THIS PAGE", "Public dated activity across CHAINED."],
      ["EDIT HERE", "ALL shows eligible Agenda activity. FOLLOW limits the view to eligible activity connected to Artists or Profiles you follow; it does not save anything to SELECT."],
      ["CONNECTED TO", "Agenda entries can stand alone or link to a Presentation. Dates and Agenda-specific context are managed in Agenda; Presentation information remains managed in Presentations."]
    ]
  },
  "public-presentation": {
    title: "PRESENTATION",
    sections: [
      ["THIS PAGE", "The public context for an exhibition or other Presentation."],
      ["EDIT HERE", "This public detail page is for viewing. If you manage this Presentation, edit it in Presentation management."],
      ["CONNECTED TO", "Where available, this page connects participating Artists, linked Works and its Agenda occurrence or dated context."]
    ]
  },
  "portfolio-export": {
    title: "PORTFOLIO EXPORT",
    sections: [
      ["THIS PAGE", "Choose Works and images for a private Portfolio PDF."],
      ["EDIT HERE", "This selection is only for the export. Work details and publication remain managed in WORKS; private managed drafts can be included where authorized."],
      ["CONNECTED TO", "Exporting a Portfolio PDF does not publish or change the selected Works."]
    ]
  },
  admin: {
    title: "ADMIN CONSOLE",
    sections: [
      ["THIS PAGE", "A restricted workspace for trusted CHAINED administration."],
      ["EDIT HERE", "Create and manage Artist invitations here. It does not change public Works, Profiles or SELECT."],
      ["CONNECTED TO", "Invited Artists receive their own independent Artist workspace and retain control of their own Work records."]
    ]
  }
});

const PATH_CONTEXTS = Object.freeze({
  "dashboard.html": "dashboard", "dashboard-works.html": "works", "dashboard-work-edit.html": "work-editor", "dashboard-presentations.html": "presentations", "dashboard-presentation-edit.html": "presentation-editor", "dashboard-agenda.html": "agenda", "dashboard-agenda-edit.html": "agenda-editor", "dashboard-settings.html": "profile", "dashboard-cv.html": "cv", "dashboard-press.html": "press", "dashboard-portfolio-export.html": "portfolio-export", "dashboard-admin-invite.html": "admin", "archive.html": "archive", "archive-project.html": "project",
  "discover.html": "discover", "following.html": "following", "profile.html": "public-profile", "profile-cv.html": "public-profile", "profile-press.html": "public-profile", "profile-agenda.html": "public-profile", "profile-presentations.html": "public-profile", "artwork.html": "public-work", "agenda.html": "public-agenda", "presentation.html": "public-presentation"
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

export function canMountContextualHelp(
  pathname,
  { authenticated = false } = {}
) {
  return authenticated && Boolean(contextualHelpContext(pathname));
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

export function mountContextualHelp(
  pathname = window.location.pathname,
  { authenticated = false } = {}
) {
  if (!canMountContextualHelp(pathname, { authenticated })) return null;
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
