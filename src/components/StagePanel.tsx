import { Camera, Cuboid, Download, FileJson, ImageDown, Palette, RefreshCw, Sofa, Sparkles } from 'lucide-react';
import { boundsOf, polygonArea } from '../lib/geometry';
import { FurniturePanel } from './FurniturePanel';
import { createAgentCameraPresets } from '../lib/cameraPresets';
import { ROOM_CATEGORIES } from '../lib/roomCategories';
import { createOperationId } from '../lib/operations';
import type { CameraPreset, EditorStage, FloorplanModel, OpeningType, Operation, Point, Selection, Vec3 } from '../lib/types';
import type { FurnitureCatalogItem } from '../lib/furniture/catalog';

interface Props {
  stage: EditorStage;
  model: FloorplanModel;
  selection: Selection;
  onCommit: (operation: Operation) => void;
  onAddFurniture: (item: FurnitureCatalogItem, category: string) => void;
  onAddOpening: (type: OpeningType) => void;
  onRebuildModel: () => void;
  onExportModelPng: () => void;
  onExportCameraJson: () => void;
}

export function StagePanel({
  stage,
  model,
  selection,
  onCommit,
  onAddFurniture,
  onAddOpening,
  onRebuildModel,
  onExportModelPng,
  onExportCameraJson,
}: Props) {
  return (
    <aside className="stage-panel">
      <PanelHeader stage={stage} />
      {stage === 'calibrate' && <CalibratePanel model={model} selection={selection} onCommit={onCommit} />}
      {stage === 'cad' && <CadPanel onAddFurniture={onAddFurniture} onAddOpening={onAddOpening} />}
      {stage === 'model' && (
        <ModelPanel
          model={model}
          onCommit={onCommit}
          onRebuildModel={onRebuildModel}
          onExportModelPng={onExportModelPng}
          onExportCameraJson={onExportCameraJson}
        />
      )}
      {stage === 'export' && <ExportPanel model={model} />}
    </aside>
  );
}

function PanelHeader({ stage }: { stage: EditorStage }) {
  const copy = {
    calibrate: {
      icon: <Palette size={17} />,
      title: '平面校对',
      desc: '校对房间色块、墙体和门窗位置。',
    },
    cad: {
      icon: <Sofa size={17} />,
      title: '平面 CAD',
      desc: '基于校对 JSON 放置门窗符号和家具。',
    },
    model: {
      icon: <Cuboid size={17} />,
      title: '草模重建',
      desc: '只看开顶墙体、地面和基础体块。',
    },
    export: {
      icon: <ImageDown size={17} />,
      title: '视角截图',
      desc: '选择推荐相机并导出当前 3D 截图。',
    },
  }[stage];

  return (
    <div className="stage-panel-header">
      <div className="stage-panel-icon">{copy.icon}</div>
      <div>
        <h2>{copy.title}</h2>
        <p>{copy.desc}</p>
      </div>
    </div>
  );
}

