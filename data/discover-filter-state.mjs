import { canonicalizeFormatDisciplines } from "./work-format-disciplines.mjs";

export function createDiscoverFilterState(initialValues = []) {
  let selected = canonicalizeFormatDisciplines(initialValues);

  function snapshot() {
    return [...selected];
  }

  return Object.freeze({
    selected: snapshot,
    hasSelection: () => selected.length > 0,
    toggle(value) {
      const [canonical] = canonicalizeFormatDisciplines([value]);
      selected = selected.includes(canonical)
        ? selected.filter((entry) => entry !== canonical)
        : canonicalizeFormatDisciplines([...selected, canonical]);
      return snapshot();
    },
    clear() {
      selected = [];
      return snapshot();
    }
  });
}

export function createDiscoverRequestGate() {
  let currentVersion = 0;

  return Object.freeze({
    next() {
      currentVersion += 1;
      return currentVersion;
    },
    isCurrent(version) {
      return version === currentVersion;
    }
  });
}
