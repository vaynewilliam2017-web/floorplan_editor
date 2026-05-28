import { X } from 'lucide-react';
import { ROOM_CATEGORIES } from '../lib/roomCategories';
import type { FloorplanModel, Selection } from '../lib/types';

interface Props {
  model: FloorplanModel;
  selection: Selection;
}

export function CanvasDock({ model, selection }: Props) {
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
    </div>
  );
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
