import { Camera, Download, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CAMERA_ANGLE_OPTIONS, ThreePreview } from './ThreePreview';
import type { CameraAngleId } from './ThreePreview';
import { createAgentCameraPresets } from '../lib/cameraPresets';
import { createOperationId } from '../lib/operations';
import type { CameraPreset, FloorplanModel, Operation } from '../lib/types';

interface Props {
  model: FloorplanModel;
  onCommit: (operation: Operation) => void;
}

export function ThreeWorkspace({ model, onCommit }: Props) {
  const [angleId, setAngleId] = useState<CameraAngleId>('overview');
  const presets = model.cameraPresets;
  const activePreset = useMemo(
    () => presets.find((preset) => preset.id === model.activeCameraPresetId) || presets[0] || null,
    [model.activeCameraPresetId, presets],
  );
  const selected = useMemo(
    () => CAMERA_ANGLE_OPTIONS.find((item) => item.id === angleId) || CAMERA_ANGLE_OPTIONS[0],
    [angleId],
  );

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
    if (nextPresets[0]) {
      onCommit({
        id: createOperationId('set_active_camera_preset'),
        type: 'set_active_camera_preset',
        source: 'user',
        targetId: 'floorplan',
        payload: { cameraPresetId: nextPresets[0].id },
      });
    }
  };

  const setActivePreset = (preset: CameraPreset) => {
    onCommit({
      id: createOperationId('set_active_camera_preset'),
      type: 'set_active_camera_preset',
      source: 'user',
      targetId: 'floorplan',
      payload: { cameraPresetId: preset.id },
    });
  };

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
    const canvas = document.querySelector<HTMLCanvasElement>('.three-workspace canvas');
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${activePreset?.id || angleId}_preview.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <section className="three-workspace">
      <div className="three-main-card">
        <div className="preview-title with-icon">
          <Camera size={15} />
          3D Preview
        </div>
        <ThreePreview model={model} cameraAngle={angleId} cameraPreset={activePreset} />
      </div>

      <div className="camera-angle-card">
        <div className="camera-selected">
          <div>
            <span>Selected angle</span>
            <strong>{activePreset?.name || selected.name}</strong>
          </div>
          <div className="camera-stats">
            <span>{activePreset ? `${activePreset.lensMm} mm` : selected.lens}</span>
            <span>{activePreset ? `${Math.round(activePreset.heightMm)} high` : selected.height}</span>
          </div>
        </div>
        <p>{activePreset ? 'Camera preset is stored in FloorplanJSON and can be exported with the current PNG.' : selected.description}</p>
        <div className="camera-actions">
          <button className="primary-button" type="button" onClick={generateAgentPresets}>
            <Sparkles size={15} />
            Generate agent presets
          </button>
          <button className="file-button compact-file-button" type="button" disabled={!activePreset} onClick={exportPresetJson}>
            <Download size={15} />
            Preset JSON
          </button>
          <button className="file-button compact-file-button" type="button" onClick={exportPreviewPng}>
            <Download size={15} />
            PNG
          </button>
        </div>
        {presets.length > 0 && (
          <div className="camera-list preset-list">
            {presets.map((preset) => (
              <button
                key={preset.id}
                className={`camera-option ${preset.id === activePreset?.id ? 'active' : ''}`}
                type="button"
                onClick={() => setActivePreset(preset)}
              >
                <span>{preset.name}</span>
                <small>
                  {preset.source} / {preset.roomIds.length || 0} rooms
                </small>
              </button>
            ))}
          </div>
        )}
        <div className="camera-list">
          {CAMERA_ANGLE_OPTIONS.map((angle) => (
            <button
              key={angle.id}
              className={`camera-option ${angle.id === angleId ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setAngleId(angle.id);
                onCommit({
                  id: createOperationId('set_active_camera_preset'),
                  type: 'set_active_camera_preset',
                  source: 'user',
                  targetId: 'floorplan',
                  payload: { cameraPresetId: null },
                });
              }}
            >
              <span>{angle.name}</span>
              <small>
                {angle.lens} / {angle.height}
              </small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
