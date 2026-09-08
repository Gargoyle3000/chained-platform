import { WORK_ERROR_CODES } from "./work-errors.mjs";

export const PUBLICATION_READINESS_INTERVAL_MS = 5_000;
export const PUBLICATION_READINESS_BOUND_MS = 120_000;
export const PUBLICATION_LONG_PROCESSING_INTERVAL_MS = 15_000;

export function publicationReadinessUiState(readiness, prerequisiteMessage = "WORK IS NOT READY TO PUBLISH") {
  if (readiness?.state === "ready") {
    return Object.freeze({ message: "READY TO PUBLISH", isError: false, publishEnabled: true, showCheckAgain: false });
  }
  if (readiness?.state === "processing") {
    return Object.freeze({
      message: readiness.longProcessing
        ? "WORK SAVED\nIMAGES ARE TAKING LONGER TO PREPARE\nYOU CAN LEAVE THIS PAGE AND RETURN LATER"
        : "WORK SAVED\nPREPARING IMAGES FOR PUBLISH\nYOU CAN LEAVE THIS PAGE — PROCESSING WILL CONTINUE",
      isError: false,
      publishEnabled: false,
      showCheckAgain: readiness.longProcessing === true
    });
  }
  if (readiness?.state === "failed") {
    return Object.freeze({ message: "IMAGE PROCESSING FAILED", isError: true, publishEnabled: false, showCheckAgain: false });
  }
  return Object.freeze({ message: prerequisiteMessage, isError: true, publishEnabled: false, showCheckAgain: false });
}

export function workOperationFailureUiState({ phase, metadataPersisted, error }) {
  if (!metadataPersisted || phase === "saving") {
    const message = error?.code === WORK_ERROR_CODES.CONFLICT
      ? "THIS WORK CHANGED ELSEWHERE · RELOAD BEFORE SAVING"
      : error?.message === "YEAR MUST BE BETWEEN 1900 AND 2100"
        ? error.message
        : "WORK COULD NOT BE SAVED";
    return Object.freeze({ message, isError: true, restartReadiness: false });
  }
  if (phase === "publishing" && error?.code === WORK_ERROR_CODES.MEDIA_PROCESSING) {
    return Object.freeze({
      message: "WORK SAVED\nPREPARING IMAGES FOR PUBLISH\nYOU CAN LEAVE THIS PAGE — PROCESSING WILL CONTINUE",
      isError: false,
      restartReadiness: true
    });
  }
  if (phase === "publishing") return Object.freeze({ message: "WORK COULD NOT BE PUBLISHED", isError: true, restartReadiness: false });
  if (phase === "uploading") return Object.freeze({ message: "WORK SAVED · IMAGE UPLOAD FAILED", isError: true, restartReadiness: false });
  return Object.freeze({ message: "WORK SAVED · PUBLICATION READINESS UNAVAILABLE", isError: true, restartReadiness: false });
}

export function createPublicationReadinessWatcher({
  read,
  onState,
  onError = () => {},
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
  now = () => Date.now(),
  intervalMs = PUBLICATION_READINESS_INTERVAL_MS,
  boundMs = PUBLICATION_READINESS_BOUND_MS,
  longIntervalMs = PUBLICATION_LONG_PROCESSING_INTERVAL_MS
}) {
  if (typeof read !== "function" || typeof onState !== "function" || typeof onError !== "function" || typeof setTimer !== "function" || typeof clearTimer !== "function" || !Number.isFinite(intervalMs) || intervalMs <= 0 || !Number.isFinite(boundMs) || boundMs <= 0 || !Number.isFinite(longIntervalMs) || longIntervalMs <= 0) {
    throw new TypeError("Publication readiness watcher dependencies are invalid.");
  }

  let session = 0;
  let timer = null;
  let activeWorkId = null;
  let deadline = 0;
  let inFlight = false;

  function clearScheduled() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function stop() {
    session += 1;
    clearScheduled();
    activeWorkId = null;
    deadline = 0;
  }

  async function check(expectedSession) {
    if (expectedSession !== session || !activeWorkId || inFlight) return;
    inFlight = true;
    const workId = activeWorkId;
    try {
      const readiness = await read(workId);
      if (expectedSession !== session || workId !== activeWorkId) return;
      const longProcessing = readiness.state === "processing" && now() >= deadline;
      onState(Object.freeze({ ...readiness, longProcessing }));
      if (readiness.state === "processing") {
        const delay = longProcessing
          ? longIntervalMs
          : Math.min(intervalMs, Math.max(0, deadline - now()));
        timer = setTimer(() => {
          timer = null;
          void check(expectedSession);
        }, delay);
      } else {
        clearScheduled();
        activeWorkId = null;
      }
    } catch (error) {
      if (expectedSession === session && workId === activeWorkId) {
        clearScheduled();
        activeWorkId = null;
        onError(error);
      }
    } finally {
      inFlight = false;
      if (expectedSession !== session && activeWorkId) void check(session);
    }
  }

  function start(workId) {
    stop();
    if (!workId) return Promise.resolve();
    activeWorkId = workId;
    deadline = now() + boundMs;
    const expectedSession = session;
    if (inFlight) return Promise.resolve();
    return check(expectedSession);
  }

  function checkNow() {
    if (!activeWorkId || inFlight) return Promise.resolve();
    clearScheduled();
    return check(session);
  }

  return Object.freeze({
    start,
    stop,
    dispose: stop,
    checkNow,
    isActive: () => activeWorkId !== null,
    isChecking: () => inFlight,
    activeWorkId: () => activeWorkId
  });
}
