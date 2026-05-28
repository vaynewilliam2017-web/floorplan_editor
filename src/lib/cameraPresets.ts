import { boundsOf, midpoint } from './geometry';
import type { CameraPreset, FloorplanModel, Point, Room, Vec3 } from './types';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function createAgentCameraPresets(model: FloorplanModel): CameraPreset[] {
  const bounds = modelBounds(model);
  const span = Math.max(bounds.width, bounds.height, model.source.worldUnit === 'mm' ? 4500 : 450);
  const center: Point = [bounds.minX + bounds.width / 2, bounds.minY + bounds.height / 2];
  const baseHeight = model.source.worldUnit === 'mm' ? 1500 : Math.max(140, span * 0.18);
  const living = findRoom(model, ['living']) || findRoom(model, ['dining']) || model.rooms[0] || null;
  const kitchen = findRoom(model, ['kitchen', 'utility', 'service_balcony']);
  const entry = findRoom(model, ['entry', 'corridor']) || roomNearOpening(model);
  const master = findRoom(model, ['master_bedroom']) || findRoom(model, ['bedroom']);
  const circulation = findRoom(model, ['stair', 'corridor', 'elevator_hall']) || entry || living;

  return [
    presetForRoom('agent_entry_panorama', '入户全景', entry, center, span, baseHeight, 80, 24, 180),
    presetForRoom('agent_living_main', '客厅主景', living, center, span, baseHeight * 0.8, 65, 50, -90),
    presetForRoom('agent_living_diagonal', '客厅对角线', living, center, span, baseHeight * 0.93, 72, 28, -135),
    presetForRoom('agent_master_bedroom', '主卧主景', master, center, span, baseHeight * 0.67, 60, 50, 90),
    presetForRoom('agent_kitchen', '厨房视角', kitchen || living, center, span, baseHeight, 55, 35, 135),
    presetForRoom('agent_circulation', '楼梯通廊', circulation, center, span, baseHeight, 55, 24, 0),
  ].filter(Boolean) as CameraPreset[];
}

function presetForRoom(
  id: string,
  name: string,
  room: Room | null | undefined,
  fallback: Point,
  span: number,
  height: number,
  fovDeg: number,
  lensMm: number,
  angleDeg: number,
): CameraPreset {
  const cameraPoint = room?.labelPoint || fallback;
  const rad = (angleDeg * Math.PI) / 180;
  let targetPoint = fallback;
  if (Math.hypot(targetPoint[0] - cameraPoint[0], targetPoint[1] - cameraPoint[1]) < span * 0.08) {
    targetPoint = [cameraPoint[0] + Math.cos(rad) * span * 0.28, cameraPoint[1] + Math.sin(rad) * span * 0.28];
  }
  const dx = targetPoint[0] - cameraPoint[0];
  const dz = targetPoint[1] - cameraPoint[1];
  const length = Math.max(1, Math.hypot(dx, dz));
  const safeStep = span * 0.035;
  const positionPoint: Point = [cameraPoint[0] + (dx / length) * safeStep, cameraPoint[1] + (dz / length) * safeStep];
  const position: Vec3 = [positionPoint[0], height, positionPoint[1]];
  const targetY = Math.max(0, Math.min(height * 0.72, height - 80));
  const actualAngleDeg = ((Math.atan2(targetPoint[1] - positionPoint[1], targetPoint[0] - positionPoint[0]) * 180) / Math.PI + 360) % 360;
  return preset(id, name, position, [targetPoint[0], targetY, targetPoint[1]], fovDeg, height, lensMm, positionPoint, actualAngleDeg, room ? [room] : []);
}

function preset(
  id: string,
  name: string,
  position: Vec3,
  target: Vec3,
  fovDeg: number,
  heightMm: number,
  lensMm: number,
  footprintPoint: Point,
  angleDeg: number,
  rooms: Room[],
): CameraPreset {
  return {
    id,
    name,
    source: 'agent',
    position,
    target,
    fovDeg,
    heightMm,
    lensMm,
    footprint: {
      point: footprintPoint,
      angleDeg,
      fovDeg,
    },
    roomIds: rooms.map((room) => room.id),
  };
}

function modelBounds(model: FloorplanModel): Bounds {
  const points = [
    ...model.boundary.points,
    ...model.rooms.flatMap((room) => room.polygon),
    ...model.walls.flatMap((wall) => wall.centerline),
  ];
  if (!points.length) return { minX: 0, minY: 0, maxX: 1000, maxY: 1000, width: 1000, height: 1000 };
  return boundsOf(points);
}

function findRoom(model: FloorplanModel, types: string[]): Room | null {
  return model.rooms.find((room) => types.includes(room.type)) || null;
}

function roomNearOpening(model: FloorplanModel): Room | null {
  const entrance = model.openings.find((opening) => opening.type === 'entrance_door') || model.openings[0];
  if (!entrance) return null;
  const entranceMid = midpoint(entrance.segment);
  return (
    model.rooms
      .map((room) => ({ room, distance: Math.hypot(room.labelPoint[0] - entranceMid[0], room.labelPoint[1] - entranceMid[1]) }))
      .sort((a, b) => a.distance - b.distance)[0]?.room || null
  );
}
