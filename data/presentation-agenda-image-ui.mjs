function emptyContext(text) {
  const item = document.createElement("p");
  item.className = "dashboard-empty-state";
  item.textContent = text;
  return item;
}

function action(label, handler) {
  const button = document.createElement("button");
  let busy = false;
  button.type = "button";
  button.className = "text-action";
  button.textContent = `[ ${label} ]`;
  button.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      await handler();
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
  return button;
}

export function createPresentationAgendaImageController({
  repository,
  getPresentationId,
  section,
  state,
  input,
  upload,
  representativeWork,
  setError,
  setStatus
}) {
  let currentContext = null;

  function render(context) {
    currentContext = context;
    section.hidden = false;
    state.replaceChildren(...(context.hasDedicatedImage
      ? [
          Object.assign(document.createElement("p"), {
            className: "dashboard-empty-state",
            textContent: "AGENDA IMAGE READY"
          }),
          action("REMOVE", async () => {
            setError();
            setStatus("REMOVING AGENDA IMAGE");
            try {
              await repository.removePresentationAgendaImage(getPresentationId());
              await refresh();
              setStatus("AGENDA IMAGE REMOVED");
            } catch (error) {
              setStatus();
              setError(error?.message || "AGENDA IMAGE COULD NOT BE REMOVED");
            }
          })
        ]
      : [emptyContext("NO DEDICATED AGENDA IMAGE")]));
    upload.textContent = context.hasDedicatedImage ? "[ REPLACE ]" : "[ UPLOAD ]";
    representativeWork.replaceChildren(
      Object.assign(document.createElement("option"), { value: "", textContent: "[ NONE ]" }),
      ...context.works.map((work) => Object.assign(document.createElement("option"), {
        value: work.id,
        textContent: work.title
      }))
    );
    representativeWork.value = context.representativeWorkId || "";
  }

  async function refresh() {
    const presentationId = getPresentationId();
    if (!presentationId) {
      currentContext = null;
      section.hidden = true;
      return null;
    }
    const context = await repository.getPresentationAgendaImageContext(presentationId);
    render(context);
    return context;
  }

  upload.addEventListener("click", async () => {
    const file = input.files?.[0];
    const presentationId = getPresentationId();
    if (!file || !presentationId) return;
    upload.disabled = true;
    setError();
    setStatus("UPLOADING AGENDA IMAGE");
    try {
      await repository.uploadPresentationAgendaImage(presentationId, file);
      input.value = "";
      setStatus("VERIFYING AGENDA IMAGE");
      const context = await refresh();
      if (!context?.hasDedicatedImage) throw new Error("AGENDA IMAGE COULD NOT BE VERIFIED");
      setStatus("AGENDA IMAGE READY");
    } catch (error) {
      setStatus();
      setError(error?.message || "AGENDA IMAGE COULD NOT BE VERIFIED");
    } finally {
      upload.disabled = false;
    }
  });

  representativeWork.addEventListener("change", async () => {
    const presentationId = getPresentationId();
    if (!presentationId) return;
    representativeWork.disabled = true;
    setError();
    try {
      await repository.setPresentationRepresentativeWork(
        presentationId,
        representativeWork.value || null
      );
      await refresh();
    } catch (error) {
      setError(error?.message || "REPRESENTATIVE WORK COULD NOT BE SAVED");
    } finally {
      representativeWork.disabled = false;
    }
  });

  return Object.freeze({ refresh, render, get context() { return currentContext; } });
}
