import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Minus, Plus, Ruler, Trash2, X } from 'lucide-react';
import { distance, polygonArea } from '../lib/geometry';
import { createOperationId } from '../lib/operations';
import { ROOM_CATEGORIES } from '../lib/roomCategories';
import type { FloorplanModel, Operation, Selection, StructuralType } from '../lib/types';

interface Props {
  model: FloorplanModel;
  selection: Selection;
  onClose: () => void;
  onCommit: (operation: Operation) => void;
}

export function PropertiesDrawer({ model, selection, onClose, onCommit }: Props) {
  if (!selection) return null;

  const selectedWall = selection.type === 'wall' ? model.walls.find((wall) => wall.id === selection.id) : null;
  const selectedOpening = selection.type === 'opening' ? model.openings.find((opening) => opening.id === selection.id) : null;
  const selectedRoom = selection.type === 'room' ? model.rooms.find((room) => room.id === selection.id) : null;
  const selectedFurniture = selection.type === 'furniture' ? model.furniture.find((item) => item.id === selection.id) : null;
  const selectedBackground = selection.type === 'background';
  const unitLabel = model.source.worldUnit === 'mm' ? 'mm' : 'px';
  const nudgeStep = model.source.worldUnit === 'mm' ? 50 : 10;
  const openingStep = model.source.worldUnit === 'mm' ? 100 : 10;
  const roomArea = selectedRoom ? polygonArea(selectedRoom.polygon) : 0;
  const roomAreaLabel = model.source.worldUnit === 'mm' ? `${(roomArea / 1_000_000).toFixed(2)} m2` : `${Math.round(roomArea)} px2`;
  const rulerWorldLength = distance(model.source.calibrationRuler.start, model.source.calibrationRuler.end);
  const rulerSourcePx = model.source.worldUnit === 'mm' ? rulerWorldLength / model.source.mmPerSourcePx : rulerWorldLength;
  const knownLengthMm = model.source.calibrationRuler.knownLengthMm;
  const rulerMmPerPx = knownLengthMm > 0 && rulerSourcePx > 0 ? knownLengthMm / rulerSourcePx : null;

  const setBackgroundOffset = (offsetMm: [number, number]) => {
    onCommit({
      id: createOperationId('set_background_offset'),
      type: 'set_background_offset',
      source: 'user',
      targetId: 'source-image',
      payload: { offsetMm },
    });
  };

  const nudgeBackground = (dx: number, dy: number) => {
    setBackgroundOffset([model.source.offsetMm[0] + dx, model.source.offsetMm[1] + dy]);
  };

  const setOpeningWidth = (widthMm: number) => {
    if (!selectedOpening || !Number.isFinite(widthMm)) return;
    onCommit({
      id: createOperationId('set_opening_width'),
      type: 'set_opening_width',
      source: 'user',
      targetId: selectedOpening.id,
      payload: { widthMm },
    });
  };

  const applyRulerCalibration = () => {
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
  };

  const setFurnitureSize = (width: number, height: number) => {
    if (!selectedFurniture || !Number.isFinite(width) || !Number.isFinite(height)) return;
    onCommit({
      id: createOperationId('set_furniture_size'),
      type: 'set_furniture_size',
      source: 'user',
      targetId: selectedFurniture.id,
      payload: { size: [width, height] },
    });
  };

  return (
    <aside className="properties-drawer">
      <div className="drawer-header">
        <div>
          <div className="drawer-kicker">Properties</div>
          <h2>
            {selectedWall?.id ||
              selectedOpening?.id ||
              selectedRoom?.id ||
              selectedFurniture?.name ||
              (selectedBackground ? 'Source Image' : 'Selection')}
          </h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} title="Close properties">
          <X size={16} />
        </button>
      </div>

      {selectedWall && (
        <div className="stack">
          <label className="field-label">Thickness {unitLabel}</label>
          <input
            className="field-input"
            type="number"
            min={20}
            value={Math.round(selectedWall.thicknessMm)}
            onChange={(event) =>
              onCommit({
                id: createOperationId('set_wall_thickness'),
                type: 'set_wall_thickness',
                source: 'user',
                targetId: selectedWall.id,
                payload: { thicknessMm: Number(event.target.value) },
              })
            }
          />
          <label className="field-label">Structural</label>
          <select
            className="field-input"
            value={selectedWall.structural}
            onChange={(event) =>
              onCommit({
                id: createOperationId('set_wall_structural'),
                type: 'set_wall_structural',
                source: 'user',
                targetId: selectedWall.id,
                payload: { structural: event.target.value as StructuralType },
              })
            }
          >
            <option value="unknown">Unknown</option>
            <option value="load_bearing">Load bearing</option>
            <option value="non_bearing">Non-bearing</option>
            <option value="fixed">Fixed</option>
          </select>
          <button
            className="danger-button"
            type="button"
            onClick={() => {
              onCommit({
                id: createOperationId('delete_wall'),
                type: 'delete_wall',
                source: 'user',
                targetId: selectedWall.id,
                payload: {},
              });
              onClose();
            }}
          >
            <Trash2 size={15} />
            Delete wall
          </button>
        </div>
      )}

      {selectedOpening && (
        <div className="stack">
          <div className="readout">Attached wall: {selectedOpening.wallId || 'None'}</div>
          <label className="field-label">Width {unitLabel}</label>
          <div className="number-stepper">
            <button
              className="icon-button compact"
              type="button"
              title="Decrease width"
              onClick={() => setOpeningWidth(selectedOpening.widthMm - openingStep)}
            >
              <Minus size={14} />
            </button>
            <input
              className="field-input"
              type="number"
              min={20}
              step={openingStep}
              value={Math.round(selectedOpening.widthMm)}
              onChange={(event) => setOpeningWidth(Number(event.target.value))}
            />
            <button
              className="icon-button compact"
              type="button"
              title="Increase width"
              onClick={() => setOpeningWidth(selectedOpening.widthMm + openingStep)}
            >
              <Plus size={14} />
            </button>
          </div>
          <button
            className="danger-button"
            type="button"
            onClick={() => {
              onCommit({
                id: createOperationId('delete_opening'),
                type: 'delete_opening',
                source: 'user',
                targetId: selectedOpening.id,
                payload: {},
              });
              onClose();
            }}
          >
            <Trash2 size={15} />
            Delete opening
          </button>
        </div>
      )}

      {selectedRoom && (
        <div className="stack">
          <div className="metric compact-metric">
            <strong>{roomAreaLabel}</strong>
            <span>{model.source.worldUnit === 'mm' ? 'Converted area' : 'Source-pixel area'}</span>
          </div>
          <label className="field-label">Room name</label>
          <input
            className="field-input"
            value={selectedRoom.name}
            onChange={(event) =>
              onCommit({
                id: createOperationId('rename_room'),
                type: 'rename_room',
                source: 'user',
                targetId: selectedRoom.id,
                payload: { name: event.target.value },
              })
            }
          />
          <label className="field-label">Category</label>
          <select
            className="field-input"
            value={selectedRoom.category}
            onChange={(event) => {
              const category = Number(event.target.value);
              onCommit({
                id: createOperationId('set_room_category'),
                type: 'set_room_category',
                source: 'user',
                targetId: selectedRoom.id,
                payload: { category, type: ROOM_CATEGORIES[category].type },
              });
            }}
          >
            {Object.entries(ROOM_CATEGORIES).map(([category, value]) => (
              <option key={category} value={category}>
                {category} - {value.label}
              </option>
            ))}
          </select>
          <button
            className="danger-button"
            type="button"
            onClick={() => {
              onCommit({
                id: createOperationId('delete_room'),
                type: 'delete_room',
                source: 'user',
                targetId: selectedRoom.id,
                payload: {},
              });
              onClose();
            }}
          >
            <Trash2 size={15} />
            Delete room
          </button>
        </div>
      )}

      {selectedFurniture && (
        <div className="stack">
          <div className="readout">
            {selectedFurniture.category} / {selectedFurniture.assetId}
          </div>
          <div className="field-row two">
            <label>
              <span className="field-label">Width {unitLabel}</span>
              <input
                className="field-input"
                type="number"
                min={20}
                step={model.source.worldUnit === 'mm' ? 50 : 5}
                value={Math.round(selectedFurniture.size[0])}
                onChange={(event) => setFurnitureSize(Number(event.target.value), selectedFurniture.size[1])}
              />
            </label>
            <label>
              <span className="field-label">Height {unitLabel}</span>
              <input
                className="field-input"
                type="number"
                min={20}
                step={model.source.worldUnit === 'mm' ? 50 : 5}
                value={Math.round(selectedFurniture.size[1])}
                onChange={(event) => setFurnitureSize(selectedFurniture.size[0], Number(event.target.value))}
              />
            </label>
          </div>
          <label className="field-label">Rotation degrees</label>
          <input
            className="field-input"
            type="number"
            step={15}
            value={Math.round(selectedFurniture.rotationDeg)}
            onChange={(event) =>
              onCommit({
                id: createOperationId('set_furniture_rotation'),
                type: 'set_furniture_rotation',
                source: 'user',
                targetId: selectedFurniture.id,
                payload: { rotationDeg: Number(event.target.value) },
              })
            }
          />
          <button
            className="danger-button"
            type="button"
            onClick={() => {
              onCommit({
                id: createOperationId('delete_furniture'),
                type: 'delete_furniture',
                source: 'user',
                targetId: selectedFurniture.id,
                payload: {},
              });
              onClose();
            }}
          >
            <Trash2 size={15} />
            Delete furniture
          </button>
        </div>
      )}

      {selectedBackground && (
        <div className="stack">
          <div className="calibration-card">
            <div className="calibration-title">
              <Ruler size={15} />
              Scale calibration
            </div>
            <div className="readout">{rulerSourcePx.toFixed(2)} source px</div>
            <label className="field-label">Known length mm</label>
            <input
              className="field-input"
              type="number"
              min={0}
              step={10}
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
            <button className="primary-button full-width" type="button" disabled={!rulerMmPerPx} onClick={applyRulerCalibration}>
              <Check size={15} />
              Apply mm scale
            </button>
            <div className="readout">Computed: {rulerMmPerPx ? `${rulerMmPerPx.toFixed(4)} mm / px` : 'Set a length first'}</div>
          </div>

          <label className="field-label">Direct mm per source px</label>
          <input
            className="field-input"
            type="number"
            min={0.01}
            step={0.1}
            value={model.source.mmPerSourcePx}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value) || value <= 0) return;
              onCommit({
                id: createOperationId('calibrate_background_image'),
                type: 'calibrate_background_image',
                source: 'user',
                targetId: 'source-image',
                payload: { mmPerSourcePx: value, evidence: 'manual editor calibration' },
              });
            }}
          />
          <div className="field-row two">
            <label>
              <span className="field-label">Offset X {unitLabel}</span>
              <input
                className="field-input"
                type="number"
                step={nudgeStep}
                value={Math.round(model.source.offsetMm[0])}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) setBackgroundOffset([value, model.source.offsetMm[1]]);
                }}
              />
            </label>
            <label>
              <span className="field-label">Offset Y {unitLabel}</span>
              <input
                className="field-input"
                type="number"
                step={nudgeStep}
                value={Math.round(model.source.offsetMm[1])}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) setBackgroundOffset([model.source.offsetMm[0], value]);
                }}
              />
            </label>
          </div>
          <div className="field-row two">
            <label>
              <span className="field-label">Image scale %</span>
              <input
                className="field-input"
                type="number"
                min={5}
                max={1000}
                step={1}
                value={Math.round(model.source.imageScale * 100)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  onCommit({
                    id: createOperationId('set_background_scale'),
                    type: 'set_background_scale',
                    source: 'user',
                    targetId: 'source-image',
                    payload: { imageScale: value / 100 },
                  });
                }}
              />
            </label>
            <label>
              <span className="field-label">Opacity %</span>
              <input
                className="field-input"
                type="number"
                min={8}
                max={100}
                step={1}
                value={Math.round(model.source.opacity * 100)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  onCommit({
                    id: createOperationId('set_background_opacity'),
                    type: 'set_background_opacity',
                    source: 'user',
                    targetId: 'source-image',
                    payload: { opacity: value / 100 },
                  });
                }}
              />
            </label>
          </div>
          <div className="nudge-pad">
            <button className="icon-button" type="button" title="Nudge left" onClick={() => nudgeBackground(-nudgeStep, 0)}>
              <ArrowLeft size={16} />
            </button>
            <button className="icon-button" type="button" title="Nudge up" onClick={() => nudgeBackground(0, -nudgeStep)}>
              <ArrowUp size={16} />
            </button>
            <button className="icon-button" type="button" title="Nudge down" onClick={() => nudgeBackground(0, nudgeStep)}>
              <ArrowDown size={16} />
            </button>
            <button className="icon-button" type="button" title="Nudge right" onClick={() => nudgeBackground(nudgeStep, 0)}>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
