import { polygonArea, segmentLength } from './geometry';
import type { FloorplanModel, ValidationIssue, ValidationReport } from './types';

export function validateFloorplan(model: FloorplanModel): ValidationReport {
  const issues: ValidationIssue[] = [];
  const add = (severity: ValidationIssue['severity'], target: string, message: string) => {
    issues.push({ severity, target, message });
  };

  if (!model.source.calibrated) {
    add('warning', 'source-image', 'Background is not calibrated. Current world units are source pixels, not millimeters.');
  }

  if (model.boundary.points.length < 4) {
    add('error', model.boundary.id, 'Boundary needs at least three vertices plus closure.');
  } else {
    const first = model.boundary.points[0];
    const last = model.boundary.points[model.boundary.points.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      add('error', model.boundary.id, 'Boundary polygon is not closed.');
    }
  }

  model.walls.forEach((wall) => {
    if (segmentLength(wall.centerline) < 10) add('error', wall.id, 'Wall centerline is too short.');
    if (wall.thicknessMm <= 0) add('error', wall.id, 'Wall thickness must be positive.');
    if (wall.structural === 'unknown') add('suggestion', wall.id, 'Structural status is unknown; expose as editable.');
  });

  model.openings.forEach((opening) => {
    if (!opening.wallId) add('warning', opening.id, 'Opening is not attached to a wall.');
    if (opening.widthMm <= 0 || segmentLength(opening.segment) < 5) add('error', opening.id, 'Opening width/segment is invalid.');
    if (!model.walls.some((wall) => wall.id === opening.wallId)) add('warning', opening.id, 'Opening wall_id does not match a wall.');
  });

  model.rooms.forEach((room) => {
    if (room.polygon.length < 4) add('error', room.id, 'Room polygon needs at least three vertices plus closure.');
    if (polygonArea(room.polygon) < 10_000) add('warning', room.id, 'Room area is very small.');
  });

  const summary = {
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    suggestions: issues.filter((issue) => issue.severity === 'suggestion').length,
  };

  return {
    ok: summary.errors === 0,
    issues,
    summary,
  };
}
