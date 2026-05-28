import { useEffect, useState } from 'react';
import { BoxSelect, Cuboid, Download, FileJson, Grid2X2, RefreshCw, RotateCcw, RotateCw, Sofa } from 'lucide-react';
import { CameraInspector } from './components/CameraInspector';
import { CanvasDock } from './components/CanvasDock';
import { CanvasRulers } from './components/CanvasRulers';
import { FloorplanStage } from './components/FloorplanStage';
import { LayerPanel } from './components/LayerPanel';
import { ModelCanvas } from './components/ModelCanvas';
import { StagePanel } from './components/StagePanel';
import { ThreePreview } from './components/ThreePreview';
import { DEFAULT_LAYER_LOCKS, DEFAULT_LAYER_VISIBILITY } from './lib/layers';
import { createFurnitureFromCatalog } from './lib/furniture/catalog';
import { normalizeImportedFloorplan, serializeFloorplan } from './lib/schema';
import { createOperationId } from './lib/operations';
import { openingSegmentOnWall, screenToWorld } from './lib/geometry';
import { ROOM_CATEGORIES } from './lib/roomCategories';
import { nearestWallForOpening } from './lib/snapping';
import { usePlanStore } from './lib/usePlanStore';
import type { FurnitureCatalogItem } from './lib/furniture/catalog';
import type { EditorStage, FloorplanModel, LayerKey, LayerVisibility, Opening, OpeningType, Point, Room, StructuralType, Wall } from './lib/types';

const SAMPLE_JSON = '/samples/1779073174278_1260_floorplan.json';
const SAMPLE_IMAGE = '/samples/1779073174278_1260.jpg';

const STAGE_ITEMS: Array<{ id: Exclude<EditorStage, 'export'>; label: string; subtitle: string; icon: React.ReactNode }> = [
  { id: 'calibrate', label: '平面校对', subtitle: 'scale + geometry', icon: <FileJson size={18} /> },
  { id: 'cad', label: '平面 CAD', subtitle: 'doors + furniture', icon: <Sofa size={18} /> },
  { id: 'model', label: '草模重建', subtitle: 'camera + PNG', icon: <Cuboid size={18} /> },
];

