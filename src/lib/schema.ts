import { closePolygon, distance, midpoint, openingSegmentOnWall, projectPointToSegment, roundPoint } from './geometry';
import { createAgentCameraPresets } from './cameraPresets';
import { ROOM_CATEGORIES, roomCategoryForType } from './roomCategories';
import type {
  Boundary,
  CameraPreset,
  Column,
  FixedZone,
  FloorplanModel,
  Furniture,
  Opening,
  Point,
  Room,
  RoomType,
  SourceImage,
  StructuralType,
  Uncertainty,
  Wall,
  WallKind,
  Vec3,
} from './types';

type RawObject = Record<string, unknown>;

const DEFAULT_WALL_HEIGHT_MM = 2800;
const DEFAULT_DOOR_HEIGHT_MM = 2100;
const DEFAULT_WINDOW_HEIGHT_MM = 1200;
const DEFAULT_WINDOW_SILL_MM = 900;

export function normalizeImportedFloorplan(raw: RawObject, sampleImageUrl?: string): FloorplanModel {
  const canvas = object(raw.canvas);
  const calibration = object(raw.calibration);
  const sourceRaw = object(raw.source);
  const sourceTransform = object(sourceRaw.transform);
  const rawWorld = object(raw.world);
  const transformMmPerPx = positiveNumber(sourceTransform.mm_per_px);
  const calibrationMmPerPx = positiveNumber(calibration.px_to_mm);
  const calibrated = booleanValue(sourceTransform.calibrated) ?? booleanValue(rawWorld.calibrated) ?? calibrationMmPerPx !== undefined;
  const worldUnit = calibrated
    ? 'mm'
    : enumValue(sourceTransform.world_unit ?? rawWorld.unit, ['mm', 'source_px'], 'source_px');
  const mmPerSourcePx = transformMmPerPx ?? calibrationMmPerPx ?? (worldUnit === 'mm' ? positiveNumber(sourceTransform.world_per_px) : undefined) ?? 1;
  const source: SourceImage = {
    imagePath: sampleImageUrl || stringValue(canvas.image_path) || stringValue(sourceRaw.image_path) || '',
    imageSizePx: point(canvas.image_size_px) || point(sourceRaw.image_size_px) || [1200, 840],
    worldUnit,
    mmPerSourcePx,
    calibrated,
    scaleEvidence: stringValue(sourceTransform.evidence) || stringValue(calibration.scale_evidence) || '',
    offsetMm: point(sourceTransform.offset_mm) || [0, 0],
    imageScale: positiveNumber(sourceTransform.image_scale) ?? 1,
    opacity: clampNumber(sourceTransform.opacity, 0.08, 1, 0.72),
    calibrationRuler: {
      start: point(object(sourceTransform.calibration_ruler).start) || [Math.round((point(canvas.image_size_px)?.[0] || 1200) * 0.08), Math.round((point(canvas.image_size_px)?.[1] || 840) * 0.08)],
      end: point(object(sourceTransform.calibration_ruler).end) || [Math.round((point(canvas.image_size_px)?.[0] || 1200) * 0.28), Math.round((point(canvas.image_size_px)?.[1] || 840) * 0.08)],
      knownLengthMm: positiveNumber(object(sourceTransform.calibration_ruler).known_length_mm) ?? 0,
    },
  };

  const scalePoint = (input: unknown, alreadyMm = false): Point | null => {
    const parsed = point(input);
    return parsed ? roundPoint(alreadyMm ? parsed : [parsed[0] * mmPerSourcePx, parsed[1] * mmPerSourcePx]) : null;
  };
  const scalePoints = (input: unknown, alreadyMm = false): Point[] =>
    array(input)
      .map((item) => scalePoint(item, alreadyMm))
      .filter(Boolean) as Point[];

  const boundaryRaw = object(raw.boundary);
  const boundaryPointsMm = array(boundaryRaw.points_mm);
  const boundary: Boundary = {
    id: stringValue(boundaryRaw.id) || 'boundary_001',
    points: closePolygon(scalePoints(boundaryPointsMm.length ? boundaryPointsMm : boundaryRaw.points, boundaryPointsMm.length > 0)),
    confidence: clamp01(boundaryRaw.confidence),
  };

  const walls: Wall[] = array(raw.walls)
    .map((item, index) => normalizeWall(object(item), index + 1, scalePoint, mmPerSourcePx))
    .filter(Boolean) as Wall[];
  const openings: Opening[] = array(raw.openings)
    .map((item, index) => normalizeOpening(object(item), index + 1, scalePoint, mmPerSourcePx))
    .filter(Boolean) as Opening[];
  const rooms: Room[] = array(raw.rooms)
    .map((item, index) => normalizeRoom(object(item), index + 1, scalePoint, scalePoints))
    .filter(Boolean) as Room[];
  const columns: Column[] = array(raw.columns)
    .map((item, index) => normalizeColumn(object(item), index + 1, scalePoints, mmPerSourcePx))
    .filter(Boolean) as Column[];
  const fixedZones: FixedZone[] = array(raw.fixed_zones)
    .map((item, index) => normalizeFixedZone(object(item), index + 1, scalePoints))
    .filter(Boolean) as FixedZone[];
  const furniture: Furniture[] = array(raw.furniture)
    .map((item, index) => normalizeFurniture(object(item), index + 1, scalePoint, mmPerSourcePx))
    .filter(Boolean) as Furniture[];
  const cameraPresets: CameraPreset[] = array(raw.camera_presets ?? raw.cameraPresets)
    .map((item, index) => normalizeCameraPreset(object(item), index + 1, scalePoint, mmPerSourcePx))
    .filter(Boolean) as CameraPreset[];
  const uncertainties: Uncertainty[] = array(raw.uncertainties).map((item, index) =>
    normalizeUncertainty(object(item), index + 1),
  );
  const activeCameraPresetId = stringValue(raw.active_camera_preset_id ?? raw.activeCameraPresetId);

  const model = bindOpeningsToWalls({
    schema: 'FloorplanJSON',
    version: 1,
    world: { unit: source.worldUnit },
    source,
    boundary,
    walls,
    openings,
    rooms,
    columns,
    fixedZones,
    furniture,
    cameraPresets,
    activeCameraPresetId: activeCameraPresetId || null,
    uncertainties,
    debug: {
      importedCoordinateUnit: stringValue(canvas.coordinate_unit) || 'px',
      raw,
    },
  });
  if (model.cameraPresets.length) return model;
  const defaultCameraPresets = createAgentCameraPresets(model);
  return {
    ...model,
    cameraPresets: defaultCameraPresets,
    activeCameraPresetId: defaultCameraPresets[0]?.id || null,
  };
}

