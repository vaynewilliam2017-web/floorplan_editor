import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line, Circle, Image as KonvaImage, Group, Text, Rect } from 'react-konva';
import type Konva from 'konva';
import { furnitureAssetUrl } from '../lib/furniture/catalog';
import type { FurnitureCatalogItem } from '../lib/furniture/catalog';
import { createOperationId } from '../lib/operations';
import { distance, flatten, midpoint, normalizeVector, perpendicular, polygonArea, screenToWorld, segmentLength, wallPolygon } from '../lib/geometry';
import { ROOM_CATEGORIES } from '../lib/roomCategories';
import { nearestWallForOpening, snapWallEndpoint } from '../lib/snapping';
import type {
  EditorStage,
  FloorplanModel,
  Furniture,
  LayerLocks,
  LayerVisibility,
  Opening,
  OpeningType,
  Operation,
  Point,
  Selection,
  SnapGuide,
  StructuralType,
  Tool,
  Viewport,
} from '../lib/types';

interface Props {
  stage: EditorStage;
  model: FloorplanModel;
  selection: Selection;
  tool: Tool;
  viewport: Viewport;
  layers: LayerVisibility;
  locks: LayerLocks;
  guides: SnapGuide[];
  onViewportChange: (viewport: Viewport) => void;
  onSelectionChange: (selection: Selection) => void;
  onBeginLiveEdit: () => void;
  onLiveOperation: (operation: Operation) => void;
  onEndLiveEdit: () => void;
  onGuidesChange: (guides: SnapGuide[]) => void;
  onDropRoomBlock: (category: number, center: Point) => void;
  onDropWallSegment: (structural: StructuralType, center: Point) => void;
  onDropOpeningSymbol: (type: OpeningType, center: Point) => void;
  onDropFurnitureSymbol: (item: FurnitureCatalogItem, category: string, center: Point) => void;
}

