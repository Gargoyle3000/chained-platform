export function createCvImportPersistenceFlow({
  persist,
  onPending,
  onSuccess,
  onFailure,
  onActiveChange = () => {}
}) {
  let active = false;

  return Object.freeze({
    get active() {
      return active;
    },

    async submit(profileId, entries) {
      if (active) return false;

      active = true;
      onActiveChange(true);
      onPending();

      let result;
      let failure;

      try {
        result = await persist(profileId, entries);
      } catch (error) {
        failure = error;
      } finally {
        active = false;
        onActiveChange(false);
      }

      if (failure) {
        await onFailure(failure);
      } else {
        await onSuccess(result);
      }

      return true;
    }
  });
}
