import { it, expect } from 'vitest';
import { toSourcePoint, toScreenPoint } from '../src/pdf/coordinates';
it('SyncTeX bleibt bei Zoom und verschobenem Seitenursprung bidirektional', () => {
  const box = [20, 30, 620, 830];
  const viewport = {
    convertToViewportPoint: (x: number, y: number) => [(x - 20) * 2, (830 - y) * 2],
    convertToPdfPoint: (x: number, y: number) => [x / 2 + 20, 830 - y / 2],
  };
  const screen = toScreenPoint(viewport, box, 50, 80);
  expect(screen).toEqual({ left: 100, top: 160 });
  expect(toSourcePoint(viewport, box, screen.left, screen.top)).toEqual({ x: 50, y: 80 });
});
it('dreht PDF-Koordinaten über den Viewport statt über CSS-Pixel', () => {
  const viewport = {
    convertToViewportPoint: (x: number, y: number) => [y * 1.5, x * 1.5],
    convertToPdfPoint: (x: number, y: number) => [y / 1.5, x / 1.5],
  };
  const box = [0, 0, 600, 800];
  const point = toScreenPoint(viewport, box, 20, 30);
  expect(toSourcePoint(viewport, box, point.left, point.top)).toEqual({ x: 20, y: 30 });
});
