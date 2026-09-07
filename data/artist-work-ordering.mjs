function finiteInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function workId(work) {
  return String(work?.id || "");
}

function valueFor(work, snakeCase, camelCase) {
  return work?.[snakeCase] ?? work?.[camelCase] ?? null;
}

export function workYearBucket(work) {
  return finiteInteger(valueFor(work, "year_sort", "yearSort"));
}

export function workProfileOrder(work) {
  const order = finiteInteger(valueFor(work, "profile_order", "profileOrder"));
  return order != null && order >= 0 ? order : null;
}

export function compareArtistWorkCuration(first, second) {
  const firstYear = workYearBucket(first);
  const secondYear = workYearBucket(second);

  if (firstYear !== secondYear) {
    if (firstYear == null) return 1;
    if (secondYear == null) return -1;
    return secondYear - firstYear;
  }

  const firstOrder = workProfileOrder(first);
  const secondOrder = workProfileOrder(second);
  if (firstOrder !== secondOrder) {
    if (firstOrder == null) return 1;
    if (secondOrder == null) return -1;
    return firstOrder - secondOrder;
  }

  return timestamp(valueFor(second, "updated_at", "updatedAt")) - timestamp(valueFor(first, "updated_at", "updatedAt"))
    || workId(first).localeCompare(workId(second));
}

export function groupArtistWorksByYear(works = [], profileNames = new Map()) {
  const profiles = new Map();

  [...works].forEach((work) => {
    const profileId = String(valueFor(work, "owner_profile_id", "ownerProfileId") || "");
    const year = workYearBucket(work);
    const key = `${profileId}:${year == null ? "unknown" : year}`;
    if (!profiles.has(key)) {
      profiles.set(key, {
        key,
        profileId,
        profileName: profileNames.get(profileId) || "",
        year,
        works: []
      });
    }
    profiles.get(key).works.push(work);
  });

  return [...profiles.values()]
    .map((group) => Object.freeze({
      ...group,
      works: Object.freeze([...group.works].sort(compareArtistWorkCuration))
    }))
    .sort((first, second) => {
      const firstName = first.profileName || first.profileId;
      const secondName = second.profileName || second.profileId;
      const profileDifference = firstName.localeCompare(secondName);
      if (profileDifference) return profileDifference;
      if (first.year !== second.year) {
        if (first.year == null) return 1;
        if (second.year == null) return -1;
        return second.year - first.year;
      }
      return first.key.localeCompare(second.key);
    });
}

export function moveWorkWithinYear(works = [], workIdToMove, direction) {
  const ordered = [...works];
  const index = ordered.findIndex((work) => work?.id === workIdToMove);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= ordered.length) return null;
  [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
  return Object.freeze(ordered);
}
