export type Point = [number, number];
export type Vec3 = [number, number, number];

export type EditorStage = 'calibrate' | 'cad' | 'model' | 'export';

export type WallKind = 'exterior' | 'interior' | 'partition' | 'unknown';
export type StructuralType = 'load_bearing' | 'non_bearing' | 'fixed' | 'unknown';
export type OpeningType =
  | 'entrance_door'
  | 'door'
  | 'sliding_door'
  | 'window'
  | 'bay_window'
  | 'opening'
  | 'unknown';

export type RoomType =
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'bathroom'
  | 'master_bedroom'
  | 'bedroom'
  | 'balcony'
  | 'service_balcony'
  | 'corridor'
  | 'entry'
  | 'storage'
  | 'walk_in_closet'
  | 'study'
  | 'utility'
  | 'elevator_hall'
  | 'garage'
  | 'stair'
  | 'outdoor'
  | 'unknown';

export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export interface SourceImage {
  imagePath: string;
  imageSizePx: Point;
  worldUnit: 'mm' | 'source_px';
  mmPerSourcePx: number;
  calibrated: boolean;
  scaleEvidence: string;
  offsetMm: Point;
  imageScale: number;
  opacity: number;
  calibrationRuler: {
    start: Point;
    end: Point;
    knownLengthMm: number;
  };
}

export interface Boundary {
  id: string;
  points: Point[];
  confidence: number;
}

export interface Wall {
  id: string;
  kind: WallKind;
  structural: StructuralType;
  centerline: [Point, Point];
  thicknessMm: number;
  heightMm: number;
  confidence: number;
  evidence: string;
  sourcePx?: [Point, Point];
}

export interface Opening {
  id: string;
  type: OpeningType;
  wallId: string | null;
  segment: [Point, Point];
  widthMm: number;
  heightMm: number | null;
  sillMm: number | null;
  side: 1 | -1;
  confidence: number;
  evidence: string;
}

export interface Room {
  id: string;
  category: number;
  name: string;
  type: RoomType;
  polygon: Point[];
  labelPoint: Point;
  confidence: number;
}

export interface Column {
  id: string;
  polygon: Point[];
  bbox: [number, number, number, number];
  confidence: number;
}

export interface FixedZone {
  id: string;
  type: 'pipe_shaft' | 'flue' | 'structural_core' | 'other';
  name: string;
  polygon: Point[];
  confidence: number;
  evidence: string;
}

export interface Furniture {
  id: string;
  assetId: string;
  name: string;
  category: string;
  position: Point;
  size: Point;
  rotationDeg: number;
  zIndex: number;
  locked: boolean;
}

export interface CameraPreset {
  id: string;
  name: string;
  source: 'user' | 'agent' | 'system';
  position: Vec3;
  target: Vec3;
  fovDeg: number;
  heightMm: number;
  lensMm: number;
  footprint?: {
    point: Point;
    angleDeg: number;
    fovDeg: number;
  };
  roomIds: string[];
}

