export function createIImage(canvas) {
  return {
    width: canvas.width,
    getCanvas: () => canvas,
  }
}
