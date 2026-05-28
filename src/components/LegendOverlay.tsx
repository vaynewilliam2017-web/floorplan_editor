import { ROOM_CATEGORIES } from '../lib/roomCategories';
import type { FloorplanModel } from '../lib/types';

interface Props {
  model: FloorplanModel;
}

export function LegendOverlay({ model }: Props) {
  const roomLegend = Array.from(new Set(model.rooms.map((room) => room.category)))
    .sort((a, b) => a - b)
    .map((category) => ({ category, meta: ROOM_CATEGORIES[category] || ROOM_CATEGORIES[-1] }));

  return (
    <aside className="canvas-legend">
      <div className="legend-block">
        <div className="legend-title">Walls</div>
        <LegendItem color="#18202c" label="Load bearing" />
        <LegendItem color="#546173" label="Non-bearing" />
        <LegendItem color="#334155" label="Unknown" />
      </div>
      <div className="legend-block">
        <div className="legend-title">Openings</div>
        <LegendItem color="#f97316" label="Door" />
        <LegendItem color="#0ea5e9" label="Window" />
      </div>
      <div className="legend-block">
        <div className="legend-title">Rooms</div>
        <div className="room-legend-grid">
          {roomLegend.map(({ category, meta }) => (
            <LegendItem key={category} color={meta.color} label={`${category} - ${meta.label}`} />
          ))}
        </div>
      </div>
    </aside>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="legend-item">
      <span className="legend-swatch" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}
