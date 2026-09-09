export function createCvImportFlow({
  openPicker,
  validate,
  extract,
  onInvalid,
  onProcessing,
  onSuccess,
  onFailure,
  onActiveChange = () => {}
}) {
  let active = false;

  return Object.freeze({
    get active() {
      return active;
    },

    requestSelection() {
      if (active) return false;
      openPicker();
      return true;
    },

    async acceptSelection(file) {
      if (!file || active) return false;
      try {
        validate(file);
      } catch (error) {
        onInvalid(error);
        return false;
      }

      active = true;
      onActiveChange(true);
      onProcessing(file);
      try {
        const result = await extract(file);
        onSuccess(result, file);
      } catch (error) {
        onFailure(error, file);
      } finally {
        active = false;
        onActiveChange(false);
      }
      return true;
    }
  });
}