export interface Uncertainty {
  id: string;
  targetIds: string[];
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export interface FloorplanModel {
  schema: 'FloorplanJSON';
  version: 1;
  world: {
    unit: 'mm' | 'source_px';
  };
  source: SourceImage;
  boundary: Boundary;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  columns: Column[];
  fixedZones: FixedZone[];
  furniture: Furniture[];
  cameraPresets: CameraPreset[];
  activeCameraPresetId: string | null;
  uncertainties: Uncertainty[];
  debug?: Record<string, unknown>;
}

export type Selection =
  | { type: 'wall'; id: string }
  | { type: 'opening'; id: string }
  | { type: 'room'; id: string }
  | { type: 'furniture'; id: string }
  | { type: 'background'; id: 'source-image' }
  | null;

export type Tool = 'select' | 'pan' | 'wall' | 'opening' | 'room';

export type OperationSource = 'user' | 'ai';

export type LayerKey =
  | 'backgroundLayer'
  | 'roomLayer'
  | 'wallLayer'
  | 'openingLayer'
  | 'furnitureLayer'
  | 'annotationLayer'
  | 'controlLayer';

export type LayerVisibility = Record<LayerKey, boolean>;
export type LayerLocks = Record<LayerKey, boolean>;

export type Operation =
  | {
      id: string;
      type: 'add_wall';
      source: OperationSource;
      targetId: 'floorplan';
      payload: { wall: Wall };
    }
  | {
      id: string;
      type: 'move_wall_endpoint';
      source: OperationSource;
      targetId: string;
      payload: { endpoint: 0 | 1; point: Point };
    }
  | {
      id: string;
      type: 'move_wall';
      source: OperationSource;
      targetId: string;
      payload: { offset: Point };
    }
  | {
      id: string;
      type: 'set_wall_thickness';
      source: OperationSource;
      targetId: string;
      payload: { thicknessMm: number };
    }
  | {
      id: string;
      type: 'set_wall_structural';
      source: OperationSource;
      targetId: string;
      payload: { structural: StructuralType };
    }
  | {
      id: string;
      type: 'add_opening';
      source: OperationSource;
      targetId: 'floorplan';
      payload: { opening: Opening };
    }
  | {
      id: string;
      type: 'move_opening_on_wall';
      source: OperationSource;
      targetId: string;
      payload: { wallId: string; center: Point };
    }
  | {
      id: string;
      type: 'set_opening_width';
      source: OperationSource;
      targetId: string;
      payload: { widthMm: number };
    }
  | {
      id: string;
      type: 'flip_opening_side';
      source: OperationSource;
      targetId: string;
      payload: Record<string, never>;
    }
  | {
      id: string;
      type: 'set_opening_angle';
      source: OperationSource;
      targetId: string;
      payload: { angleDeg: number };
    }
  | {
      id: string;
      type: 'rename_room';
      source: OperationSource;
      targetId: string;
      payload: { name: string };
    }
  | {
      id: string;
      type: 'add_room';
      source: OperationSource;
      targetId: 'floorplan';
      payload: { room: Room };
    }
  | {
      id: string;
      type: 'move_room';
      source: OperationSource;
      targetId: string;
      payload: { offset: Point };
    }
  | {
      id: string;
      type: 'move_room_vertex';
      source: OperationSource;
      targetId: string;
      payload: { index: number; point: Point };
    }
  | {
      id: string;
      type: 'move_room_edge';
      source: OperationSource;
      targetId: string;
      payload: { edgeIndex: number; offset: Point };
    }
  | {
      id: string;
      type: 'set_room_category';
      source: OperationSource;
      targetId: string;
      payload: { category: number; type: RoomType };
    }
  | {
      id: string;
      type: 'add_furniture';
      source: OperationSource;
      targetId: 'floorplan';
      payload: { furniture: Furniture };
    }
  | {
      id: string;
      type: 'move_furniture';
      source: OperationSource;
      targetId: string;
      payload: { position: Point };
    }
  | {
      id: string;
      type: 'set_furniture_size';
      source: OperationSource;
      targetId: string;
      payload: { size: Point };
    }
  | {
      id: string;
      type: 'set_furniture_rotation';
      source: OperationSource;
      targetId: string;
      payload: { rotationDeg: number };
    }
  | {
      id: string;
      type: 'delete_furniture';
      source: OperationSource;
      targetId: string;
      payload: Record<string, never>;
    }
  | {
      id: string;
      type: 'calibrate_background_image';
      source: OperationSource;
      targetId: 'source-image';
      payload: { mmPerSourcePx: number; evidence: string };
    }
  | {
      id: string;
      type: 'set_background_offset';
      source: OperationSource;
      targetId: 'source-image';
      payload: { offsetMm: Point };
    }
  | {
      id: string;
      type: 'set_background_scale';
      source: OperationSource;
      targetId: 'source-image';
      payload: { imageScale: number };
    }
  | {
      id: string;
      type: 'set_background_opacity';
      source: OperationSource;
      targetId: 'source-image';
      payload: { opacity: number };
    }
  | {
      id: string;
      type: 'set_calibration_ruler';
      source: OperationSource;
      targetId: 'source-image';
      payload: { start: Point; end: Point };
    }
  | {
      id: string;
      type: 'set_calibration_known_length';
      source: OperationSource;
      targetId: 'source-image';
      payload: { knownLengthMm: number };
    }
  | {
      id: string;
      type: 'upsert_camera_preset';
      source: OperationSource;
      targetId: 'floorplan';
      payload: { preset: CameraPreset };
    }
  | {
      id: string;
      type: 'delete_camera_preset';
      source: OperationSource;
      targetId: string;
      payload: Record<string, never>;
    }
  | {
      id: string;
      type: 'set_active_camera_preset';
      source: OperationSource;
      targetId: 'floorplan';
      payload: { cameraPresetId: string | null };
    }
  | {
      id: string;
      type: 'delete_wall';
      source: OperationSource;
      targetId: string;
      payload: Record<string, never>;
    }
  | {
      id: string;
      type: 'delete_room';
      source: OperationSource;
      targetId: string;
      payload: Record<string, never>;
    }
  | {
      id: string;
      type: 'delete_opening';
      source: OperationSource;
      targetId: string;
      payload: Record<string, never>;
    };

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'suggestion';
  target: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
    suggestions: number;
  };
}

export interface SnapGuide {
  id: string;
  orientation: 'horizontal' | 'vertical' | 'point';
  points: Point[];
  label: string;
}