export function FloorplanStage({
  stage,
  model,
  selection,
  tool,
  viewport,
  layers,
  locks,
  guides,
  onViewportChange,
  onSelectionChange,
  onBeginLiveEdit,
  onLiveOperation,
  onEndLiveEdit,
  onGuidesChange,
  onDropRoomBlock,
  onDropWallSegment,
  onDropOpeningSymbol,
  onDropFurnitureSymbol,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const edgeDragRef = useRef<Record<string, Point>>({});
  const autoFitKeyRef = useRef('');
  const [size, setSize] = useState({ width: 900, height: 640 });
  const image = useImage(model.source.imagePath);
  const selectedWall = selection?.type === 'wall' ? model.walls.find((wall) => wall.id === selection.id) : null;
  const selectedRoom = selection?.type === 'room' ? model.rooms.find((room) => room.id === selection.id) : null;
  const selectedFurniture = selection?.type === 'furniture' ? model.furniture.find((item) => item.id === selection.id) : null;
  const canEditBackground = stage === 'calibrate' && tool === 'select' && !locks.backgroundLayer;
  const canEditRooms = stage === 'calibrate' && tool === 'select' && !locks.roomLayer;
  const canEditWalls = stage === 'calibrate' && tool === 'select' && !locks.wallLayer;
  const canEditOpenings = (stage === 'calibrate' || stage === 'cad') && tool === 'select' && !locks.openingLayer;
  const canEditFurniture = stage === 'cad' && tool === 'select' && !locks.furnitureLayer;
  const canUseControlLayer = tool === 'select' && !locks.controlLayer;
  const canEditControls = stage === 'calibrate' && canUseControlLayer && !locks.wallLayer;
  const canEditRuler = canUseControlLayer && !locks.backgroundLayer;
  const screenWorld = (pixels: number) => pixels / Math.max(viewport.scale, 0.001);
  const ui = {
    hairline: screenWorld(1),
    stroke: screenWorld(2),
    strongStroke: screenWorld(3),
    dash: [screenWorld(10), screenWorld(5)],
    handleSmall: screenWorld(8),
    handle: screenWorld(10),
    handleLarge: screenWorld(12),
    roomLabelFont: screenWorld(stage === 'cad' ? 15 : 14),
    roomAreaFont: screenWorld(10.5),
    roomLabelWidth: screenWorld(150),
  };

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const resize = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const imageWorldSize = useMemo(
    () => ({
      width: model.source.imageSizePx[0] * model.source.mmPerSourcePx,
      height: model.source.imageSizePx[1] * model.source.mmPerSourcePx,
    }),
    [model.source.imageSizePx, model.source.mmPerSourcePx],
  );
  const sourceImageFrame = {
    x: model.source.offsetMm[0],
    y: model.source.offsetMm[1],
    width: imageWorldSize.width * model.source.imageScale,
    height: imageWorldSize.height * model.source.imageScale,
  };

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0 || sourceImageFrame.width <= 0 || sourceImageFrame.height <= 0) return;
    const fitKey = [
      stage,
      model.source.imagePath,
      sourceImageFrame.x.toFixed(2),
      sourceImageFrame.y.toFixed(2),
      sourceImageFrame.width.toFixed(2),
      sourceImageFrame.height.toFixed(2),
      size.width,
      size.height,
    ].join('|');
    if (autoFitKeyRef.current === fitKey) return;
    autoFitKeyRef.current = fitKey;

    const leftInset = 64;
    const topInset = 44;
    const rightInset = 42;
    const bottomInset = 260;
    const availableWidth = Math.max(320, size.width - leftInset - rightInset);
    const availableHeight = Math.max(260, size.height - topInset - bottomInset);
    const scale = Math.max(
      0.04,
      Math.min(2.4, Math.min(availableWidth / sourceImageFrame.width, availableHeight / sourceImageFrame.height)),
    );
    onViewportChange({
      scale,
      x: leftInset + (availableWidth - sourceImageFrame.width * scale) / 2 - sourceImageFrame.x * scale,
      y: topInset + (availableHeight - sourceImageFrame.height * scale) / 2 - sourceImageFrame.y * scale,
    });
  }, [
    model.source.imagePath,
    onViewportChange,
    size.height,
    size.width,
    sourceImageFrame.height,
    sourceImageFrame.width,
    sourceImageFrame.x,
    sourceImageFrame.y,
    stage,
  ]);

  const selectBackground = () => {
    if (canEditBackground) onSelectionChange({ type: 'background', id: 'source-image' });
  };

  const pointerWorld = (): Point | null => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return null;
    return screenToWorld([pointer.x, pointer.y], viewport);
  };

  const moveWholeWall = (wallId: string, offset: Point) => {
    if (Math.abs(offset[0]) < 0.01 && Math.abs(offset[1]) < 0.01) return;
    onLiveOperation({
      id: createOperationId('move_wall'),
      type: 'move_wall',
      source: 'user',
      targetId: wallId,
      payload: { offset },
    });
  };

  const moveWholeRoom = (roomId: string, offset: Point) => {
    if (Math.abs(offset[0]) < 0.01 && Math.abs(offset[1]) < 0.01) return;
    onLiveOperation({
      id: createOperationId('move_room'),
      type: 'move_room',
      source: 'user',
      targetId: roomId,
      payload: { offset },
    });
  };

  const moveRoomVertex = (roomId: string, index: number, point: Point) => {
    onLiveOperation({
      id: createOperationId('move_room_vertex'),
      type: 'move_room_vertex',
      source: 'user',
      targetId: roomId,
      payload: { index, point },
    });
  };

  const moveRoomEdge = (roomId: string, edgeIndex: number, offset: Point) => {
    if (Math.abs(offset[0]) < 0.01 && Math.abs(offset[1]) < 0.01) return;
    onLiveOperation({
      id: createOperationId('move_room_edge'),
      type: 'move_room_edge',
      source: 'user',
      targetId: roomId,
      payload: { edgeIndex, offset },
    });
  };

  const moveFurniture = (furnitureId: string, position: Point) => {
    onLiveOperation({
      id: createOperationId('move_furniture'),
      type: 'move_furniture',
      source: 'user',
      targetId: furnitureId,
      payload: { position },
    });
  };

  const setCalibrationRulerPoint = (endpoint: 0 | 1, point: Point) => {
    const ruler = model.source.calibrationRuler;
    onLiveOperation({
      id: createOperationId('set_calibration_ruler'),
      type: 'set_calibration_ruler',
      source: 'user',
      targetId: 'source-image',
      payload: endpoint === 0 ? { start: point, end: ruler.end } : { start: ruler.start, end: point },
    });
  };

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    if (!event.evt.ctrlKey && !event.evt.metaKey) return;
    event.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const scaleBy = 1.08;
    const oldScale = viewport.scale;
    const nextScale = event.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    const clamped = Math.max(0.01, Math.min(6, nextScale));
    const world = screenToWorld([pointer.x, pointer.y], viewport);
    onViewportChange({
      scale: clamped,
      x: pointer.x - world[0] * clamped,
      y: pointer.y - world[1] * clamped,
    });
  };

  const moveWallEndpoint = (wallId: string, endpoint: 0 | 1, point: Point, source: 'user' = 'user') => {
    onLiveOperation({
      id: createOperationId('move_wall_endpoint'),
      type: 'move_wall_endpoint',
      source,
      targetId: wallId,
      payload: { endpoint, point },
    });
  };

  const moveOpening = (openingId: string, center: Point) => {
    const nearest = nearestWallForOpening(center, model);
    if (!nearest) return;
    onGuidesChange([
      {
        id: 'opening-wall',
        orientation: 'point',
        points: [nearest.point],
        label: 'nearest wall',
      },
    ]);
    onLiveOperation({
      id: createOperationId('move_opening_on_wall'),
      type: 'move_opening_on_wall',
      source: 'user',
      targetId: openingId,
      payload: { wallId: nearest.wallId, center: nearest.point },
    });
  };

  return (
    <div
      className={`canvas-shell ${tool === 'pan' ? 'is-panning' : ''}`}
      ref={containerRef}
      onDragOver={(event) => {
        if (
          event.dataTransfer.types.includes('application/x-floorplan-room-category') ||
          event.dataTransfer.types.includes('application/x-floorplan-wall-structural') ||
          event.dataTransfer.types.includes('application/x-floorplan-opening-type') ||
          event.dataTransfer.types.includes('application/x-floorplan-furniture')
        ) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(event) => {
        const rawRoom = event.dataTransfer.getData('application/x-floorplan-room-category');
        const rawWall = event.dataTransfer.getData('application/x-floorplan-wall-structural');
        const rawOpening = event.dataTransfer.getData('application/x-floorplan-opening-type');
        const rawFurniture = event.dataTransfer.getData('application/x-floorplan-furniture');
        if (!rawRoom && !rawWall && !rawOpening && !rawFurniture) return;
        event.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const center = screenToWorld([event.clientX - rect.left, event.clientY - rect.top], viewport);
        if (rawRoom) {
          const category = Number(rawRoom);
          if (Number.isFinite(category)) onDropRoomBlock(category, center);
          return;
        }
        if (rawWall) {
          onDropWallSegment(rawWall as StructuralType, center);
          return;
        }
        if (rawOpening) onDropOpeningSymbol(rawOpening as OpeningType, center);
        if (rawFurniture) {
          try {
            const parsed = JSON.parse(rawFurniture) as { category?: string; item?: FurnitureCatalogItem };
            if (parsed.category && parsed.item) onDropFurnitureSymbol(parsed.item, parsed.category, center);
          } catch {
            // Ignore malformed drag payloads from outside this app.
          }
        }
      }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        draggable={tool === 'pan'}
        onDragEnd={(event) => {
          if (tool === 'pan') onViewportChange({ ...viewport, x: event.target.x(), y: event.target.y() });
        }}
        onWheel={handleWheel}
        onMouseDown={() => {
          // Keep the current properties panel stable; use the dock close button to clear selection.
        }}
      >
        <Layer name="backgroundLayer" listening={canEditBackground} visible={layers.backgroundLayer}>
          <Rect
            x={sourceImageFrame.x}
            y={sourceImageFrame.y}
            width={sourceImageFrame.width}
            height={sourceImageFrame.height}
            fill="#ffffff"
            stroke="#d9dee8"
            strokeWidth={1 / Math.max(viewport.scale, 0.001)}
            shadowColor="#1f2937"
            shadowBlur={12 / Math.max(viewport.scale, 0.001)}
            shadowOpacity={0.1}
            shadowOffsetY={2 / Math.max(viewport.scale, 0.001)}
            onClick={selectBackground}
            onTap={selectBackground}
          />
          {image ? (
            <KonvaImage
              image={image}
              x={sourceImageFrame.x}
              y={sourceImageFrame.y}
              width={sourceImageFrame.width}
              height={sourceImageFrame.height}
              opacity={model.source.opacity}
              onClick={selectBackground}
              onTap={selectBackground}
            />
          ) : (
            <Rect
              x={sourceImageFrame.x}
              y={sourceImageFrame.y}
              width={sourceImageFrame.width}
              height={sourceImageFrame.height}
              fill="#ffffff"
              opacity={0.84}
              onClick={selectBackground}
              onTap={selectBackground}
            />
          )}
        </Layer>

        <Layer name="roomLayer" visible={layers.roomLayer} listening={canEditRooms}>
          {model.rooms.map((room) => {
            const category = ROOM_CATEGORIES[room.category] || ROOM_CATEGORIES[-1];
            const isSelected = selection?.type === 'room' && selection.id === room.id;
            return (
              <Group
                key={room.id}
                draggable={canEditRooms}
                x={0}
                y={0}
                onClick={() => {
                  if (canEditRooms) onSelectionChange({ type: 'room', id: room.id });
                }}
                onTap={() => {
                  if (canEditRooms) onSelectionChange({ type: 'room', id: room.id });
                }}
                onDragStart={() => {
                  if (!canEditRooms) return;
                  onSelectionChange({ type: 'room', id: room.id });
                  onBeginLiveEdit();
                }}
                onDragEnd={(event) => {
                  if (!canEditRooms) return;
                  const offset: Point = [event.target.x(), event.target.y()];
                  event.target.position({ x: 0, y: 0 });
                  moveWholeRoom(room.id, offset);
                  onEndLiveEdit();
                }}
              >
                <Line
                  points={flatten(room.polygon)}
                  closed
                  fill={category.color}
                  opacity={stage === 'cad' ? (isSelected ? 0.22 : 0.12) : isSelected ? 0.84 : 0.62}
                  stroke={stage === 'cad' ? '#94a3b8' : category.stroke}
                  strokeWidth={isSelected ? ui.strongStroke : stage === 'cad' ? ui.hairline : ui.hairline}
                />
              </Group>
            );
          })}
        </Layer>

        <Layer name="wallLayer" visible={layers.wallLayer} listening={canEditWalls}>
          {model.walls.map((wall) => {
            const isSelected = selection?.type === 'wall' && selection.id === wall.id;
            const fill =
              stage === 'cad'
                ? '#151a23'
                : wall.structural === 'load_bearing'
                  ? '#18202c'
                  : wall.structural === 'non_bearing'
                    ? '#546173'
                    : '#334155';
            const wallEditable = canEditWalls;
            return (
              <Group
                key={wall.id}
                draggable={wallEditable}
                x={0}
                y={0}
                onClick={() => {
                  if (canEditWalls) onSelectionChange({ type: 'wall', id: wall.id });
                }}
                onTap={() => {
                  if (canEditWalls) onSelectionChange({ type: 'wall', id: wall.id });
                }}
                onDragStart={() => {
                  if (!wallEditable) return;
                  onSelectionChange({ type: 'wall', id: wall.id });
                  onBeginLiveEdit();
                }}
                onDragEnd={(event) => {
                  if (!wallEditable) return;
                  const offset: Point = [event.target.x(), event.target.y()];
                  event.target.position({ x: 0, y: 0 });
                  moveWholeWall(wall.id, offset);
                  onEndLiveEdit();
                }}
              >
                <Line
                  points={flatten(wallPolygon(wall.centerline, wall.thicknessMm))}
                  closed
                  fill={fill}
                  opacity={stage === 'cad' ? 1 : 0.92}
                  stroke={stage === 'cad' ? '#0b1220' : undefined}
                  strokeWidth={stage === 'cad' ? 1 : 0}
                />
                <Line
                  points={flatten(wall.centerline)}
                  stroke={isSelected ? '#f59e0b' : '#0f172a'}
                  strokeWidth={isSelected ? ui.strongStroke : ui.hairline}
                  dash={isSelected ? [screenWorld(14), screenWorld(8)] : undefined}
                  opacity={isSelected ? 1 : stage === 'cad' ? 0 : 0.38}
                />
              </Group>
            );
          })}
        </Layer>

        <Layer name="openingLayer" visible={layers.openingLayer} listening={canEditOpenings}>
          {model.openings.map((opening) => {
            const isSelected = selection?.type === 'opening' && selection.id === opening.id;
            const isWindow = opening.type.includes('window');
            const mid = midpoint(opening.segment);
            const hostWall = opening.wallId ? model.walls.find((wall) => wall.id === opening.wallId) : null;
            const baseStroke = Math.max(12, (hostWall?.thicknessMm || model.source.mmPerSourcePx * 8) * 1.16);
            const markerStroke = stage === 'cad' ? Math.max(2.4, baseStroke * 0.18) : isSelected ? 7 : 5;
            return (
              <Group
                key={opening.id}
                draggable={canEditOpenings}
                x={0}
                y={0}
                onClick={() => {
                  if (canEditOpenings) onSelectionChange({ type: 'opening', id: opening.id });
                }}
                onDragStart={() => {
                  if (!canEditOpenings) return;
                  onSelectionChange({ type: 'opening', id: opening.id });
                  onBeginLiveEdit();
                }}
                onDragMove={(event) => {
                  if (!canEditOpenings) return;
                  event.target.position({ x: 0, y: 0 });
                  const point = pointerWorld();
                  if (point) moveOpening(opening.id, point);
                }}
                onDragEnd={(event) => {
                  if (!canEditOpenings) return;
                  event.target.position({ x: 0, y: 0 });
                  onEndLiveEdit();
                  onGuidesChange([]);
                }}
              >
                <Line points={flatten(opening.segment)} stroke="#ffffff" strokeWidth={baseStroke} lineCap="round" />
                <Line
                  points={flatten(opening.segment)}
                  stroke={isWindow ? '#0ea5e9' : stage === 'cad' ? '#111827' : '#f97316'}
                  strokeWidth={markerStroke}
                  lineCap="round"
                />
                {isSelected && <Circle x={mid[0]} y={mid[1]} radius={ui.handleLarge} fill="#ffffff" stroke="#111827" strokeWidth={ui.stroke} />}
              </Group>
            );
          })}
        </Layer>

        <Layer name="furnitureLayer" listening={canEditFurniture} visible={layers.furnitureLayer}>
          {model.furniture.map((item) => (
            <FurnitureNode
              key={item.id}
              item={item}
              selected={selection?.type === 'furniture' && selection.id === item.id}
              canEdit={canEditFurniture && !item.locked}
              onSelect={() => onSelectionChange({ type: 'furniture', id: item.id })}
              onBeginLiveEdit={onBeginLiveEdit}
              onMove={moveFurniture}
              onEndLiveEdit={onEndLiveEdit}
            />
          ))}
        </Layer>

        <Layer name="annotationLayer" listening={false} visible={layers.annotationLayer}>
          {model.rooms.map((room) => {
            const areaText = model.source.worldUnit === 'mm' ? `${(polygonArea(room.polygon) / 1_000_000).toFixed(1)} m2` : '';
            return (
              <Group key={room.id} x={room.labelPoint[0]} y={room.labelPoint[1]} listening={false}>
                <Text
                  x={-ui.roomLabelWidth / 2}
                  y={areaText ? -ui.roomLabelFont * 1.08 : -ui.roomLabelFont * 0.56}
                  width={ui.roomLabelWidth}
                  align="center"
                  text={room.name}
                  fontSize={ui.roomLabelFont}
                  lineHeight={1.02}
                  fontStyle="700"
                  fill="#172033"
                  opacity={0.84}
                />
                {areaText && (
                  <Text
                    x={-ui.roomLabelWidth / 2}
                    y={ui.roomLabelFont * 0.4}
                    width={ui.roomLabelWidth}
                    align="center"
                    text={areaText}
                    fontSize={ui.roomAreaFont}
                    lineHeight={1}
                    fontStyle="600"
                    fill="#475569"
                    opacity={0.72}
                  />
                )}
              </Group>
            );
          })}
        </Layer>

        <Layer name="cadSymbolOverlayLayer" listening={false} visible={stage === 'cad' && layers.openingLayer}>
          {model.openings.map((opening) => {
            const hostWall = opening.wallId ? model.walls.find((wall) => wall.id === opening.wallId) : null;
            const baseStroke = Math.max(12, (hostWall?.thicknessMm || model.source.mmPerSourcePx * 8) * 1.16);
            return <OpeningCadSymbol key={opening.id} opening={opening} baseStroke={baseStroke} viewport={viewport} />;
          })}
        </Layer>

        <Layer name="controlLayer" visible={layers.controlLayer} listening={canUseControlLayer}>
          {stage === 'calibrate' && (!selection || selection.type === 'background') && (
            <CalibrationRuler
              model={model}
              viewport={viewport}
              canEdit={canEditRuler}
              pointerWorld={pointerWorld}
              onBeginLiveEdit={onBeginLiveEdit}
              onMovePoint={setCalibrationRulerPoint}
              onEndLiveEdit={onEndLiveEdit}
            />
          )}
          {selectedWall?.centerline.map((point, index) => {
            const wallControlsEditable = canEditControls;
            return (
              <Circle
                key={`${selectedWall.id}-${index}`}
                x={point[0]}
                y={point[1]}
                radius={ui.handleLarge}
                fill={wallControlsEditable ? '#facc15' : '#d1d5db'}
                stroke="#111827"
                strokeWidth={ui.strongStroke}
                draggable={wallControlsEditable}
                onDragStart={() => {
                  if (wallControlsEditable) onBeginLiveEdit();
                }}
                onDragMove={() => {
                  if (!wallControlsEditable) return;
                  const raw = pointerWorld();
                  if (!raw) return;
                  const fixed = selectedWall.centerline[index === 0 ? 1 : 0];
                  const snapped = snapWallEndpoint(raw, fixed, model);
                  onGuidesChange(snapped.guides);
                  moveWallEndpoint(selectedWall.id, index as 0 | 1, snapped.point);
                }}
                onDragEnd={() => {
                  if (!wallControlsEditable) return;
                  onEndLiveEdit();
                  onGuidesChange([]);
                }}
              />
            );
          })}
          {selectedRoom && canEditRooms && (
            <Group>
              {uniquePolygon(selectedRoom.polygon).map((point, index, points) => {
                const nextPoint = points[(index + 1) % points.length];
                const edgeMid = midpoint([point, nextPoint]);
                const edgeKey = `${selectedRoom.id}-${index}`;
                return (
                  <Group key={edgeKey}>
                    <Circle
                      x={edgeMid[0]}
                      y={edgeMid[1]}
                      radius={ui.handle}
                      fill="#ffffff"
                      stroke="#0a84ff"
                      strokeWidth={ui.stroke}
                      draggable={canEditRooms}
                      onDragStart={() => {
                        edgeDragRef.current[edgeKey] = edgeMid;
                        onBeginLiveEdit();
                      }}
                      onDragMove={() => {
                        const pointWorld = pointerWorld();
                        const previous = edgeDragRef.current[edgeKey];
                        if (!pointWorld || !previous) return;
                        const offset: Point = [pointWorld[0] - previous[0], pointWorld[1] - previous[1]];
                        edgeDragRef.current[edgeKey] = pointWorld;
                        moveRoomEdge(selectedRoom.id, index, offset);
                      }}
                      onDragEnd={() => {
                        delete edgeDragRef.current[edgeKey];
                        onEndLiveEdit();
                      }}
                    />
                    <Circle
                      x={point[0]}
                      y={point[1]}
                      radius={ui.handleLarge}
                      fill="#0a84ff"
                      stroke="#ffffff"
                      strokeWidth={ui.strongStroke}
                      draggable={canEditRooms}
                      onDragStart={onBeginLiveEdit}
                      onDragMove={() => {
                        const pointWorld = pointerWorld();
                        if (pointWorld) moveRoomVertex(selectedRoom.id, index, pointWorld);
                      }}
                      onDragEnd={onEndLiveEdit}
                    />
                  </Group>
                );
              })}
            </Group>
          )}
          {selectedFurniture && layers.furnitureLayer && (
            <Group x={selectedFurniture.position[0]} y={selectedFurniture.position[1]} rotation={selectedFurniture.rotationDeg} listening={false}>
              <Rect
                x={-6}
                y={-6}
                width={selectedFurniture.size[0] + 12}
                height={selectedFurniture.size[1] + 12}
                stroke="#0a84ff"
                strokeWidth={ui.stroke}
                dash={ui.dash}
              />
            </Group>
          )}
          {guides.map((guide) =>
            guide.orientation === 'point' ? (
              <Circle key={guide.id} x={guide.points[0][0]} y={guide.points[0][1]} radius={ui.handleLarge} stroke="#22c55e" strokeWidth={ui.strongStroke} />
            ) : (
              <Line key={guide.id} points={flatten(guide.points)} stroke="#22c55e" strokeWidth={ui.stroke} dash={[screenWorld(18), screenWorld(10)]} listening={false} />
            ),
          )}
        </Layer>
      </Stage>
    </div>
  );
}

function uniquePolygon(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points;
}

function FurnitureNode({
  item,
  selected,
  canEdit,
  onSelect,
  onBeginLiveEdit,
  onMove,
  onEndLiveEdit,
}: {
  item: Furniture;
  selected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onBeginLiveEdit: () => void;
  onMove: (id: string, position: Point) => void;
  onEndLiveEdit: () => void;
}) {
  const image = useImage(furnitureAssetUrl(item.assetId));

  return (
    <Group
      x={item.position[0]}
      y={item.position[1]}
      rotation={item.rotationDeg}
      draggable={canEdit}
      onClick={() => {
        if (canEdit) onSelect();
      }}
      onTap={() => {
        if (canEdit) onSelect();
      }}
      onDragStart={() => {
        if (!canEdit) return;
        onSelect();
        onBeginLiveEdit();
      }}
      onDragEnd={(event) => {
        if (!canEdit) return;
        onMove(item.id, [event.target.x(), event.target.y()]);
        onEndLiveEdit();
      }}
    >
      {image ? (
        <KonvaImage image={image} width={item.size[0]} height={item.size[1]} opacity={item.locked ? 0.58 : 1} />
      ) : (
        <Rect width={item.size[0]} height={item.size[1]} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={1} dash={[8, 4]} />
      )}
      {selected && (
        <Rect
          x={0}
          y={0}
          width={item.size[0]}
          height={item.size[1]}
          stroke="#0a84ff"
          strokeWidth={2}
          dash={[12, 6]}
          listening={false}
        />
      )}
    </Group>
  );
}

function OpeningCadSymbol({ opening, baseStroke, viewport }: { opening: Opening; baseStroke: number; viewport: Viewport }) {
  const isWindow = opening.type.includes('window');
  const unit = normalizeVector(opening.segment[0], opening.segment[1]);
  const rawNormal = perpendicular(unit);
  const side = opening.side ?? 1;
  const normal: Point = [rawNormal[0] * side, rawNormal[1] * side];
  const length = segmentLength(opening.segment);
  const screenWorld = (pixels: number) => pixels / Math.max(viewport.scale, 0.001);
  const symbolStroke = screenWorld(2.5);
  const backingStroke = screenWorld(5);
  const dash = [screenWorld(8), screenWorld(5)];
  const hingeRadius = screenWorld(4.5);
  const symbolDepth = Math.max(baseStroke * 1.6, Math.min(length * 0.96, baseStroke * 12));
  const offset = (amount: number): [Point, Point] => [
    [opening.segment[0][0] + normal[0] * amount, opening.segment[0][1] + normal[1] * amount],
    [opening.segment[1][0] + normal[0] * amount, opening.segment[1][1] + normal[1] * amount],
  ];

  if (isWindow) {
    const a = offset(baseStroke * 0.34);
    const b = offset(-baseStroke * 0.34);
    return (
      <Group listening={false}>
        <Line points={flatten(a)} stroke="#ffffff" strokeWidth={backingStroke} lineCap="round" />
        <Line points={flatten(b)} stroke="#ffffff" strokeWidth={backingStroke} lineCap="round" />
        <Line points={flatten(a)} stroke="#0284c7" strokeWidth={symbolStroke} lineCap="round" />
        <Line points={flatten(b)} stroke="#0284c7" strokeWidth={symbolStroke} lineCap="round" />
        <Line points={flatten(opening.segment)} stroke="#e0f2fe" strokeWidth={screenWorld(2)} dash={dash} lineCap="round" />
      </Group>
    );
  }

  const hinge = opening.segment[0];
  const closedEnd: Point = [hinge[0] + unit[0] * Math.min(length, symbolDepth), hinge[1] + unit[1] * Math.min(length, symbolDepth)];
  const leafEnd: Point = [hinge[0] + normal[0] * symbolDepth, hinge[1] + normal[1] * symbolDepth];
  const arc = doorArcPoints(hinge, closedEnd, leafEnd, 11);
  return (
    <Group listening={false}>
      <Line points={flatten([hinge, leafEnd])} stroke="#ffffff" strokeWidth={backingStroke} lineCap="round" />
      <Line points={flatten([hinge, leafEnd])} stroke="#111827" strokeWidth={symbolStroke} lineCap="round" />
      <Line points={flatten(arc)} stroke="#ffffff" strokeWidth={backingStroke} lineCap="round" />
      <Line points={flatten(arc)} stroke="#f97316" strokeWidth={screenWorld(2)} dash={dash} lineCap="round" />
      <Circle x={hinge[0]} y={hinge[1]} radius={hingeRadius} fill="#ffffff" stroke="#f97316" strokeWidth={screenWorld(1.6)} />
    </Group>
  );
}

function doorArcPoints(origin: Point, from: Point, to: Point, steps: number): Point[] {
  const radius = Math.max(distance(origin, from), distance(origin, to));
  if (radius <= 0) return [origin, to];
  let start = Math.atan2(from[1] - origin[1], from[0] - origin[0]);
  let end = Math.atan2(to[1] - origin[1], to[0] - origin[0]);
  let delta = end - start;
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return Array.from({ length: steps }, (_, index) => {
    const t = index / Math.max(1, steps - 1);
    const angle = start + delta * t;
    return [origin[0] + Math.cos(angle) * radius, origin[1] + Math.sin(angle) * radius] as Point;
  });
}

function CalibrationRuler({
  model,
  viewport,
  canEdit,
  pointerWorld,
  onBeginLiveEdit,
  onMovePoint,
  onEndLiveEdit,
}: {
  model: FloorplanModel;
  viewport: Viewport;
  canEdit: boolean;
  pointerWorld: () => Point | null;
  onBeginLiveEdit: () => void;
  onMovePoint: (endpoint: 0 | 1, point: Point) => void;
  onEndLiveEdit: () => void;
}) {
  const ruler = model.source.calibrationRuler;
  const rulerLengthWorld = distance(ruler.start, ruler.end);
  const sourcePxLength = model.source.worldUnit === 'mm' ? rulerLengthWorld / model.source.mmPerSourcePx : rulerLengthWorld;
  const mid = midpoint([ruler.start, ruler.end]);
  const label = `${sourcePxLength.toFixed(0)} px${ruler.knownLengthMm ? ` / ${Math.round(ruler.knownLengthMm)} mm` : ''}`;
  const screenWorld = (pixels: number) => pixels / Math.max(viewport.scale, 0.001);
  const labelWidth = screenWorld(160);
  const labelFont = screenWorld(12);
  const strokeWidth = screenWorld(2.4);
  const handleRadius = screenWorld(8);

  return (
    <Group listening={canEdit}>
      <Line
        points={flatten([ruler.start, ruler.end])}
        stroke="#ff375f"
        strokeWidth={strokeWidth}
        dash={[screenWorld(12), screenWorld(8)]}
        lineCap="round"
      />
      <Text
        x={mid[0] - labelWidth / 2}
        y={mid[1] - screenWorld(30)}
        width={labelWidth}
        align="center"
        text={label}
        fontSize={labelFont}
        fontStyle="700"
        fill="#ff375f"
      />
      {[ruler.start, ruler.end].map((point, index) => (
        <Circle
          key={index}
          x={point[0]}
          y={point[1]}
          radius={handleRadius}
          fill="#ffffff"
          stroke="#ff375f"
          strokeWidth={strokeWidth}
          draggable={canEdit}
          onDragStart={() => {
            if (canEdit) onBeginLiveEdit();
          }}
          onDragMove={() => {
            if (!canEdit) return;
            const next = pointerWorld();
            if (next) onMovePoint(index as 0 | 1, next);
          }}
          onDragEnd={() => {
            if (canEdit) onEndLiveEdit();
          }}
        />
      ))}
    </Group>
  );
}

function useImage(src: string) {
  const [image, setImage] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!src) return;
    const next = new window.Image();
    next.crossOrigin = 'anonymous';
    next.src = src;
    next.onload = () => setImage(createReadablePlanImage(next));
    return () => setImage(null);
  }, [src]);
  return image;
}

