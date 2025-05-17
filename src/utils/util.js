export function drawHalfImage({
  ctx,
  image,
  side = "left", // "left" or "right"
  targetX,
  targetY,
  targetWidth,
  targetHeight,
}) {
  const halfWidth = image.width / 2;

  const sx = side === "left" ? 0 : halfWidth;
  const sy = 0;
  const sWidth = halfWidth;
  const sHeight = image.height;

  ctx.drawImage(
    image,
    sx,
    sy,
    sWidth,
    sHeight, // source rectangle
    targetX,
    targetY,
    targetWidth,
    targetHeight // destination rectangle
  );
}

export const getImageRotationAngle = (image) => {
  // Create an off-screen canvas to analyze the image
  const tempCanvas = document.createElement("canvas");
  const ctx = tempCanvas.getContext("2d");

  tempCanvas.width = image.width;
  tempCanvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, image.width, image.height);
  const data = imageData.data;

  // Get all non-white pixels
  const points = [];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];

      // Treat near-white as background
      if (r < 250 || g < 250 || b < 250) {
        points.push([x, y]);
      }
    }
  }

  if (points.length < 5) return 0; // Not enough points to analyze

  // Perform PCA (Principal Component Analysis) to detect main orientation
  const meanX = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const meanY = points.reduce((sum, p) => sum + p[1], 0) / points.length;

  let num = 0,
    den = 0;
  for (const [x, y] of points) {
    const dx = x - meanX;
    const dy = y - meanY;
    num += dx * dy;
    den += dx * dx - dy * dy;
  }

  const angle = 0.5 * Math.atan2(2 * num, den); // In radians
  return angle;
};