export function App() {
  const [bootModel, setBootModel] = useState<FloorplanModel | null>(null);
  const [loadError, setLoadError] = useState('');
  const [layerVisibility, setLayerVisibility] = useState(DEFAULT_LAYER_VISIBILITY);
  const [layerLocks, setLayerLocks] = useState(DEFAULT_LAYER_LOCKS);
  const [editorStage, setEditorStage] = useState<EditorStage>('calibrate');
  const [modelRebuildVersion, setModelRebuildVersion] = useState(0);
  const store = usePlanStore(bootModel);
  const setActiveTool = store.setTool;

  useEffect(() => {
    let cancelled = false;
    fetch(SAMPLE_JSON)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load sample JSON: ${response.status}`);
        return response.json();
      })
      .then((raw) => {
        if (cancelled) return;
        const model = normalizeImportedFloorplan(raw, SAMPLE_IMAGE);
        setBootModel(model);
        store.loadModel(model);
      })
      .catch((error: Error) => setLoadError(error.message));
    return () => {
      cancelled = true;
    };
    // store.loadModel is stable enough for initial boot; avoid re-fetching on state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const shouldIgnore = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || shouldIgnore(event.target)) return;
      event.preventDefault();
      setActiveTool('pan');
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      setActiveTool('select');
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [setActiveTool]);

  const model = store.model;

  const toggleLayer = (layer: LayerKey) => {
    setLayerVisibility((current) => ({ ...current, [layer]: !current[layer] }));
  };

  const toggleLayerLock = (layer: LayerKey) => {
    setLayerLocks((current) => ({ ...current, [layer]: !current[layer] }));
  };

  const importJson = (file: File) => {
    file
      .text()
      .then((content) => {
        const raw = JSON.parse(content);
        store.loadModel(normalizeImportedFloorplan(raw, SAMPLE_IMAGE));
      })
      .catch((error: Error) => setLoadError(error.message));
  };

  const exportJson = () => {
    if (!model) return;
    const blob = new Blob([JSON.stringify(serializeFloorplan(model), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'floorplan_edited.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportActiveCameraJson = () => {
    if (!model) return;
    const activePreset = model.cameraPresets.find((preset) => preset.id === model.activeCameraPresetId) || model.cameraPresets[0] || null;
    if (!activePreset) return;
    const blob = new Blob([JSON.stringify(activePreset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activePreset.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportModelPng = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.model-canvas-panel canvas');
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const activePreset = model?.cameraPresets.find((preset) => preset.id === model.activeCameraPresetId) || model?.cameraPresets[0] || null;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${activePreset?.id || 'model_view'}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const addFurnitureAt = (item: FurnitureCatalogItem, category: string, center: Point) => {
    if (!model) return;
    const furniture = createFurnitureFromCatalog(item, category, center, model.source.worldUnit);
    store.commitOperation({
      id: createOperationId('add_furniture'),
      type: 'add_furniture',
      source: 'user',
      targetId: 'floorplan',
      payload: { furniture },
    });
    store.setSelection({ type: 'furniture', id: furniture.id });
  };

  const addFurniture = (item: FurnitureCatalogItem, category: string) => {
    const canvas = document.querySelector('.canvas-shell')?.getBoundingClientRect();
    const center = screenToWorld([canvas ? canvas.width / 2 : window.innerWidth / 2, canvas ? canvas.height / 2 : window.innerHeight / 2], store.viewport);
    addFurnitureAt(item, category, center);
  };

  const addRoomBlock = (category: number, center: Point) => {
    if (!model) return;
    const meta = ROOM_CATEGORIES[category] || ROOM_CATEGORIES[-1];
    const width = model.source.worldUnit === 'mm' ? 3200 : 260;
    const height = model.source.worldUnit === 'mm' ? 2400 : 190;
    const polygon: Point[] = [
      [center[0] - width / 2, center[1] - height / 2],
      [center[0] + width / 2, center[1] - height / 2],
      [center[0] + width / 2, center[1] + height / 2],
      [center[0] - width / 2, center[1] + height / 2],
      [center[0] - width / 2, center[1] - height / 2],
    ];
    const room: Room = {
      id: `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      category,
      name: meta.label,
      type: meta.type,
      polygon,
      labelPoint: center,
      confidence: 1,
    };
    store.commitOperation({
      id: createOperationId('add_room'),
      type: 'add_room',
      source: 'user',
      targetId: 'floorplan',
      payload: { room },
    });
    store.setSelection({ type: 'room', id: room.id });
  };

  const addWallSegment = (structural: StructuralType, center: Point) => {
    if (!model) return;
    const length = model.source.worldUnit === 'mm' ? 2600 : 180;
    const thickness = model.source.worldUnit === 'mm' ? 200 : 14;
    const wall: Wall = {
      id: `wall_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      kind: 'partition',
      structural,
      centerline: [
        [center[0] - length / 2, center[1]],
        [center[0] + length / 2, center[1]],
      ],
      thicknessMm: thickness,
      heightMm: model.source.worldUnit === 'mm' ? 2800 : 180,
      confidence: 1,
      evidence: 'user inserted from legend',
    };
    store.commitOperation({
      id: createOperationId('add_wall'),
      type: 'add_wall',
      source: 'user',
      targetId: 'floorplan',
      payload: { wall },
    });
    store.setSelection({ type: 'wall', id: wall.id });
  };

  const addOpeningSymbol = (type: OpeningType, center: Point) => {
    if (!model) return;
    const nearest = nearestWallForOpening(center, model);
    const width = model.source.worldUnit === 'mm' ? (type.includes('window') ? 1200 : 900) : type.includes('window') ? 76 : 56;
    const segment: [Point, Point] = nearest
      ? openingSegmentOnWall(nearest.point, model.walls.find((wall) => wall.id === nearest.wallId)?.centerline || [center, [center[0] + width, center[1]]], width)
      : [
          [center[0] - width / 2, center[1]],
          [center[0] + width / 2, center[1]],
        ];
    const opening: Opening = {
      id: `opening_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      wallId: nearest?.wallId || null,
      segment,
      widthMm: width,
      heightMm: type.includes('window') ? (model.source.worldUnit === 'mm' ? 1200 : 80) : model.source.worldUnit === 'mm' ? 2100 : 140,
      sillMm: type.includes('window') ? (model.source.worldUnit === 'mm' ? 900 : 60) : null,
      side: 1,
      confidence: 1,
      evidence: nearest ? 'user inserted from legend and snapped to nearest wall' : 'user inserted from legend without available wall',
    };
    store.commitOperation({
      id: createOperationId('add_opening'),
      type: 'add_opening',
      source: 'user',
      targetId: 'floorplan',
      payload: { opening },
    });
    store.setSelection({ type: 'opening', id: opening.id });
  };

  const addOpeningAtCenter = (type: OpeningType) => {
    const canvas = document.querySelector('.canvas-shell')?.getBoundingClientRect();
    const center = screenToWorld([canvas ? canvas.width / 2 : window.innerWidth / 2, canvas ? canvas.height / 2 : window.innerHeight / 2], store.viewport);
    addOpeningSymbol(type, center);
  };

  const changeStage = (stage: EditorStage) => {
    setEditorStage(stage);
    store.setSelection(null);
    store.setTool('select');
  };

  if (loadError) {
    return (
      <main className="center-screen">
        <div className="error-card">{loadError}</div>
      </main>
    );
  }

  if (!model || !store.validation) {
    return (
      <main className="center-screen">
        <div className="loading-card">
          <RefreshCw size={18} />
          Loading floorplan...
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="window-controls" aria-hidden="true">
            <span className="close" />
            <span className="minimize" />
            <span className="zoom" />
          </div>
          <div className="app-glyph">
            <BoxSelect size={18} />
          </div>
          <div>
            <h1>Floorplan Editor</h1>
            <p>{'MVP: 平面校对 -> 平面 CAD -> 草模重建 -> 视角截图'}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" onClick={store.undo} disabled={!store.canUndo} title="Undo">
            <RotateCcw size={18} />
          </button>
          <button className="icon-button" onClick={store.redo} disabled={!store.canRedo} title="Redo">
            <RotateCw size={18} />
          </button>
          <button className="primary-button" onClick={exportJson}>
            <Download size={16} />
            Export JSON
          </button>
          <label className="file-button">
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importJson(file);
              }}
            />
          </label>
        </div>
      </header>

      <section className={`workspace ${editorStage === 'model' ? 'mvp-model-mode' : ''}`}>
        <aside className="toolrail">
          {STAGE_ITEMS.map((stage) => (
            <StageNavButton key={stage.id} stage={stage} active={editorStage === stage.id} onClick={() => changeStage(stage.id)} />
          ))}
          <button
            className={`tool-button stage-reset ${Object.values(layerVisibility).every(Boolean) ? 'active' : ''}`}
            type="button"
            title="Show all layers"
            onClick={() => setLayerVisibility(DEFAULT_LAYER_VISIBILITY)}
          >
            <Grid2X2 size={18} />
          </button>
        </aside>

        <StagePanel
          stage={editorStage}
          model={model}
          selection={store.selection}
          onCommit={store.commitOperation}
          onAddFurniture={addFurniture}
          onAddOpening={addOpeningAtCenter}
          onRebuildModel={() => setModelRebuildVersion((current) => current + 1)}
          onExportModelPng={exportModelPng}
          onExportCameraJson={exportActiveCameraJson}
        />

        <section className="canvas-column">
          {editorStage === 'model' ? (
            <ModelCanvas key={`${editorStage}-${modelRebuildVersion}`} model={model} layers={layerVisibility} showExportActions={false} />
          ) : (
            <>
              <FloorplanStage
                stage={editorStage}
                model={model}
                selection={store.selection}
                tool={store.tool}
                viewport={store.viewport}
                layers={layerVisibility}
                locks={layerLocks}
                guides={store.guides}
                onViewportChange={store.setViewport}
                onSelectionChange={store.setSelection}
                onBeginLiveEdit={store.beginLiveEdit}
                onLiveOperation={store.liveOperation}
                onEndLiveEdit={store.endLiveEdit}
                onGuidesChange={store.setGuides}
                onDropRoomBlock={addRoomBlock}
                onDropWallSegment={addWallSegment}
                onDropOpeningSymbol={addOpeningSymbol}
                onDropFurnitureSymbol={addFurnitureAt}
              />
              <CanvasRulers model={model} viewport={store.viewport} />
              <CanvasDock model={model} selection={store.selection} onClose={() => store.setSelection(null)} onCommit={store.commitOperation} />
            </>
          )}
          <div className="statusbar">
            <span>World unit: {model.source.worldUnit === 'mm' ? 'millimeters' : 'source pixels'}</span>
            <span>Viewport scale: {store.viewport.scale.toFixed(2)}x</span>
            <span>Mode: Select</span>
            <span>Hold Space: Pan</span>
            <span>{model.source.calibrated ? 'Calibrated' : 'Uncalibrated temporary scale'}</span>
          </div>
        </section>

        <section className="preview-column">
          <div className="right-panel-heading">
            <span>{editorStage === 'model' ? 'Camera and layers' : 'Preview and layers'}</span>
            <small>{editorStage}</small>
          </div>

          <div className="right-mode-content">
            {editorStage === 'model' ? (
              <div className="right-panel-stack model-right-stack">
                <CameraInspector model={model} onCommit={store.commitOperation} showActions={false} />
                <LayerPanel layers={layerVisibility} locks={layerLocks} onToggleLayer={toggleLayer} onToggleLock={toggleLayerLock} />
              </div>
            ) : (
              <div className="right-panel-stack plan-right-stack">
                <MiniThreePreviewCard model={model} layers={layerVisibility} />
                <LayerPanel layers={layerVisibility} locks={layerLocks} onToggleLayer={toggleLayer} onToggleLock={toggleLayerLock} />
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function MiniThreePreviewCard({ model, layers }: { model: FloorplanModel; layers: LayerVisibility }) {
  return (
    <section className="preview-card mini-3d-preview">
      <div className="preview-title with-icon">
        <Cuboid size={14} />
        3D Preview
      </div>
      <ThreePreview model={model} layers={layers} cameraAngle="overview" />
    </section>
  );
}

function StageNavButton({
  stage,
  active,
  onClick,
}: {
  stage: { id: EditorStage; label: string; subtitle: string; icon: React.ReactNode };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`stage-nav-button ${active ? 'active' : ''}`} type="button" onClick={onClick} title={stage.label}>
      <span className="stage-nav-icon">{stage.icon}</span>
      <span className="stage-nav-text">
        <strong>{stage.label}</strong>
        <small>{stage.subtitle}</small>
      </span>
    </button>
  );
}