function CalibratePanel({
  model,
  selection,
  onCommit,
}: {
  model: FloorplanModel;
  selection: Selection;
  onCommit: (operation: Operation) => void;
}) {
  const selectedRoom = selection?.type === 'room' ? model.rooms.find((room) => room.id === selection.id) : null;
  const roomArea = selectedRoom ? polygonArea(selectedRoom.polygon) : 0;
  const totalRoomArea = model.rooms.reduce((sum, room) => sum + polygonArea(room.polygon), 0);
  const roomCategoryCounts = model.rooms.reduce<Record<number, number>>((counts, room) => {
    counts[room.category] = (counts[room.category] || 0) + 1;
    return counts;
  }, {});
  const dominantCategories = Object.entries(roomCategoryCounts)
    .map(([category, count]) => ({
      category: Number(category),
      count,
      meta: ROOM_CATEGORIES[Number(category)] || ROOM_CATEGORIES[-1],
    }))
    .sort((a, b) => b.count - a.count || a.category - b.category)
    .slice(0, 6);
  const areaLabel = selectedRoom
    ? model.source.worldUnit === 'mm'
      ? `${(roomArea / 1_000_000).toFixed(2)} m2`
      : `${Math.round(roomArea)} px2`
    : '-';
  const totalAreaLabel =
    model.source.worldUnit === 'mm' ? `${(totalRoomArea / 1_000_000).toFixed(1)} m2` : `${Math.round(totalRoomArea)} px2`;
  const selectedCategory = selectedRoom ? ROOM_CATEGORIES[selectedRoom.category] || ROOM_CATEGORIES[-1] : null;

  return (
    <div className="stage-panel-scroll">
      <section className="stage-section">
        <div className="stage-section-title">
          <Palette size={14} />
          Room inspector
        </div>
        {selectedRoom ? (
          <>
            <div className="selected-card">
              <div className="selected-room-heading">
                <span className="legend-swatch" style={{ background: selectedCategory?.color, borderColor: selectedCategory?.stroke }} />
                <strong>{selectedRoom.name}</strong>
              </div>
              <span>{selectedRoom.id} / {areaLabel}</span>
            </div>
            <div className="stage-readout-grid">
              <Metric label="Category" value={`${selectedRoom.category}`} />
              <Metric label="Vertices" value={String(Math.max(0, selectedRoom.polygon.length - 1))} />
              <Metric label="Type" value={selectedRoom.type} />
              <Metric label="Confidence" value={`${Math.round(selectedRoom.confidence * 100)}%`} />
            </div>
          </>
        ) : (
          <p className="stage-help">Select a room polygon to inspect it, or drag a room color block from the bottom legend.</p>
        )}
      </section>

      <section className="stage-section">
        <div className="stage-section-title">
          <FileJson size={14} />
          Plan statistics
        </div>
        <div className="stage-readout-grid">
          <Metric label="Rooms" value={String(model.rooms.length)} />
          <Metric label="Area" value={totalAreaLabel} />
          <Metric label="Walls" value={String(model.walls.length)} />
          <Metric label="Openings" value={String(model.openings.length)} />
        </div>
        <div className="category-count-list">
          {dominantCategories.map(({ category, count, meta }) => (
            <div key={category} className="category-count-row">
              <span className="legend-swatch" style={{ background: meta.color, borderColor: meta.stroke }} />
              <strong>{category}. {meta.label}</strong>
              <em>{count}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="stage-section">
        <div className="stage-section-title">
          <Palette size={14} />
          Category remap
        </div>
        <div className="category-palette compact">
          {Object.entries(ROOM_CATEGORIES)
            .filter(([key]) => Number(key) >= 0)
            .map(([key, value]) => {
              const category = Number(key);
              return (
                <button
                  className={selectedRoom?.category === category ? 'active' : ''}
                  key={key}
                  type="button"
                  disabled={!selectedRoom}
                  onClick={() => {
                    if (!selectedRoom) return;
                    onCommit({
                      id: createOperationId('set_room_category'),
                      type: 'set_room_category',
                      source: 'user',
                      targetId: selectedRoom.id,
                      payload: { category, type: value.type },
                    });
                  }}
                >
                  <span className="legend-swatch" style={{ background: value.color, borderColor: value.stroke }} />
                  <span>{category}. {value.label}</span>
                </button>
              );
            })}
        </div>
      </section>
    </div>
  );
}

function CadPanel({
  onAddFurniture,
  onAddOpening,
}: {
  onAddFurniture: (item: FurnitureCatalogItem, category: string) => void;
  onAddOpening: (type: OpeningType) => void;
}) {
  return (
    <div className="stage-panel-scroll cad-panel-scroll cad-furniture-only">
      <FurniturePanel onAddFurniture={onAddFurniture} onAddOpening={onAddOpening} />
    </div>
  );
}

function ModelPanel({
  model,
  onCommit,
  onRebuildModel,
  onExportModelPng,
  onExportCameraJson,
}: {
  model: FloorplanModel;
  onCommit: (operation: Operation) => void;
  onRebuildModel: () => void;
  onExportModelPng: () => void;
  onExportCameraJson: () => void;
}) {
  const activePreset = model.cameraPresets.find((preset) => preset.id === model.activeCameraPresetId) || model.cameraPresets[0] || null;
  const bounds = boundsOf([
    ...model.boundary.points,
    ...model.rooms.flatMap((room) => room.polygon),
    ...model.walls.flatMap((wall) => wall.centerline),
  ]);
  const span = Math.max(bounds.width, bounds.height, model.source.worldUnit === 'mm' ? 4500 : 450);
  const minX = Math.floor(bounds.minX - span * 0.35);
  const maxX = Math.ceil(bounds.maxX + span * 0.35);
  const minZ = Math.floor(bounds.minY - span * 0.35);
  const maxZ = Math.ceil(bounds.maxY + span * 0.35);
  const heightMin = model.source.worldUnit === 'mm' ? 600 : 60;
  const heightMax = model.source.worldUnit === 'mm' ? 3200 : 360;
  const heightStep = model.source.worldUnit === 'mm' ? 50 : 5;
  const moveStep = model.source.worldUnit === 'mm' ? 100 : 10;
  const yawDeg = activePreset ? cameraYawDeg(activePreset) : 0;
  const targetX = activePreset?.target[0] || 0;
  const targetZ = activePreset?.target[2] || 0;

  const updatePreset = (patch: Partial<CameraPreset>) => {
    if (!activePreset) return;
    upsertCameraPreset(mergeCameraPreset(activePreset, patch), onCommit);
  };

  const generateCameraPresets = () => {
    const nextPresets = createAgentCameraPresets(model);
    nextPresets.forEach((preset) => upsertCameraPreset(preset, onCommit));
  };

  return (
    <div className="stage-panel-scroll model-control-scroll">
      <section className="stage-section model-camera-section">
        <div className="stage-section-title">
          <Camera size={14} />
          Camera
        </div>
        {activePreset ? (
          <div className="camera-control-stack">
            <label className="stage-field">
              <span>Preset</span>
              <select
                className="field-input compact-input"
                value={activePreset.id}
                onChange={(event) =>
                  onCommit({
                    id: createOperationId('set_active_camera_preset'),
                    type: 'set_active_camera_preset',
                    source: 'user',
                    targetId: 'floorplan',
                    payload: { cameraPresetId: event.target.value },
                  })
                }
              >
                {model.cameraPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
            <CameraSlider
              label="Lens"
              value={activePreset.lensMm}
              min={18}
              max={70}
              step={1}
              suffix="mm"
              onChange={(lensMm) =>
                updatePreset({
                  lensMm,
                  fovDeg: lensToFov(lensMm),
                  footprint: activePreset.footprint ? { ...activePreset.footprint, fovDeg: lensToFov(lensMm) } : undefined,
                })
              }
            />
            <CameraSlider
              label="FOV"
              value={activePreset.fovDeg}
              min={35}
              max={100}
              step={1}
              suffix="deg"
              onChange={(fovDeg) =>
                updatePreset({
                  fovDeg,
                  footprint: activePreset.footprint ? { ...activePreset.footprint, fovDeg } : undefined,
                })
              }
            />
            <CameraSlider
              label="Height"
              value={activePreset.heightMm}
              min={heightMin}
              max={heightMax}
              step={heightStep}
              suffix={model.source.worldUnit === 'mm' ? 'mm' : 'px'}
              onChange={(heightMm) =>
                updatePreset({
                  heightMm,
                  position: [activePreset.position[0], heightMm, activePreset.position[2]],
                })
              }
            />
            <CameraSlider
              label="View angle"
              value={yawDeg}
              min={0}
              max={360}
              step={5}
              suffix="deg"
              onChange={(angleDeg) => updatePreset(turnCameraInPlace(activePreset, angleDeg))}
            />
            <div className="camera-point-grid">
              <CameraSlider
                label="View X"
                value={activePreset.position[0]}
                min={minX}
                max={maxX}
                step={moveStep}
                onChange={(x) => updatePreset(moveCameraPosition(activePreset, [x, activePreset.position[1], activePreset.position[2]]))}
              />
              <CameraSlider
                label="View Y"
                value={activePreset.position[2]}
                min={minZ}
                max={maxZ}
                step={moveStep}
                onChange={(z) => updatePreset(moveCameraPosition(activePreset, [activePreset.position[0], activePreset.position[1], z]))}
              />
              <CameraSlider
                label="Target X"
                value={targetX}
                min={minX}
                max={maxX}
                step={moveStep}
                onChange={(x) => updatePreset(moveCameraTarget(activePreset, [x, targetZ]))}
              />
              <CameraSlider
                label="Target Y"
                value={targetZ}
                min={minZ}
                max={maxZ}
                step={moveStep}
                onChange={(z) => updatePreset(moveCameraTarget(activePreset, [targetX, z]))}
              />
            </div>
          </div>
        ) : (
          <p className="stage-help">Generate camera presets before tuning the model view.</p>
        )}
      </section>

      <section className="stage-section model-action-section">
        <div className="stage-section-title">
          <Sparkles size={14} />
          Actions
        </div>
        <div className="model-action-grid">
          <button className="primary-button" type="button" onClick={onRebuildModel}>
            <RefreshCw size={14} />
            Rebuild
          </button>
          <button className="primary-button" type="button" onClick={generateCameraPresets}>
            <Sparkles size={14} />
            Generate
          </button>
          <button className="file-button" type="button" disabled={!activePreset} onClick={onExportCameraJson}>
            <FileJson size={14} />
            Camera JSON
          </button>
          <button className="file-button" type="button" onClick={onExportModelPng}>
            <Download size={14} />
            PNG
          </button>
        </div>
      </section>
    </div>
  );
}

function ExportPanel({ model }: { model: FloorplanModel }) {
  const activePreset = model.cameraPresets.find((preset) => preset.id === model.activeCameraPresetId) || model.cameraPresets[0] || null;
  return (
    <div className="stage-panel-scroll">
      <section className="stage-section">
        <div className="stage-section-title">
          <Camera size={14} />
          Camera presets
        </div>
        <div className="stage-readout-grid">
          <Metric label="Presets" value={String(model.cameraPresets.length)} />
          <Metric label="Active" value={activePreset?.name || '-'} />
        </div>
        <p className="stage-help">Select a recommended view on the right. Use the small buttons in the 3D title bar to export camera JSON or PNG.</p>
      </section>
    </div>
  );
}

function CameraSlider({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-field model-slider-field">
      <span>
        <strong>{label}</strong>
        <small>
          {Math.round(value)}
          {suffix ? ` ${suffix}` : ''}
        </small>
      </span>
      <input type="range" min={min} max={max} step={step} value={clamp(value, min, max)} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function upsertCameraPreset(preset: CameraPreset, onCommit: (operation: Operation) => void) {
  onCommit({
    id: createOperationId('upsert_camera_preset'),
    type: 'upsert_camera_preset',
    source: 'user',
    targetId: 'floorplan',
    payload: { preset },
  });
}

function mergeCameraPreset(preset: CameraPreset, patch: Partial<CameraPreset>): CameraPreset {
  return {
    ...preset,
    ...patch,
    source: preset.source === 'system' ? 'user' : preset.source,
  };
}

function lensToFov(lensMm: number) {
  return Math.round(clamp((2 * Math.atan(36 / (2 * Math.max(1, lensMm))) * 180) / Math.PI, 30, 105));
}

function cameraYawDeg(preset: CameraPreset) {
  const dx = preset.target[0] - preset.position[0];
  const dz = preset.target[2] - preset.position[2];
  return ((Math.atan2(dz, dx) * 180) / Math.PI + 360) % 360;
}

function turnCameraInPlace(preset: CameraPreset, angleDeg: number): Partial<CameraPreset> {
  const radius = Math.max(1, Math.hypot(preset.position[0] - preset.target[0], preset.position[2] - preset.target[2]));
  const rad = (angleDeg * Math.PI) / 180;
  const target: Vec3 = [
    preset.position[0] + Math.cos(rad) * radius,
    preset.target[1],
    preset.position[2] + Math.sin(rad) * radius,
  ];
  return {
    target,
    footprint: {
      ...(preset.footprint || {}),
      point: [preset.position[0], preset.position[2]],
      angleDeg,
      fovDeg: preset.fovDeg,
    },
  };
}

function moveCameraPosition(preset: CameraPreset, position: Vec3): Partial<CameraPreset> {
  const nextPreset = { ...preset, position };
  return {
    position,
    footprint: {
      ...(preset.footprint || {}),
      point: [position[0], position[2]],
      angleDeg: cameraYawDeg(nextPreset),
      fovDeg: preset.fovDeg,
    },
  };
}

function moveCameraTarget(preset: CameraPreset, point: Point): Partial<CameraPreset> {
  const target: Vec3 = [point[0], preset.target[1], point[1]];
  const nextPreset = { ...preset, target };
  return {
    target,
    footprint: {
      ...(preset.footprint || {}),
      point: [preset.position[0], preset.position[2]],
      angleDeg: cameraYawDeg(nextPreset),
      fovDeg: preset.fovDeg,
    },
  };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="stage-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