export function serializeFloorplan(model: FloorplanModel) {
  const isMm = model.source.worldUnit === 'mm';
  const worldPerSourcePx = isMm ? model.source.mmPerSourcePx : 1;
  return {
    schema: 'FloorplanJSON',
    version: 1,
    world: {
      unit: model.source.worldUnit,
      calibrated: model.source.calibrated,
      source_px_to_mm: isMm && model.source.calibrated ? model.source.mmPerSourcePx : null,
      world_per_source_px: worldPerSourcePx,
      scale_basis: model.source.calibrated ? 'manual_or_visible_scale' : 'none',
      note: model.source.calibrated
        ? model.source.scaleEvidence || 'Calibrated in editor'
        : 'No reliable visible scale; geometry uses source image pixels.',
    },
    canvas: {
      image_path: model.source.imagePath,
      image_size_px: model.source.imageSizePx,
      coordinate_unit: 'source_px',
    },
    source: {
      image_path: model.source.imagePath,
      image_size_px: model.source.imageSizePx,
      transform: {
        source_unit: 'px',
        world_unit: model.source.worldUnit,
        world_per_px: worldPerSourcePx,
        mm_per_px: isMm && model.source.calibrated ? model.source.mmPerSourcePx : null,
        calibrated: model.source.calibrated,
        evidence: model.source.scaleEvidence,
        offset_mm: model.source.offsetMm,
        image_scale: model.source.imageScale,
        opacity: model.source.opacity,
        calibration_ruler: {
          start: model.source.calibrationRuler.start,
          end: model.source.calibrationRuler.end,
          known_length_mm: model.source.calibrationRuler.knownLengthMm || null,
        },
      },
    },
    calibration: {
      px_to_mm: isMm && model.source.calibrated ? model.source.mmPerSourcePx : null,
      scale_confidence: model.source.calibrated ? 1 : 0,
      scale_evidence: model.source.scaleEvidence,
    },
    boundary: {
      id: model.boundary.id,
      ...(isMm ? { points_mm: model.boundary.points } : { points: model.boundary.points, points_px: model.boundary.points }),
      confidence: model.boundary.confidence,
    },
    walls: model.walls.map((wall) => ({
      id: wall.id,
      kind: wall.kind,
      structural: wall.structural,
      ...(isMm
        ? { centerline_mm: wall.centerline, thickness_mm: wall.thicknessMm, height_mm: wall.heightMm }
        : { centerline: wall.centerline, centerline_px: wall.centerline, thickness_px: wall.thicknessMm, height_px: null }),
      confidence: wall.confidence,
      evidence: wall.evidence,
    })),
    openings: model.openings.map((opening) => ({
      id: opening.id,
      type: opening.type,
      wall_id: opening.wallId,
      side: opening.side,
      ...(isMm
        ? { segment_mm: opening.segment, width_mm: opening.widthMm, height_mm: opening.heightMm, sill_mm: opening.sillMm }
        : { segment: opening.segment, segment_px: opening.segment, width_px: opening.widthMm, height_px: null, sill_px: null }),
      confidence: opening.confidence,
      evidence: opening.evidence,
    })),
    rooms: model.rooms.map((room) => ({
      id: room.id,
      category: room.category,
      name: room.name,
      type: room.type,
      ...(isMm
        ? { polygon_mm: room.polygon, label_point_mm: room.labelPoint }
        : { polygon: room.polygon, polygon_px: room.polygon, label_point: room.labelPoint, label_point_px: room.labelPoint }),
      confidence: room.confidence,
    })),
    columns: model.columns.map((column) => ({
      id: column.id,
      ...(isMm
        ? { polygon_mm: column.polygon, bbox_mm: column.bbox }
        : { polygon: column.polygon, polygon_px: column.polygon, bbox: column.bbox, bbox_px: column.bbox }),
      confidence: column.confidence,
    })),
    fixed_zones: model.fixedZones.map((zone) => ({
      id: zone.id,
      type: zone.type,
      name: zone.name,
      ...(isMm ? { polygon_mm: zone.polygon } : { polygon: zone.polygon, polygon_px: zone.polygon }),
      confidence: zone.confidence,
      evidence: zone.evidence,
    })),
    furniture: model.furniture.map((item) => ({
      id: item.id,
      asset_id: item.assetId,
      name: item.name,
      category: item.category,
      ...(isMm
        ? { position_mm: item.position, size_mm: item.size }
        : { position: item.position, position_px: item.position, size: item.size, size_px: item.size }),
      rotation_deg: item.rotationDeg,
      z_index: item.zIndex,
      locked: item.locked,
    })),
    camera_presets: model.cameraPresets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      source: preset.source,
      position: preset.position,
      target: preset.target,
      fov_deg: preset.fovDeg,
      height_mm: preset.heightMm,
      lens_mm: preset.lensMm,
      footprint: preset.footprint
        ? {
            point: preset.footprint.point,
            angle_deg: preset.footprint.angleDeg,
            fov_deg: preset.footprint.fovDeg,
          }
        : undefined,
      room_ids: preset.roomIds,
    })),
    active_camera_preset_id: model.activeCameraPresetId,
    uncertainties: model.uncertainties.map((uncertainty) => ({
      id: uncertainty.id,
      target_ids: uncertainty.targetIds,
      severity: uncertainty.severity,
      message: uncertainty.message,
    })),
  };
}

