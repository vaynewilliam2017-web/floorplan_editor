import { add, closePolygon, distance, midpoint, normalizeVector, openingSegmentOnWall, projectPointToSegment } from './geometry';
import { createAgentCameraPresets } from './cameraPresets';
import { ROOM_CATEGORIES } from './roomCategories';
import type { FloorplanModel, Opening, Operation, Point, Room, RoomType, StructuralType, Wall } from './types';

export function createOperationId(type: Operation['type']): string {
  return `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function reduceOperation(model: FloorplanModel, operation: Operation): FloorplanModel {
  switch (operation.type) {
    case 'add_wall':
      return {
        ...model,
        walls: [...model.walls, operation.payload.wall],
      };
    case 'move_wall_endpoint':
      return {
        ...model,
        walls: model.walls.map((wall) => {
          if (wall.id !== operation.targetId) return wall;
          const centerline: [Point, Point] = [...wall.centerline] as [Point, Point];
          centerline[operation.payload.endpoint] = operation.payload.point;
          return { ...wall, centerline };
        }),
      };
    case 'move_wall':
      return {
        ...model,
        walls: model.walls.map((wall) =>
          wall.id === operation.targetId
            ? { ...wall, centerline: wall.centerline.map((point) => add(point, operation.payload.offset)) as [Point, Point] }
            : wall,
        ),
        openings: model.openings.map((opening) =>
          opening.wallId === operation.targetId
            ? { ...opening, segment: opening.segment.map((point) => add(point, operation.payload.offset)) as [Point, Point] }
            : opening,
        ),
      };
    case 'set_wall_thickness':
      return {
        ...model,
        walls: model.walls.map((wall) =>
          wall.id === operation.targetId ? { ...wall, thicknessMm: Math.max(20, operation.payload.thicknessMm) } : wall,
        ),
      };
    case 'set_wall_structural':
      return {
        ...model,
        walls: model.walls.map((wall) =>
          wall.id === operation.targetId ? { ...wall, structural: operation.payload.structural as StructuralType } : wall,
        ),
      };
    case 'add_opening':
      return {
        ...model,
        openings: [...model.openings, operation.payload.opening],
      };
    case 'move_opening_on_wall': {
      const wall = model.walls.find((item) => item.id === operation.payload.wallId);
      if (!wall) return model;
      const projected = projectPointToSegment(operation.payload.center, wall.centerline);
      return {
        ...model,
        openings: model.openings.map((opening) =>
          opening.id === operation.targetId
            ? {
                ...opening,
                wallId: wall.id,
                segment: openingSegmentOnWall(projected.point, wall.centerline, opening.widthMm),
              }
            : opening,
        ),
      };
    }
    case 'set_opening_width':
      return {
        ...model,
        openings: model.openings.map((opening) => {
          if (opening.id !== operation.targetId) return opening;
          const wall = model.walls.find((item) => item.id === opening.wallId);
          const center: Point = [
            (opening.segment[0][0] + opening.segment[1][0]) / 2,
            (opening.segment[0][1] + opening.segment[1][1]) / 2,
          ];
          const nextWidth = Math.max(20, operation.payload.widthMm);
          return {
            ...opening,
            widthMm: nextWidth,
            segment: wall
              ? openingSegmentOnWall(center, wall.centerline, nextWidth)
              : openingSegmentOnWall(center, opening.segment, nextWidth),
          };
        }),
      };
    case 'flip_opening_side':
      return {
        ...model,
        openings: model.openings.map((opening) =>
          opening.id === operation.targetId ? { ...opening, side: opening.side === -1 ? 1 : -1 } : opening,
        ),
      };
    case 'set_opening_angle':
      return {
        ...model,
        openings: model.openings.map((opening) =>
          opening.id === operation.targetId ? rotateOpeningToNearestWall(model, opening, operation.payload.angleDeg) : opening,
        ),
      };
    case 'add_room':
      return {
        ...model,
        rooms: [...model.rooms, operation.payload.room],
      };
    case 'rename_room':
      return {
        ...model,
        rooms: model.rooms.map((room) => (room.id === operation.targetId ? { ...room, name: operation.payload.name } : room)),
      };
    case 'move_room':
      return {
        ...model,
        rooms: model.rooms.map((room) =>
          room.id === operation.targetId
            ? {
                ...room,
                polygon: room.polygon.map((point) => add(point, operation.payload.offset)),
                labelPoint: add(room.labelPoint, operation.payload.offset),
              }
            : room,
        ),
      };
    case 'move_room_vertex':
      return {
        ...model,
        rooms: model.rooms.map((room) =>
          room.id === operation.targetId ? moveRoomVertex(room, operation.payload.index, operation.payload.point) : room,
        ),
      };
    case 'move_room_edge':
      return {
        ...model,
        rooms: model.rooms.map((room) =>
          room.id === operation.targetId ? moveRoomEdge(room, operation.payload.edgeIndex, operation.payload.offset) : room,
        ),
      };
    case 'set_room_category':
      return {
        ...model,
        rooms: model.rooms.map((room) =>
          room.id === operation.targetId
            ? {
                ...room,
                category: operation.payload.category,
                type: operation.payload.type as RoomType,
                name: room.name || ROOM_CATEGORIES[operation.payload.category]?.label || 'Room',
              }
            : room,
        ),
      };
    case 'add_furniture':
      return {
        ...model,
        furniture: [...model.furniture, operation.payload.furniture].sort((a, b) => a.zIndex - b.zIndex),
      };
    case 'move_furniture':
      return {
        ...model,
        furniture: model.furniture.map((item) =>
          item.id === operation.targetId ? { ...item, position: operation.payload.position } : item,
        ),
      };
    case 'set_furniture_size':
      return {
        ...model,
        furniture: model.furniture.map((item) =>
          item.id === operation.targetId
            ? { ...item, size: [Math.max(20, operation.payload.size[0]), Math.max(20, operation.payload.size[1])] }
            : item,
        ),
      };
    case 'set_furniture_rotation':
      return {
        ...model,
        furniture: model.furniture.map((item) =>
          item.id === operation.targetId ? { ...item, rotationDeg: snapFurnitureRotation(operation.payload.rotationDeg) } : item,
        ),
      };
    case 'delete_furniture':
      return {
        ...model,
        furniture: model.furniture.filter((item) => item.id !== operation.targetId),
      };
    case 'calibrate_background_image': {
      const previous = model.source.mmPerSourcePx;
      const next = Math.max(0.01, operation.payload.mmPerSourcePx);
      const ratio = next / previous;
      const scalePoint = (point: Point): Point => [point[0] * ratio, point[1] * ratio];
      const calibratedModel: FloorplanModel = {
        ...model,
        world: { ...model.world, unit: 'mm' },
        source: {
          ...model.source,
          worldUnit: 'mm',
          mmPerSourcePx: next,
          calibrated: true,
          scaleEvidence: operation.payload.evidence,
          offsetMm: [model.source.offsetMm[0] * ratio, model.source.offsetMm[1] * ratio],
          calibrationRuler: {
            ...model.source.calibrationRuler,
            start: scalePoint(model.source.calibrationRuler.start),
            end: scalePoint(model.source.calibrationRuler.end),
          },
        },
        boundary: { ...model.boundary, points: model.boundary.points.map(scalePoint) },
        walls: model.walls.map((wall) => ({
          ...wall,
          centerline: wall.centerline.map(scalePoint) as [Point, Point],
          thicknessMm: wall.thicknessMm * ratio,
        })),
        openings: model.openings.map((opening) => ({
          ...opening,
          segment: opening.segment.map(scalePoint) as [Point, Point],
          widthMm: opening.widthMm * ratio,
        })),
        rooms: model.rooms.map((room) => ({
          ...room,
          polygon: room.polygon.map(scalePoint),
          labelPoint: scalePoint(room.labelPoint),
        })),
        furniture: model.furniture.map((item) => ({
          ...item,
          position: scalePoint(item.position),
          size: scalePoint(item.size),
        })),
        columns: model.columns.map((column) => ({
          ...column,
          polygon: column.polygon.map(scalePoint),
          bbox: [column.bbox[0] * ratio, column.bbox[1] * ratio, column.bbox[2] * ratio, column.bbox[3] * ratio],
        })),
        fixedZones: model.fixedZones.map((zone) => ({ ...zone, polygon: zone.polygon.map(scalePoint) })),
        cameraPresets: [],
        activeCameraPresetId: null,
      };
      const cameraPresets = createAgentCameraPresets(calibratedModel);
      return {
        ...calibratedModel,
        cameraPresets,
        activeCameraPresetId: cameraPresets[0]?.id || null,
      };
    }
    case 'set_background_offset':
      return {
        ...model,
        source: { ...model.source, offsetMm: operation.payload.offsetMm },
      };
    case 'set_background_scale':
      return {
        ...model,
        source: { ...model.source, imageScale: Math.max(0.05, Math.min(10, operation.payload.imageScale)) },
      };
    case 'set_background_opacity':
      return {
        ...model,
        source: { ...model.source, opacity: Math.max(0.08, Math.min(1, operation.payload.opacity)) },
      };
    case 'set_calibration_ruler':
      return {
        ...model,
        source: {
          ...model.source,
          calibrationRuler: {
            ...model.source.calibrationRuler,
            start: operation.payload.start,
            end: operation.payload.end,
          },
        },
      };
    case 'set_calibration_known_length':
      return {
        ...model,
        source: {
          ...model.source,
          calibrationRuler: {
            ...model.source.calibrationRuler,
            knownLengthMm: Math.max(0, operation.payload.knownLengthMm),
          },
        },
      };
    case 'upsert_camera_preset': {
      const exists = model.cameraPresets.some((preset) => preset.id === operation.payload.preset.id);
      return {
        ...model,
        cameraPresets: exists
          ? model.cameraPresets.map((preset) =>
              preset.id === operation.payload.preset.id ? operation.payload.preset : preset,
            )
          : [...model.cameraPresets, operation.payload.preset],
        activeCameraPresetId: operation.payload.preset.id,
      };
    }
    case 'delete_camera_preset':
      return {
        ...model,
        cameraPresets: model.cameraPresets.filter((preset) => preset.id !== operation.targetId),
        activeCameraPresetId: model.activeCameraPresetId === operation.targetId ? null : model.activeCameraPresetId,
      };
    case 'set_active_camera_preset':
      return {
        ...model,
        activeCameraPresetId: operation.payload.cameraPresetId,
      };
    case 'delete_wall':
      return {
        ...model,
        walls: model.walls.filter((wall) => wall.id !== operation.targetId),
        openings: model.openings.filter((opening) => opening.wallId !== operation.targetId),
      };
    case 'delete_room':
      return {
        ...model,
        rooms: model.rooms.filter((room) => room.id !== operation.targetId),
      };
    case 'delete_opening':
      return {
        ...model,
        openings: model.openings.filter((opening) => opening.id !== operation.targetId),
      };
    default:
      return model;
  }
}

function moveRoomVertex(room: Room, index: number, point: Point): Room {
  const unique = uniquePolygon(room.polygon);
  if (unique.length < 3) return room;
  const safeIndex = clampIndex(index, unique.length);
  const next = unique.map((vertex, vertexIndex) => (vertexIndex === safeIndex ? point : vertex));
  const polygon = closePolygon(next);
  return { ...room, polygon, labelPoint: centroidOrFallback(polygon, room.labelPoint) };
}

function rotateOpeningToNearestWall(model: FloorplanModel, opening: Opening, angleDeg: number): Opening {
  const center = midpoint(opening.segment);
  const wall = nearestWallByAngle(model.walls, angleDeg);
  if (wall) {
    const projected = projectPointToSegment(center, wall.centerline);
    return {
      ...opening,
      wallId: wall.id,
      segment: openingSegmentOnWall(projected.point, wall.centerline, opening.widthMm),
    };
  }

  const radians = (angleDeg * Math.PI) / 180;
  const unit: Point = [Math.cos(radians), Math.sin(radians)];
  const half = Math.max(opening.widthMm, distance(opening.segment[0], opening.segment[1])) / 2;
  return {
    ...opening,
    wallId: null,
    segment: [
      [center[0] - unit[0] * half, center[1] - unit[1] * half],
      [center[0] + unit[0] * half, center[1] + unit[1] * half],
    ],
  };
}

function nearestWallByAngle(walls: Wall[], angleDeg: number): Wall | null {
  if (!walls.length) return null;
  return (
    walls
      .map((wall) => ({ wall, delta: angleDistanceDeg(wallAngleDeg(wall), angleDeg) }))
      .sort((a, b) => a.delta - b.delta)[0]?.wall || null
  );
}

function wallAngleDeg(wall: Wall): number {
  const unit = normalizeVector(wall.centerline[0], wall.centerline[1]);
  return normalizeDegrees((Math.atan2(unit[1], unit[0]) * 180) / Math.PI);
}

function angleDistanceDeg(a: number, b: number): number {
  const delta = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(delta, 360 - delta);
}

function moveRoomEdge(room: Room, edgeIndex: number, offset: Point): Room {
  const unique = uniquePolygon(room.polygon);
  if (unique.length < 3) return room;
  const startIndex = clampIndex(edgeIndex, unique.length);
  const endIndex = (startIndex + 1) % unique.length;
  const next = unique.map((point, index) => (index === startIndex || index === endIndex ? add(point, offset) : point));
  const polygon = closePolygon(next);
  return { ...room, polygon, labelPoint: centroidOrFallback(polygon, room.labelPoint) };
}

function uniquePolygon(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1];
  return closed ? points.slice(0, -1) : points;
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, Math.round(index)));
}

function centroidOrFallback(points: Point[], fallback: Point): Point {
  const unique = uniquePolygon(points);
  if (!unique.length) return fallback;
  const total = unique.reduce<Point>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [total[0] / unique.length, total[1] / unique.length];
}

function snapFurnitureRotation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return normalizeDegrees(Math.round(value / 90) * 90);
}

function normalizeDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((value % 360) + 360) % 360;
}
