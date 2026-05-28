import type { Point, Viewport } from './types';

export const GRID_MM = 50;

export function add(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1]];
}

export function sub(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1]];
}

export function mul(a: Point, scalar: number): Point {
  return [a[0] * scalar, a[1] * scalar];
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function segmentLength(segment: [Point, Point]): number {
  return distance(segment[0], segment[1]);
}

export function midpoint(segment: [Point, Point]): Point {
  return [(segment[0][0] + segment[1][0]) / 2, (segment[0][1] + segment[1][1]) / 2];
}

export function normalizeVector(a: Point, b: Point): Point {
  const len = distance(a, b);
  if (len < 0.0001) return [1, 0];
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

export function perpendicular(unit: Point): Point {
  return [-unit[1], unit[0]];
}

export function wallPolygon(centerline: [Point, Point], thickness: number): Point[] {
  const unit = normalizeVector(centerline[0], centerline[1]);
  const normal = perpendicular(unit);
  const half = thickness / 2;
  const offset = mul(normal, half);
  return [
    add(centerline[0], offset),
    add(centerline[1], offset),
    sub(centerline[1], offset),
    sub(centerline[0], offset),
    add(centerline[0], offset),
  ];
}

export function projectPointToSegment(point: Point, segment: [Point, Point]) {
  const [a, b] = segment;
  const ab = sub(b, a);
  const ap = sub(point, a);
  const ab2 = ab[0] * ab[0] + ab[1] * ab[1];
  const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1]) / ab2));
  const projected: Point = [a[0] + ab[0] * t, a[1] + ab[1] * t];
  return { point: projected, t, distance: distance(point, projected) };
}

export function polygonArea(points: Point[]): number {
  if (points.length < 4) return 0;
  let area = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) / 2;
}

export function boundsOf(points: Point[]) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

export function flatten(points: Point[]): number[] {
  return points.flatMap(([x, y]) => [x, y]);
}

export function closePolygon(points: Point[]): Point[] {
  if (points.length === 0) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return points;
  return [...points, first];
}

export function roundPoint(point: Point, decimals = 2): Point {
  const factor = 10 ** decimals;
  return [Math.round(point[0] * factor) / factor, Math.round(point[1] * factor) / factor];
}

export function snapToGrid(point: Point, grid = GRID_MM): Point {
  return [Math.round(point[0] / grid) * grid, Math.round(point[1] / grid) * grid];
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return [point[0] * viewport.scale + viewport.x, point[1] * viewport.scale + viewport.y];
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return [(point[0] - viewport.x) / viewport.scale, (point[1] - viewport.y) / viewport.scale];
}

export function openingSegmentOnWall(center: Point, wallSegment: [Point, Point], width: number): [Point, Point] {
  const unit = normalizeVector(wallSegment[0], wallSegment[1]);
  const half = width / 2;
  return [
    [center[0] - unit[0] * half, center[1] - unit[1] * half],
    [center[0] + unit[0] * half, center[1] + unit[1] * half],
  ];
}