function normalizeWall(
  raw: RawObject,
  index: number,
  scalePoint: (input: unknown, alreadyMm?: boolean) => Point | null,
  mmPerSourcePx: number,
): Wall | null {
  const centerlineMm = array(raw.centerline_mm);
  const centerlineInput = centerlineMm.length ? centerlineMm : raw.centerline;
  const centerline = array(centerlineInput)
    .map((item) => scalePoint(item, centerlineMm.length > 0))
    .filter(Boolean) as Point[];
  if (centerline.length < 2) return null;
  const structural = enumValue<StructuralType>(raw.structural, ['load_bearing', 'non_bearing', 'fixed', 'unknown'], 'unknown');
  const kind = enumValue<WallKind>(raw.kind, ['exterior', 'interior', 'partition', 'unknown'], 'unknown');
  const thicknessMm = positiveNumber(raw.thickness_mm);
  const thicknessPx = positiveNumber(raw.thickness_px);
  return {
    id: stringValue(raw.id) || `wall_${index.toString().padStart(3, '0')}`,
    kind,
    structural,
    centerline: [centerline[0], centerline[1]],
    thicknessMm: thicknessMm ?? (thicknessPx ? thicknessPx * mmPerSourcePx : kind === 'exterior' ? 160 : 100),
    heightMm: positiveNumber(raw.height_mm) ?? positiveNumber(raw.height_px) ?? DEFAULT_WALL_HEIGHT_MM,
    confidence: clamp01(raw.confidence),
    evidence: stringValue(raw.evidence) || '',
    sourcePx: array(raw.source_px).length >= 2 ? (array(raw.source_px).map(point).filter(Boolean).slice(0, 2) as [Point, Point]) : undefined,
  };
}

