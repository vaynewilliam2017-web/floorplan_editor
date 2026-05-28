import { LayerPanel } from './LayerPanel';
import type { FloorplanModel, LayerKey, LayerLocks, LayerVisibility } from '../lib/types';

interface Props {
  model: FloorplanModel;
  layers: LayerVisibility;
  locks: LayerLocks;
  onToggleLayer: (layer: LayerKey) => void;
  onToggleLock: (layer: LayerKey) => void;
}

export function InspectionPanel({ model, layers, locks, onToggleLayer, onToggleLock }: Props) {
  return (
    <div className="right-panel-stack layers-only">
      <LayerPanel layers={layers} locks={locks} onToggleLayer={onToggleLayer} onToggleLock={onToggleLock} />
    </div>
  );
}
