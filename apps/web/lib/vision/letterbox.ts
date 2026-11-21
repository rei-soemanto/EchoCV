export type Letterbox = {
  scale: number;
  left: number;
  top: number;
  resizedWidth: number;
  resizedHeight: number;
  inputWidth: number;
  inputHeight: number;
  sourceWidth: number;
  sourceHeight: number;
};

export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (Math.abs(diff - 0.5) > 1e-9) return Math.round(value) + 0;
  return (floor % 2 === 0 ? floor : floor + 1) + 0;
}

export function letterboxFor(
  sourceWidth: number,
  sourceHeight: number,
  size: number,
  stride: number,
): Letterbox {
  const scale = Math.min(size / sourceHeight, size / sourceWidth);
  const resizedWidth = roundHalfEven(sourceWidth * scale);
  const resizedHeight = roundHalfEven(sourceHeight * scale);
  const padX = ((size - resizedWidth) % stride) / 2;
  const padY = ((size - resizedHeight) % stride) / 2;
  const left = roundHalfEven(padX - 0.1);
  const right = roundHalfEven(padX + 0.1);
  const top = roundHalfEven(padY - 0.1);
  const bottom = roundHalfEven(padY + 0.1);
  return {
    scale,
    left,
    top,
    resizedWidth,
    resizedHeight,
    inputWidth: resizedWidth + left + right,
    inputHeight: resizedHeight + top + bottom,
    sourceWidth,
    sourceHeight,
  };
}

export function rgbaToTensor(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const plane = width * height;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    out[i] = rgba[i * 4] / 255;
    out[plane + i] = rgba[i * 4 + 1] / 255;
    out[2 * plane + i] = rgba[i * 4 + 2] / 255;
  }
  return out;
}

type Drawable = CanvasImageSource & { width?: number; height?: number };

export function drawLetterboxed(
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  source: Drawable,
  box: Letterbox,
  padValue: number,
): Float32Array {
  context.fillStyle = `rgb(${padValue}, ${padValue}, ${padValue})`;
  context.fillRect(0, 0, box.inputWidth, box.inputHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "medium";
  context.drawImage(source, box.left, box.top, box.resizedWidth, box.resizedHeight);
  const pixels = context.getImageData(0, 0, box.inputWidth, box.inputHeight).data;
  return rgbaToTensor(pixels, box.inputWidth, box.inputHeight);
}