function normalizeOpening(
  raw: RawObject,
  index: number,
  scalePoint: (input: unknown, alreadyMm?: boolean) => Point | null,
  mmPerSourcePx: number,
): Opening | null {
  const segmentMm = array(raw.segment_mm);
  const segmentInput = segmentMm.length ? segmentMm : raw.segment;
  const segment = array(segmentInput)
    .map((item) => scalePoint(item, segmentMm.length > 0))
    .filter(Boolean) as Point[];
  if (segment.length < 2) return null;
  const type = enumValue(raw.type, ['entrance_door', 'door', 'sliding_door', 'window', 'bay_window', 'opening', 'unknown'], 'unknown');
  const widthMm = positiveNumber(raw.width_mm);
  const widthPx = positiveNumber(raw.width_px);
  const defaultHeight = type.includes('window') ? DEFAULT_WINDOW_HEIGHT_MM : DEFAULT_DOOR_HEIGHT_MM;
  return {
    id: stringValue(raw.id) || `opening_${index.toString().padStart(3, '0')}`,
    type,
    wallId: stringValue(raw.wall_id) || null,
    segment: [segment[0], segment[1]],
    widthMm: widthMm ?? (widthPx ? widthPx * mmPerSourcePx : distance(segment[0], segment[1])),
    heightMm: positiveNumber(raw.height_mm) ?? (type.includes('window') ? DEFAULT_WINDOW_HEIGHT_MM : defaultHeight),
    sillMm: positiveNumber(raw.sill_mm) ?? (type.includes('window') ? DEFAULT_WINDOW_SILL_MM : 0),
    side: Number(raw.side) === -1 ? -1 : 1,
    confidence: clamp01(raw.confidence),
    evidence: stringValue(raw.evidence) || '',
  };
}

function bindOpeningsToWalls(model: FloorplanModel): FloorplanModel {
  if (!model.walls.length || !model.openings.length) return model;
  return {
    ...model,
    openings: model.openings.map((opening) => {
      const center = midpoint(opening.segment);
      const explicitWall = opening.wallId ? model.walls.find((wall) => wall.id === opening.wallId) : null;
      const wall =
        explicitWall ||
        model.walls
          .map((candidate) => ({ wall: candidate, projected: projectPointToSegment(center, candidate.centerline) }))
          .sort((a, b) => a.projected.distance - b.projected.distance)[0]?.wall;
      if (!wall) return opening;
      const projected = projectPointToSegment(center, wall.centerline);
      return {
        ...opening,
        wallId: wall.id,
        segment: openingSegmentOnWall(projected.point, wall.centerline, Math.max(opening.widthMm, distance(opening.segment[0], opening.segment[1]))),
      };
    }),
  };
}

