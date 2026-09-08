export const CV_CATEGORY_TYPES = Object.freeze([
  "education",
  "solo_exhibition",
  "duo_exhibition",
  "group_presentation",
  "award",
  "grant",
  "collection",
  "residency",
  "teaching",
  "curatorial"
]);

export const CV_CATEGORY_LABELS = Object.freeze({
  education: "EDUCATION",
  solo_exhibition: "SOLO EXHIBITIONS",
  duo_exhibition: "DUO EXHIBITIONS",
  group_presentation: "GROUP EXHIBITIONS / PRESENTATIONS",
  award: "NOMINATIONS & PRIZES",
  grant: "SCHOLARSHIPS & FUNDING",
  collection: "COLLECTIONS",
  residency: "RESIDENCIES",
  teaching: "TEACHING",
  curatorial: "CURATORIAL PROJECTS"
});

function cleanText(value, maximum = 300) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maximum);
}

function optionalText(value, maximum = 300) {
  const cleaned = cleanText(value, maximum);
  return cleaned || null;
}

function isSupportedCategory(categoryType) {
  return CV_CATEGORY_TYPES.includes(categoryType);
}

export function createCvImportReviewState(result) {
  const candidates = Array.isArray(result?.candidates)
    ? result.candidates
    : [];

  return {
    candidates: candidates
      .filter((candidate) => isSupportedCategory(candidate.categoryType))
      .map((candidate) => ({
        candidateId: cleanText(candidate.candidateId, 120),
        categoryType: candidate.categoryType,
        yearLabel: optionalText(candidate.yearLabel, 40),
        title: cleanText(candidate.title),
        organization: optionalText(candidate.organization),
        locationText: optionalText(candidate.locationText),
        url: optionalText(candidate.url),
        needsReview: candidate.needsReview === true,
        duplicateState: candidate.duplicateState || "new",
        selected: candidate.duplicateState !== "duplicate"
      })),
    unsupportedSections: Array.isArray(result?.unsupportedSections)
      ? result.unsupportedSections.map((section) => ({
        heading: cleanText(section.heading, 120),
        reason: section.reason === "unsupported_category"
          ? section.reason
          : "unsupported_category",
        entryCount: Number.isInteger(section.entryCount)
          ? section.entryCount
          : 0
      })).filter((section) => section.heading && section.entryCount > 0)
      : []
  };
}

export function updateCvImportReviewCandidate(state, candidateId, patch = {}) {
  const candidate = state?.candidates?.find(
    (item) => item.candidateId === candidateId
  );

  if (!candidate) return false;

  if (Object.hasOwn(patch, "selected")) {
    candidate.selected = Boolean(patch.selected);
  }

  if (Object.hasOwn(patch, "categoryType") && isSupportedCategory(patch.categoryType)) {
    candidate.categoryType = patch.categoryType;
  }

  if (Object.hasOwn(patch, "yearLabel")) {
    candidate.yearLabel = optionalText(patch.yearLabel, 40);
  }

  if (Object.hasOwn(patch, "title")) {
    const title = cleanText(patch.title);
    if (title) candidate.title = title;
  }

  return true;
}

export function cvImportReviewSummary(state) {
  const candidates = state?.candidates || [];
  const selected = candidates.filter((candidate) => candidate.selected);

  return {
    found: candidates.length,
    selected: selected.length,
    excluded: candidates.length - selected.length,
    needsReview: candidates.filter((candidate) => candidate.needsReview).length,
    unsupportedSections: (state?.unsupportedSections || []).length
  };
}

export function groupCvImportReviewCandidates(state) {
  const candidates = state?.candidates || [];

  return CV_CATEGORY_TYPES.map((categoryType) => ({
    categoryType,
    label: CV_CATEGORY_LABELS[categoryType],
    candidates: candidates.filter(
      (candidate) => candidate.categoryType === categoryType
    )
  })).filter((group) => group.candidates.length);
}

export function selectedCvImportPersistenceProjection(state) {
  return (state?.candidates || [])
    .filter((candidate) => candidate.selected)
    .map((candidate) => ({
      categoryType: candidate.categoryType,
      yearLabel: candidate.yearLabel,
      title: candidate.title,
      organization: candidate.organization,
      locationText: candidate.locationText,
      url: candidate.url,
      sourceActivityId: null
    }));
}
