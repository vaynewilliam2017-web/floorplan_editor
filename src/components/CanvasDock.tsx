import { Check, FlipHorizontal2, Ruler, Trash2, X } from 'lucide-react';
import { distance, normalizeVector, polygonArea } from '../lib/geometry';
import { createOperationId } from '../lib/operations';
import { ROOM_CATEGORIES } from '../lib/roomCategories';
import type { FloorplanModel, Operation, Selection, StructuralType } from '../lib/types';

interface Props {
  model: FloorplanModel;
  selection: Selection;
  onClose: () => void;
  onCommit: (operation: Operation) => void;
}

export function CanvasDock({ model, selection, onClose, onCommit }: Props) {
  const selectedWall = selection?.type === 'wall' ? model.walls.find((wall) => wall.id === selection.id) : null;
  const selectedOpening = selection?.type === 'opening' ? model.openings.find((opening) => opening.id === selection.id) : null;
  const selectedRoom = selection?.type === 'room' ? model.rooms.find((room) => room.id === selection.id) : null;
  const selectedFurniture = selection?.type === 'furniture' ? model.furniture.find((item) => item.id === selection.id) : null;
  const selectedBackground = selection?.type === 'background';
  const unitLabel = model.source.worldUnit === 'mm' ? 'mm' : 'px';
  const roomLegend = Array.from(new Set(model.rooms.map((room) => room.category)))
    .sort((a, b) => a - b)
    .map((category) => ({ category, meta: ROOM_CATEGORIES[category] || ROOM_CATEGORIES[-1] }));

  return (
    <div className="canvas-dock">
      <section className="dock-panel legend-dock-panel">
        <div className="legend-dock-grid">
          <div className="legend-block">
            <div className="legend-title">Walls</div>
            <div className="legend-action-grid wall-action-grid">
              <InsertLegendItem color="#18202c" label="Load bearing" dataType="application/x-floorplan-wall-structural" dataValue="load_bearing" />
              <InsertLegendItem color="#546173" label="Non-bearing" dataType="application/x-floorplan-wall-structural" dataValue="non_bearing" />
              <InsertLegendItem color="#334155" label="Unknown" dataType="application/x-floorplan-wall-structural" dataValue="unknown" />
            </div>
          </div>
          <div className="legend-block">
            <div className="legend-title">Openings</div>
            <div className="legend-action-grid opening-action-grid">
              <InsertLegendItem color="#f97316" label="Door" dataType="application/x-floorplan-opening-type" dataValue="door" />
              <InsertLegendItem color="#0ea5e9" label="Window" dataType="application/x-floorplan-opening-type" dataValue="window" />
            </div>
          </div>
          <div className="legend-block rooms-block">
            <div className="legend-title">Rooms</div>
            <div className="room-legend-grid">
              {roomLegend.map(({ category, meta }) => (
                <button
                  key={category}
                  className="legend-item insert-legend-item draggable-legend-item"
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-floorplan-room-category', String(category));
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <span className="legend-swatch" style={{ background: meta.color, borderColor: meta.stroke }} />
                  <span>{category} - {meta.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="dock-panel properties-dock-panel">
        <div className="dock-panel-title">
          <span>Properties</span>
          {selection && (
            <button className="layer-icon-button" type="button" onClick={onClose} title="Clear selection">
              <X size={15} />
            </button>
          )}
        </div>
        {!selection && <CanvasProperties model={model} onCommit={onCommit} />}
        {selectedBackground && <CanvasProperties model={model} onCommit={onCommit} />}
        {selectedRoom && <RoomProperties model={model} roomId={selectedRoom.id} onCommit={onCommit} />}
        {selectedWall && <WallProperties model={model} wallId={selectedWall.id} onCommit={onCommit} />}
        {selectedOpening && <OpeningProperties model={model} openingId={selectedOpening.id} unitLabel={unitLabel} onCommit={onCommit} />}
        {selectedFurniture && <FurnitureProperties model={model} furnitureId={selectedFurniture.id} unitLabel={unitLabel} onClose={onClose} onCommit={onCommit} />}
      </section>
    </div>
  );
}

function CanvasProperties({ model, onCommit }: { model: FloorplanModel; onCommit: (operation: Operation) => void }) {
  const rulerWorldLength = distance(model.source.calibrationRuler.start, model.source.calibrationRuler.end);
  const rulerSourcePx = model.source.worldUnit === 'mm' ? rulerWorldLength / model.source.mmPerSourcePx : rulerWorldLength;
  const knownLengthMm = model.source.calibrationRuler.knownLengthMm;
  const rulerMmPerPx = knownLengthMm > 0 && rulerSourcePx > 0 ? knownLengthMm / rulerSourcePx : null;
  const sourceSize = `${Math.round(model.source.imageSizePx[0])} x ${Math.round(model.source.imageSizePx[1])} px`;
  const unitText = model.source.calibrated ? `${model.source.mmPerSourcePx.toFixed(4)} mm / px` : 'source px';

  return (
    <div className="dock-properties-grid canvas-dock-properties compact-canvas-properties">
      <div className="canvas-property-summary">
        <h3>Canvas</h3>
        <p>{sourceSize} / {unitText}</p>
      </div>
      <div className="calibration-inline-card">
        <div className="calibration-title">
          <Ruler size={15} />
          Scale calibration
        </div>
        <span title="Drag the red ruler endpoints on the plan, then enter known length.">{Math.round(rulerSourcePx)} px ruler</span>
        <input
          className="field-input compact-input"
          type="number"
          min={0}
          step={10}
          aria-label="Known ruler length in millimeters"
          placeholder="known mm"
          value={Math.round(knownLengthMm)}
          onChange={(event) =>
            onCommit({
              id: createOperationId('set_calibration_known_length'),
              type: 'set_calibration_known_length',
              source: 'user',
              targetId: 'source-image',
              payload: { knownLengthMm: Number(event.target.value) },
            })
          }
        />
        <button
          className="primary-button dock-action"
          type="button"
          title="Apply scale calibration"
          disabled={!rulerMmPerPx}
          onClick={() => {
            if (!rulerMmPerPx) return;
            onCommit({
              id: createOperationId('calibrate_background_image'),
              type: 'calibrate_background_image',
              source: 'user',
              targetId: 'source-image',
              payload: {
                mmPerSourcePx: rulerMmPerPx,
                evidence: `manual ruler: ${Math.round(knownLengthMm)} mm / ${rulerSourcePx.toFixed(2)} px`,
              },
            });
          }}
        >
          <Check size={14} />
          <span>Apply</span>
        </button>
      </div>
    </div>
  );
}

function RoomProperties({ model, roomId, onCommit }: { model: FloorplanModel; roomId: string; onCommit: (operation: Operation) => void }) {
  const room = model.rooms.find((item) => item.id === roomId);
  if (!room) return null;
  const area = polygonArea(room.polygon);
  const areaLabel = model.source.worldUnit === 'mm' ? `${(area / 1_000_000).toFixed(2)} m2` : `${Math.round(area)} px2`;
  return (
    <div className="dock-properties-grid room-dock-properties">
      <div>
        <h3>{room.name}</h3>
        <p>{room.id} / {areaLabel} / {room.polygon.length - 1} vertices</p>
      </div>
      <input
        className="field-input compact-input"
        value={room.name}
        onChange={(event) =>
          onCommit({
            id: createOperationId('rename_room'),
            type: 'rename_room',
            source: 'user',
            targetId: room.id,
            payload: { name: event.target.value },
          })
        }
      />
      <select
        className="field-input compact-input"
        value={room.category}
        onChange={(event) => {
          const category = Number(event.target.value);
          onCommit({
            id: createOperationId('set_room_category'),
            type: 'set_room_category',
            source: 'user',
            targetId: room.id,
            payload: { category, type: ROOM_CATEGORIES[category].type },
          });
        }}
      >
        {Object.entries(ROOM_CATEGORIES)
          .filter(([category]) => Number(category) >= 0)
          .map(([category, value]) => (
            <option key={category} value={category}>
              {category} - {value.label}
            </option>
          ))}
      </select>
    </div>
  );
}

function WallProperties({ model, wallId, onCommit }: { model: FloorplanModel; wallId: string; onCommit: (operation: Operation) => void }) {
  const wall = model.walls.find((item) => item.id === wallId);
  if (!wall) return null;
  return (
    <div className="dock-properties-grid wall-dock-properties">
      <div>
        <h3>{wall.id}</h3>
        <p>{wall.kind} / {Math.round(wall.thicknessMm)} {model.source.worldUnit === 'mm' ? 'mm' : 'px'}</p>
      </div>
      <input
        className="field-input compact-input"
        type="number"
        min={20}
        value={Math.round(wall.thicknessMm)}
        onChange={(event) =>
          onCommit({
            id: createOperationId('set_wall_thickness'),
            type: 'set_wall_thickness',
            source: 'user',
            targetId: wall.id,
            payload: { thicknessMm: Number(event.target.value) },
          })
        }
      />
      <select
        className="field-input compact-input"
        value={wall.structural}
        onChange={(event) =>
          onCommit({
            id: createOperationId('set_wall_structural'),
            type: 'set_wall_structural',
            source: 'user',
            targetId: wall.id,
            payload: { structural: event.target.value as StructuralType },
          })
        }
      >
        <option value="unknown">Unknown</option>
        <option value="load_bearing">Load bearing</option>
        <option value="non_bearing">Non-bearing</option>
        <option value="fixed">Fixed</option>
      </select>
    </div>
  );
}

function OpeningProperties({
  model,
  openingId,
  unitLabel,
  onCommit,
}: {
  model: FloorplanModel;
  openingId: string;
  unitLabel: string;
  onCommit: (operation: Operation) => void;
}) {
  const opening = model.openings.find((item) => item.id === openingId);
  if (!opening) return null;
  const unit = normalizeVector(opening.segment[0], opening.segment[1]);
  const angleDeg = ((Math.atan2(unit[1], unit[0]) * 180) / Math.PI + 360) % 360;
  const hostWall = opening.wallId ? model.walls.find((wall) => wall.id === opening.wallId) : null;
  const wallLength = hostWall ? distance(hostWall.centerline[0], hostWall.centerline[1]) : distance(opening.segment[0], opening.segment[1]);
  const step = model.source.worldUnit === 'mm' ? 50 : 5;
  const minWidth = model.source.worldUnit === 'mm' ? 300 : 20;
  const maxWidth = Math.max(minWidth + step, roundToStep(Math.max(opening.widthMm, wallLength * 0.92, minWidth * 2), step));
  const sliderWidth = clampNumber(opening.widthMm, minWidth, maxWidth);
  const commitWidth = (value: number) => setOpeningWidth(clampNumber(value, minWidth, maxWidth), opening.id, onCommit);

  return (
    <div className="dock-properties-grid opening-dock-properties">
      <div>
        <h3>{opening.type.replace('_', ' ')}</h3>
        <p>{opening.wallId || 'unbound'} / {Math.round(angleDeg)} deg</p>
      </div>
      <label className="slider-field opening-width-slider">
        <span>
          <strong>Width</strong>
          <small>{Math.round(opening.widthMm)} {unitLabel}</small>
        </span>
        <input
          type="range"
          min={minWidth}
          max={maxWidth}
          step={step}
          value={sliderWidth}
          aria-label={`Opening width ${unitLabel}`}
          onChange={(event) => commitWidth(Number(event.target.value))}
        />
      </label>
      <input
        className="field-input compact-input"
        type="number"
        min={minWidth}
        max={maxWidth}
        step={step}
        value={Math.round(opening.widthMm)}
        aria-label={`Opening width value ${unitLabel}`}
        onChange={(event) => commitWidth(Number(event.target.value))}
      />
      <div className="opening-inline-actions">
        <input
          className="field-input compact-input"
          type="number"
          step={15}
          value={Math.round(angleDeg)}
          aria-label="Opening angle degrees"
          onChange={(event) => setOpeningAngle(Number(event.target.value), opening.id, onCommit)}
        />
        <button
          className="file-button compact-file-button"
          type="button"
          onClick={() =>
            onCommit({
              id: createOperationId('flip_opening_side'),
              type: 'flip_opening_side',
              source: 'user',
              targetId: opening.id,
              payload: {},
            })
          }
        >
          <FlipHorizontal2 size={14} />
          Flip
        </button>
      </div>
    </div>
  );
}

function FurnitureProperties({
  model,
  furnitureId,
  unitLabel,
  onClose,
  onCommit,
}: {
  model: FloorplanModel;
  furnitureId: string;
  unitLabel: string;
  onClose: () => void;
  onCommit: (operation: Operation) => void;
}) {
  const furniture = model.furniture.find((item) => item.id === furnitureId);
  if (!furniture) return null;
  return (
    <div className="dock-properties-grid furniture-dock-properties">
      <div>
        <h3>{furniture.name}</h3>
        <p>{furniture.category} / {unitLabel}</p>
      </div>
      <input
        className="field-input compact-input"
        type="number"
        value={Math.round(furniture.size[0])}
        onChange={(event) => setFurnitureSize(furniture.id, Number(event.target.value), furniture.size[1], onCommit)}
      />
      <input
        className="field-input compact-input"
        type="number"
        value={Math.round(furniture.size[1])}
        onChange={(event) => setFurnitureSize(furniture.id, furniture.size[0], Number(event.target.value), onCommit)}
      />
      <input
        className="field-input compact-input"
        type="number"
        step={90}
        value={Math.round(furniture.rotationDeg)}
        onChange={(event) =>
          onCommit({
            id: createOperationId('set_furniture_rotation'),
            type: 'set_furniture_rotation',
            source: 'user',
            targetId: furniture.id,
            payload: { rotationDeg: Number(event.target.value) },
          })
        }
      />
      <button
        className="danger-button compact-danger-button"
        type="button"
        onClick={() => {
          onCommit({
            id: createOperationId('delete_furniture'),
            type: 'delete_furniture',
            source: 'user',
            targetId: furniture.id,
            payload: {},
          });
          onClose();
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function setOpeningWidth(widthMm: number, openingId: string, onCommit: (operation: Operation) => void) {
  if (!Number.isFinite(widthMm)) return;
  onCommit({
    id: createOperationId('set_opening_width'),
    type: 'set_opening_width',
    source: 'user',
    targetId: openingId,
    payload: { widthMm },
  });
}

function setOpeningAngle(angleDeg: number, openingId: string, onCommit: (operation: Operation) => void) {
  if (!Number.isFinite(angleDeg)) return;
  onCommit({
    id: createOperationId('set_opening_angle'),
    type: 'set_opening_angle',
    source: 'user',
    targetId: openingId,
    payload: { angleDeg },
  });
}

function setFurnitureSize(furnitureId: string, width: number, height: number, onCommit: (operation: Operation) => void) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  onCommit({
    id: createOperationId('set_furniture_size'),
    type: 'set_furniture_size',
    source: 'user',
    targetId: furnitureId,
    payload: { size: [width, height] },
  });
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, step: number) {
  return Math.ceil(value / step) * step;
}

function InsertLegendItem({
  color,
  label,
  dataType,
  dataValue,
}: {
  color: string;
  label: string;
  dataType: string;
  dataValue: string;
}) {
  return (
    <button
      className="legend-item insert-legend-item draggable-legend-item"
      type="button"
      draggable
      title={`Drag ${label} onto the plan`}
      onDragStart={(event) => {
        event.dataTransfer.setData(dataType, dataValue);
        event.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <span className="legend-swatch" style={{ background: color }} />
      <span>{label}</span>
    </button>
  );
}