function normalizeRoom(
  raw: RawObject,
  index: number,
  scalePoint: (input: unknown, alreadyMm?: boolean) => Point | null,
  scalePoints: (input: unknown, alreadyMm?: boolean) => Point[],
): Room | null {
  const polygonMm = array(raw.polygon_mm);
  const polygon = closePolygon(scalePoints(polygonMm.length ? polygonMm : raw.polygon, polygonMm.length > 0));
  if (polygon.length < 4) return null;
  const category = Number.isFinite(Number(raw.category)) ? Number(raw.category) : roomCategoryForType(enumValue(raw.type, roomTypeValues, 'unknown'));
  const categoryMeta = ROOM_CATEGORIES[category] ?? ROOM_CATEGORIES[-1];
  const type = enumValue<RoomType>(raw.type, roomTypeValues, categoryMeta.type);
  return {
    id: stringValue(raw.id) || `room_${index.toString().padStart(3, '0')}`,
    category,
    name: stringValue(raw.name) || categoryMeta.label,
    type,
    polygon,
    labelPoint: polygonMm.length > 0 ? scalePoint(raw.label_point_mm, true) || polygon[0] : scalePoint(raw.label_point) || polygon[0],
    confidence: clamp01(raw.confidence),
  };
}

function normalizeColumn(
  raw: RawObject,
  index: number,
  scalePoints: (input: unknown, alreadyMm?: boolean) => Point[],
  mmPerSourcePx: number,
): Column | null {
  const polygonMm = array(raw.polygon_mm);
  const polygon = closePolygon(scalePoints(polygonMm.length ? polygonMm : raw.polygon, polygonMm.length > 0));
  const bboxMm = array(raw.bbox_mm);
  const bboxRaw = array(bboxMm.length ? bboxMm : raw.bbox).map((value) => Number(value));
  const bbox =
    bboxRaw.length >= 4
      ? ([
          bboxMm.length ? bboxRaw[0] : bboxRaw[0] * mmPerSourcePx,
          bboxMm.length ? bboxRaw[1] : bboxRaw[1] * mmPerSourcePx,
          bboxMm.length ? bboxRaw[2] : bboxRaw[2] * mmPerSourcePx,
          bboxMm.length ? bboxRaw[3] : bboxRaw[3] * mmPerSourcePx,
        ] as [number, number, number, number])
      : undefined;
  if (!polygon.length && !bbox) return null;
  return {
    id: stringValue(raw.id) || `column_${index.toString().padStart(3, '0')}`,
    polygon,
    bbox: bbox || [0, 0, 0, 0],
    confidence: clamp01(raw.confidence),
  };
}

function normalizeFixedZone(raw: RawObject, index: number, scalePoints: (input: unknown, alreadyMm?: boolean) => Point[]): FixedZone | null {
  const polygonMm = array(raw.polygon_mm);
  const polygon = closePolygon(scalePoints(polygonMm.length ? polygonMm : raw.polygon, polygonMm.length > 0));
  if (polygon.length < 4) return null;
  return {
    id: stringValue(raw.id) || `fixed_${index.toString().padStart(3, '0')}`,
    type: enumValue(raw.type, ['pipe_shaft', 'flue', 'structural_core', 'other'], 'other'),
    name: stringValue(raw.name) || 'Fixed Zone',
    polygon,
    confidence: clamp01(raw.confidence),
    evidence: stringValue(raw.evidence) || '',
  };
}

function normalizeFurniture(
  raw: RawObject,
  index: number,
  scalePoint: (input: unknown, alreadyMm?: boolean) => Point | null,
  mmPerSourcePx: number,
): Furniture | null {
  const positionMm = point(raw.position_mm);
  const positionPx = point(raw.position_px);
  const positionRaw = positionMm || positionPx || point(raw.position) || xyPoint(raw.x, raw.y);
  const sizeMm = point(raw.size_mm);
  const sizePx = point(raw.size_px);
  const sizeRaw = sizeMm || sizePx || point(raw.size) || xyPoint(raw.w, raw.h);
  if (!positionRaw || !sizeRaw) return null;

  const position: Point | null = positionMm
    ? positionRaw
    : positionPx
      ? [positionRaw[0] * mmPerSourcePx, positionRaw[1] * mmPerSourcePx]
      : scalePoint(positionRaw);
  const size: Point | null = sizeMm
    ? sizeRaw
    : sizePx
      ? [sizeRaw[0] * mmPerSourcePx, sizeRaw[1] * mmPerSourcePx]
      : scalePoint(sizeRaw);
  if (!position || !size) return null;

  return {
    id: stringValue(raw.id) || `furniture_${index.toString().padStart(3, '0')}`,
    assetId: stringValue(raw.asset_id) || stringValue(raw.assetId) || stringValue(raw.path) || 'generic-object',
    name: stringValue(raw.name) || 'Furniture',
    category: stringValue(raw.category) || 'Furniture',
    position: roundPoint(position),
    size: [Math.max(20, size[0]), Math.max(20, size[1])],
    rotationDeg: normalizeDegrees(Number(raw.rotation_deg ?? raw.rotationDeg ?? raw.rot ?? 0)),
    zIndex: Number.isFinite(Number(raw.z_index ?? raw.zIndex ?? raw.zi)) ? Number(raw.z_index ?? raw.zIndex ?? raw.zi) : 100,
    locked: booleanValue(raw.locked) ?? false,
  };
}

