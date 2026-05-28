import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { LAYER_DEFINITIONS } from '../lib/layers';
import type { LayerKey, LayerLocks, LayerVisibility } from '../lib/types';

interface Props {
  layers: LayerVisibility;
  locks: LayerLocks;
  onToggleLayer: (layer: LayerKey) => void;
  onToggleLock: (layer: LayerKey) => void;
}

export function LayerPanel({ layers, locks, onToggleLayer, onToggleLock }: Props) {
  return (
    <section className="panel layer-panel">
      <div className="panel-title">Layers</div>
      <div className="layer-list">
        {LAYER_DEFINITIONS.map((layer) => (
          <div className={`layer-row ${layers[layer.key] ? 'on' : ''} ${locks[layer.key] ? 'locked' : ''}`} key={layer.key}>
            <button
              className="layer-icon-button"
              type="button"
              onClick={() => onToggleLayer(layer.key)}
              title={`${layers[layer.key] ? 'Hide' : 'Show'} ${layer.label}`}
            >
              {layers[layer.key] ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <span className="legend-swatch" style={{ background: layer.color }} />
            <span className="layer-label">{layer.label}</span>
            <button
              className={`layer-icon-button lock ${locks[layer.key] ? 'active' : ''}`}
              type="button"
              onClick={() => onToggleLock(layer.key)}
              title={`${locks[layer.key] ? 'Unlock' : 'Lock'} ${layer.label}`}
            >
              {locks[layer.key] ? <Lock size={15} /> : <Unlock size={15} />}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
