export function connectedMaskFromPixels(pixels, width, height, x, y, tolerance) {
  const total = width * height;
  const mask = new Uint8Array(total);
  const seedOffset = (y * width + x) * 4;
  const seed = [pixels[seedOffset], pixels[seedOffset + 1], pixels[seedOffset + 2]];
  const queue = [y * width + x];
  mask[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], offset = index * 4;
    const distance = Math.hypot(pixels[offset] - seed[0], pixels[offset + 1] - seed[1], pixels[offset + 2] - seed[2]);
    if (distance > tolerance) { mask[index] = 0; continue; }
    const px = index % width, py = Math.floor(index / width);
    [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]].forEach(([nx, ny]) => {
      const next = ny * width + nx;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && !mask[next]) {
        mask[next] = 1;
        queue.push(next);
      }
    });
  }
  return mask;
}