function createReadablePlanImage(image: HTMLImageElement): HTMLImageElement | HTMLCanvasElement {
  try {
    const sample = document.createElement('canvas');
    const sampleSize = 80;
    sample.width = sampleSize;
    sample.height = sampleSize;
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) return image;
    sampleContext.drawImage(image, 0, 0, sampleSize, sampleSize);
    const samplePixels = sampleContext.getImageData(0, 0, sampleSize, sampleSize).data;
    let brightnessSum = 0;
    for (let index = 0; index < samplePixels.length; index += 4) {
      brightnessSum += luminance(samplePixels[index], samplePixels[index + 1], samplePixels[index + 2]);
    }
    const averageBrightness = brightnessSum / (samplePixels.length / 4);
    if (averageBrightness > 96) return image;

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return image;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    for (let index = 0; index < data.length; index += 4) {
      const value = luminance(data[index], data[index + 1], data[index + 2]);
      if (value < 28) {
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
        data[index + 3] = 255;
        continue;
      }
      const ink = Math.max(18, Math.min(210, 255 - value));
      data[index] = ink;
      data[index + 1] = ink;
      data[index + 2] = ink;
      data[index + 3] = Math.min(255, Math.max(90, data[index + 3]));
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  } catch {
    return image;
  }
}

function luminance(red: number, green: number, blue: number) {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}
