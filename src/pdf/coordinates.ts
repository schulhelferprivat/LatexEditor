export type ViewportTransform = {
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportPoint(x: number, y: number): number[];
};
export function toSourcePoint(viewport: ViewportTransform, box: number[], x: number, y: number) {
  const [pdfX, pdfY] = viewport.convertToPdfPoint(x, y);
  return { x: pdfX - box[0], y: box[3] - pdfY };
}
export function toScreenPoint(viewport: ViewportTransform, box: number[], x: number, y: number) {
  const [left, top] = viewport.convertToViewportPoint(box[0] + x, box[3] - y);
  return { left, top };
}
