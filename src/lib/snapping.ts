import { distance, projectPointToSegment, snapToGrid } from './geometry';
import type { FloorplanModel, Point, SnapGuide } from './types';

export interface SnapResult {
  point: Point;
  guides: SnapGuide[];
}

export function snapWallEndpoint(input: Point, fixed: Point, model: FloorplanModel): SnapResult {
  const guides: SnapGuide[] = [];
  let point = snapToGrid(input);

  const axisThreshold = 80;
  if (Math.abs(point[0] - fixed[0]) < axisThreshold) {
    point = [fixed[0], point[1]];
    guides.push({ id: 'axis-v', orientation: 'vertical', points: [[fixed[0], fixed[1] - 2000], [fixed[0], fixed[1] + 2000]], label: 'vertical' });
  }
  if (Math.abs(point[1] - fixed[1]) < axisThreshold) {
    point = [point[0], fixed[1]];
    guides.push({ id: 'axis-h', orientation: 'horizontal', points: [[fixed[0] - 2000, fixed[1]], [fixed[0] + 2000, fixed[1]]], label: 'horizontal' });
  }

  let nearest: { point: Point; distance: number } | undefined;
  for (const wall of model.walls) {
    for (const endpoint of wall.centerline) {
      const d = distance(point, endpoint);
      if (d < 90 && (!nearest || d < nearest.distance)) nearest = { point: endpoint, distance: d };
    }
  }
  if (nearest) {
    point = nearest.point;
    guides.push({ id: 'endpoint', orientation: 'point', points: [point], label: 'endpoint' });
  }

  return { point, guides };
}

export function nearestWallForOpening(input: Point, model: FloorplanModel) {
  let best: { wallId: string; point: Point; distance: number } | undefined;
  for (const wall of model.walls) {
    const projected = projectPointToSegment(input, wall.centerline);
    if (!best || projected.distance < best.distance) {
      best = { wallId: wall.id, point: projected.point, distance: projected.distance };
    }
  }
  return best ?? null;
}
