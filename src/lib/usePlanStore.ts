import { useCallback, useMemo, useRef, useState } from 'react';
import { reduceOperation } from './operations';
import { validateFloorplan } from './validation';
import type { FloorplanModel, Operation, Selection, SnapGuide, Tool, Viewport } from './types';

export function usePlanStore(initial: FloorplanModel | null) {
  const [model, setModel] = useState<FloorplanModel | null>(initial);
  const [past, setPast] = useState<FloorplanModel[]>([]);
  const [future, setFuture] = useState<FloorplanModel[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [viewport, setViewport] = useState<Viewport>({ scale: 0.78, x: 42, y: 38 });
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const liveBaseRef = useRef<FloorplanModel | null>(null);

  const validation = useMemo(() => (model ? validateFloorplan(model) : null), [model]);

  const loadModel = useCallback((next: FloorplanModel) => {
    setModel(next);
    setPast([]);
    setFuture([]);
    setSelection(null);
    setGuides([]);
  }, []);

  const commitOperation = useCallback((operation: Operation) => {
    if (operation.type === 'calibrate_background_image' && model) {
      const previous = model.source.mmPerSourcePx;
      const nextScale = Math.max(0.01, operation.payload.mmPerSourcePx);
      const ratio = nextScale / previous;
      if (Number.isFinite(ratio) && ratio > 0) {
        setViewport((view) => ({ ...view, scale: Math.max(0.01, Math.min(6, view.scale / ratio)) }));
      }
    }

    setModel((current) => {
      if (!current) return current;
      const next = reduceOperation(current, operation);
      setPast((items) => [...items, current]);
      setFuture([]);
      return next;
    });
  }, [model]);

  const beginLiveEdit = useCallback(() => {
    if (model) liveBaseRef.current = model;
  }, [model]);

  const liveOperation = useCallback((operation: Operation) => {
    setModel((current) => (current ? reduceOperation(current, operation) : current));
  }, []);

  const endLiveEdit = useCallback(() => {
    const base = liveBaseRef.current;
    if (!base) return;
    setPast((items) => [...items, base]);
    setFuture([]);
    liveBaseRef.current = null;
  }, []);

  const cancelLiveEdit = useCallback(() => {
    const base = liveBaseRef.current;
    if (base) setModel(base);
    liveBaseRef.current = null;
    setGuides([]);
  }, []);

  const undo = useCallback(() => {
    setModel((current) => {
      if (!current || past.length === 0) return current;
      const previous = past[past.length - 1];
      setPast((items) => items.slice(0, -1));
      setFuture((items) => [current, ...items]);
      return previous;
    });
  }, [past]);

  const redo = useCallback(() => {
    setModel((current) => {
      if (!current || future.length === 0) return current;
      const next = future[0];
      setFuture((items) => items.slice(1));
      setPast((items) => [...items, current]);
      return next;
    });
  }, [future]);

  return {
    model,
    loadModel,
    validation,
    selection,
    setSelection,
    tool,
    setTool,
    viewport,
    setViewport,
    guides,
    setGuides,
    commitOperation,
    beginLiveEdit,
    liveOperation,
    endLiveEdit,
    cancelLiveEdit,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
