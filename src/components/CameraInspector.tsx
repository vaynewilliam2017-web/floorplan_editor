import { Camera, Sparkles } from 'lucide-react';
import { createAgentCameraPresets } from '../lib/cameraPresets';
import { boundsOf, flatten } from '../lib/geometry';
import { createOperationId } from '../lib/operations';
import { ROOM_CATEGORIES } from '../lib/roomCategories';
import type { CameraPreset, FloorplanModel, Operation, Point } from '../lib/types';

interface Props {
  model: FloorplanModel;
  onCommit: (operation: Operation) => void;
  showActions?: boolean;
}

export function CameraInspector({ model, onCommit, showActions = true }: Props) {
  const presets = model.cameraPresets;
  const activePreset = presets.find((preset) => preset.id === model.activeCameraPresetId) || presets[0] || null;
  const activeIndex = activePreset ? Math.max(0, presets.findIndex((preset) => preset.id === activePreset.id)) : -1;
  const activeMeta = cameraPresetMeta(activePreset);

  const generateAgentPresets = () => {
    const nextPresets = createAgentCameraPresets(model);
    nextPresets.forEach((preset) => {
      onCommit({
        id: createOperationId('upsert_camera_preset'),
        type: 'upsert_camera_preset',
        source: 'user',
        targetId: 'floorplan',
        payload: { preset },
      });
    });
    if (nextPresets[0]) setActivePreset(nextPresets[0].id, onCommit);
  };

  return (
    <div className="camera-inspector-stack">
      <section className="panel camera-recommendation-panel">
        <div className="panel-title with-icon">
          <Camera size={15} />
          室内平面图相机角度推荐
        </div>
        <div className="camera-recommendation-body">
          <CameraPlanMap model={model} presets={presets} activePresetId={activePreset?.id || null} onSelect={(id) => setActivePreset(id, onCommit)} />
          <div className="camera-detail-column">
            <div className="camera-detail-card">
              <span>视角详情</span>
              <div className="camera-detail-heading">
                <i>{activeIndex >= 0 ? activeIndex + 1 : '-'}</i>
                <strong>{activePreset?.name || 'No preset'}</strong>
              </div>
              <div className="camera-detail-stats">
                <b>FOV {Math.round(activePreset?.fovDeg || 0)}°</b>
                <b>{formatHeight(activePreset?.heightMm || 0, model.source.worldUnit)}</b>
                <b>{Math.round(activePreset?.lensMm || 0)}mm</b>
              </div>
              <p>{activeMeta.description}</p>
              <em>{activeMeta.tip}</em>
            </div>
            {showActions && (
              <div className="camera-actions compact-camera-actions">
                <button className="primary-button" type="button" onClick={generateAgentPresets}>
                  <Sparkles size={15} />
                  Regenerate views
                </button>
              </div>
            )}
            <div className="camera-row-list">
              {presets.map((preset, index) => (
                <button
                  key={preset.id}
                  className={`camera-row ${preset.id === activePreset?.id ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActivePreset(preset.id, onCommit)}
                >
                  <span className="camera-row-dot">{index + 1}</span>
                  <strong>{preset.name}</strong>
                  <small>{Math.round(preset.lensMm)}mm / {formatHeight(preset.heightMm, model.source.worldUnit)}</small>
                  <em>{Math.round(preset.fovDeg)}°</em>
                </button>
              ))}
              {!presets.length && <div className="empty-state">No camera presets yet.</div>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function formatHeight(heightMm: number, unit: FloorplanModel['source']['worldUnit']) {
  if (!heightMm) return '-';
  if (unit !== 'mm') return `${Math.round(heightMm)}px`;
  return heightMm >= 100 ? `${(heightMm / 1000).toFixed(1)}m` : `${Math.round(heightMm)}px`;
}

function cameraPresetMeta(preset: CameraPreset | null) {
  if (!preset) {
    return {
      description: 'Generate deterministic presets from the current floorplan JSON.',
      tip: '视角会根据门洞、窗户、房间质心和通廊位置生成。',
    };
  }
  const meta: Record<string, { description: string; tip: string }> = {
    agent_entry_panorama: {
      description: '入口处向内，一眼观察主要空间布局与动线关系，空间纵深感最强。',
      tip: '定场首图：建立整体空间认知，适合作为方案首张视角。',
    },
    agent_living_main: {
      description: '站在客厅主要活动区，正对核心墙面和家具布置。',
      tip: '用于检查客厅尺度、沙发电视关系和主要开窗面。',
    },
    agent_living_diagonal: {
      description: '从公共区对角观察，强化房间纵深和连通关系。',
      tip: '适合发现门洞、墙体和家具之间的遮挡问题。',
    },
    agent_master_bedroom: {
      description: '贴近卧室入口或床尾方向，观察主卧完整开间。',
      tip: '适合确认床、衣柜、窗户和动线的相对位置。',
    },
    agent_kitchen: {
      description: '沿厨房操作面或采光面取景，优先检查台面和通行尺度。',
      tip: '适合后续接入厨卫细部、橱柜和设备检查。',
    },
    agent_circulation: {
      description: '沿走廊或楼梯通廊取景，观察连接空间的方向性。',
      tip: '用于判断入户、过道、楼梯和房间入口之间的关系。',
    },
  };
  return (
    meta[preset.id] || {
      description: 'Preset is saved in JSON and points to the current 3D camera.',
      tip: '视角位置来自 JSON：房间质心、门洞位置和推荐方向。',
    }
  );
}

function setActivePreset(cameraPresetId: string, onCommit: (operation: Operation) => void) {
  onCommit({
    id: createOperationId('set_active_camera_preset'),
    type: 'set_active_camera_preset',
    source: 'user',
    targetId: 'floorplan',
    payload: { cameraPresetId },
  });
}

function CameraPlanMap({
  model,
  presets,
  activePresetId,
  onSelect,
}: {
  model: FloorplanModel;
  presets: CameraPreset[];
  activePresetId: string | null;
  onSelect: (id: string) => void;
}) {
  const points = [...model.boundary.points, ...model.rooms.flatMap((room) => room.polygon), ...model.walls.flatMap((wall) => wall.centerline)];
  const bounds = boundsOf(points.length ? points : [[0, 0], [1000, 1000]]);
  const width = 330;
  const height = 268;
  const pad = 18;
  const scale = Math.min((width - pad * 2) / Math.max(bounds.width, 1), (height - pad * 2) / Math.max(bounds.height, 1));
  const tx = (point: Point): Point => [pad + (point[0] - bounds.minX) * scale, pad + (point[1] - bounds.minY) * scale];

  return (
    <svg className="camera-plan-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Camera recommendation floorplan map">
      <rect x="0" y="0" width={width} height={height} fill="#f8fafc" />
      {model.rooms.map((room) => {
        const category = ROOM_CATEGORIES[room.category] || ROOM_CATEGORIES[-1];
        return <polygon key={room.id} points={flatten(room.polygon.map(tx)).join(' ')} fill={category.color} opacity="0.36" />;
      })}
      {model.walls.map((wall) => (
        <line
          key={wall.id}
          x1={tx(wall.centerline[0])[0]}
          y1={tx(wall.centerline[0])[1]}
          x2={tx(wall.centerline[1])[0]}
          y2={tx(wall.centerline[1])[1]}
          stroke="#1f2937"
          strokeWidth="4"
          strokeLinecap="round"
        />
      ))}
      {model.openings.map((opening) => (
        <line
          key={opening.id}
          x1={tx(opening.segment[0])[0]}
          y1={tx(opening.segment[0])[1]}
          x2={tx(opening.segment[1])[0]}
          y2={tx(opening.segment[1])[1]}
          stroke={opening.type.includes('window') ? '#0ea5e9' : '#f97316'}
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
      {presets.map((preset, index) => {
        const point = tx(preset.footprint?.point || [preset.target[0], preset.target[2]]);
        const cone = cameraCone(point, preset.footprint?.angleDeg || 0, preset.footprint?.fovDeg || preset.fovDeg);
        const active = preset.id === activePresetId;
        return (
          <g key={preset.id} onClick={() => onSelect(preset.id)} className="camera-map-node">
            <polygon points={flatten(cone).join(' ')} fill={active ? '#8b5cf6' : '#60a5fa'} opacity={active ? 0.28 : 0.18} />
            <circle cx={point[0]} cy={point[1]} r={active ? 7 : 5} fill={active ? '#7c3aed' : '#0ea5e9'} />
            <text x={point[0]} y={point[1] + 3} textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="700">
              {index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function cameraCone(point: Point, angleDeg: number, fovDeg: number): Point[] {
  const radius = 54;
  const angle = (angleDeg * Math.PI) / 180;
  const half = ((Math.max(25, Math.min(110, fovDeg)) / 2) * Math.PI) / 180;
  return [
    point,
    [point[0] + Math.cos(angle - half) * radius, point[1] + Math.sin(angle - half) * radius],
    [point[0] + Math.cos(angle + half) * radius, point[1] + Math.sin(angle + half) * radius],
  ];
}