function normalizeCameraPreset(
  raw: RawObject,
  index: number,
  scalePoint: (input: unknown, alreadyMm?: boolean) => Point | null,
  mmPerSourcePx: number,
): CameraPreset | null {
  const position = vec3(raw.position);
  const target = vec3(raw.target);
  if (!position || !target) return null;
  const alreadyMm = booleanValue(raw.world_unit_is_mm) ?? false;
  const scaleVec3 = (value: Vec3): Vec3 =>
    alreadyMm ? value : [value[0] * mmPerSourcePx, value[1] * mmPerSourcePx, value[2] * mmPerSourcePx];
  const scaledPosition = scaleVec3(position);
  const scaledTarget = scaleVec3(target);
  const footprintRaw = object(raw.footprint);
  const footprintPoint = scalePoint(footprintRaw.point, alreadyMm);
  return {
    id: stringValue(raw.id) || `camera_${index.toString().padStart(3, '0')}`,
    name: stringValue(raw.name) || `Camera ${index}`,
    source: enumValue(raw.source, ['user', 'agent', 'system'], 'user'),
    position: scaledPosition,
    target: scaledTarget,
    fovDeg: clampNumber(raw.fov_deg ?? raw.fovDeg, 18, 100, 45),
    heightMm: positiveNumber(raw.height_mm ?? raw.heightMm) ?? scaledPosition[1],
    lensMm: positiveNumber(raw.lens_mm ?? raw.lensMm) ?? 28,
    footprint: footprintPoint
      ? {
          point: footprintPoint,
          angleDeg: Number.isFinite(Number(footprintRaw.angle_deg ?? footprintRaw.angleDeg))
            ? Number(footprintRaw.angle_deg ?? footprintRaw.angleDeg)
            : 0,
          fovDeg: clampNumber(footprintRaw.fov_deg ?? footprintRaw.fovDeg, 18, 100, 60),
        }
      : undefined,
    roomIds: array(raw.room_ids ?? raw.roomIds).map((value) => String(value)),
  };
}

function normalizeUncertainty(raw: RawObject, index: number): Uncertainty {
  return {
    id: stringValue(raw.id) || `u_${index.toString().padStart(3, '0')}`,
    targetIds: array(raw.target_ids).map((value) => String(value)),
    severity: enumValue(raw.severity, ['info', 'warning', 'error'], 'warning'),
    message: stringValue(raw.message) || '',
  };
}

const roomTypeValues: RoomType[] = [
  'living',
  'dining',
  'kitchen',
  'bathroom',
  'master_bedroom',
  'bedroom',
  'balcony',
  'service_balcony',
  'corridor',
  'entry',
  'storage',
  'walk_in_closet',
  'study',
  'utility',
  'elevator_hall',
  'garage',
  'stair',
  'outdoor',
  'unknown',
];

function object(value: unknown): RawObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawObject) : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function point(value: unknown): Point | null {
  const values = array(value);
  if (values.length < 2) return null;
  const x = Number(values[0]);
  const y = Number(values[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

function vec3(value: unknown): Vec3 | null {
  const values = array(value);
  if (values.length < 3) return null;
  const x = Number(values[0]);
  const y = Number(values[1]);
  const z = Number(values[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

function xyPoint(xValue: unknown, yValue: unknown): Point | null {
  const x = Number(xValue);
  const y = Number(yValue);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

function positiveNumber(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function clamp01(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((value % 360) + 360) % 360;
}
