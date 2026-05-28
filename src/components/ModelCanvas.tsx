import { Camera, FileJson, ImageDown, Save } from 'lucide-react';
import { useState } from 'react';
import { ThreePreview } from './ThreePreview';
import { createOperationId } from '../lib/operations';
import type { FloorplanModel, LayerVisibility, Operation, Vec3 } from '../lib/types';

interface Props {
  model: FloorplanModel;
  layers?: LayerVisibility;
  showExportActions?: boolean;
  onCommit?: (operation: Operation) => void;
}

export function ModelCanvas({ model, layers, showExportActions = false, onCommit }: Props) {
  const activePreset = model.cameraPresets.find((preset) => preset.id === model.activeCameraPresetId) || model.cameraPresets[0] || null;
  const [liveCamera, setLiveCamera] = useState<{ position: Vec3; target: Vec3 } | null>(null);
  const exportPresetJson = () => {
    if (!activePreset) return;
    const blob = new Blob([JSON.stringify(activePreset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activePreset.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPreviewPng = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.model-canvas-panel canvas');
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${activePreset?.id || 'model_view'}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <section className="model-canvas-panel">
      <div className="model-canvas-title">
        <Camera size={17} />
        <span>3D Preview</span>
        {activePreset && <strong>{activePreset.name}</strong>}
        {showExportActions && (
          <div className="model-title-actions" aria-label="3D view export actions">
            <button
              className="model-icon-button"
              type="button"
              disabled={!liveCamera}
              onClick={() => {
                if (!liveCamera || !onCommit) return;
                const id = `preset_user_${Date.now().toString(36)}`;
                onCommit({
                  id: createOperationId('upsert_camera_preset'),
                  type: 'upsert_camera_preset',
                  source: 'user',
                  targetId: 'floorplan',
                  payload: {
                    preset: {
                      id,
                      name: 'Custom view',
                      source: 'user',
                      position: liveCamera.position,
                      target: liveCamera.target,
                      fovDeg: activePreset?.fovDeg ?? 60,
                      heightMm: activePreset?.heightMm ?? 1500,
                      lensMm: activePreset?.lensMm ?? 35,
                      roomIds: activePreset?.roomIds ?? [],
                    },
                  },
                });
              }}
              title="Save current view as preset"
            >
              <Save size={15} />
            </button>
            <button className="model-icon-button" type="button" disabled={!activePreset} onClick={exportPresetJson} title="Export active camera preset JSON">
              <FileJson size={15} />
            </button>
            <button className="model-icon-button primary" type="button" onClick={exportPreviewPng} title="Export current 3D view PNG">
              <ImageDown size={15} />
            </button>
          </div>
        )}
      </div>
      <div className="model-canvas-area">
        <ThreePreview
          model={model}
          layers={layers}
          cameraPreset={activePreset}
          cameraAngle="overview"
          interactive
          onCameraChange={(position, target) => setLiveCamera({ position, target })}
        />
      </div>
    </section>
  );
}
