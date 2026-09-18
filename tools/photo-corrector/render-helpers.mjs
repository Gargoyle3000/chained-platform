export function scaledDimensions(width, height, scale) {
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function rotatedDimensions(width, height, angle) {
  const radians = angle * Math.PI / 180;
  return {
    width: Math.ceil(width * Math.abs(Math.cos(radians)) + height * Math.abs(Math.sin(radians)) - 1e-10),
    height: Math.ceil(width * Math.abs(Math.sin(radians)) + height * Math.abs(Math.cos(radians)) - 1e-10)
  };
}

export function compositeOpaqueWhite(data) {
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    data[index] = data[index] * alpha + 255 * (1 - alpha);
    data[index + 1] = data[index + 1] * alpha + 255 * (1 - alpha);
    data[index + 2] = data[index + 2] * alpha + 255 * (1 - alpha);
    data[index + 3] = 255;
  }
  return data;
}

export function maskSelected(mask, maskWidth, maskHeight, x, y, width, height) {
  if (!mask || !maskWidth || !maskHeight) return true;
  const maskX = Math.min(maskWidth - 1, Math.floor(x / width * maskWidth));
  const maskY = Math.min(maskHeight - 1, Math.floor(y / height * maskHeight));
  return Boolean(mask[maskY * maskWidth + maskX]);
}
