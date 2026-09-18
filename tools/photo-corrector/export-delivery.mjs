export function exportFilename(mimeType, timestamp = Date.now()) {
  return `corrected-${timestamp}.${mimeType === "image/png" ? "png" : "jpg"}`;
}

export function canShareImageFile(platform, file) {
  const shareData = { files: [file] };
  try {
    return Boolean(
      platform.matchMedia?.("(pointer: coarse)").matches &&
      typeof platform.navigator?.share === "function" &&
      typeof platform.navigator?.canShare === "function" &&
      platform.navigator.canShare(shareData)
    );
  } catch {
    return false;
  }
}

export async function deliverExport(blob, filename, platform = globalThis) {
  const file = new platform.File([blob], filename, { type: blob.type });
  if (canShareImageFile(platform, file)) {
    try {
      await platform.navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      throw error;
    }
  }
  const url = platform.URL.createObjectURL(blob);
  const anchor = platform.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  platform.setTimeout(() => platform.URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
