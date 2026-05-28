import type { LayerKey, LayerLocks, LayerVisibility } from './types';

export const LAYER_DEFINITIONS: Array<{ key: LayerKey; label: string; color: string }> = [
  { key: 'backgroundLayer', label: 'Background', color: '#8e8e93' },
  { key: 'roomLayer', label: 'Rooms', color: '#0a84ff' },
  { key: 'wallLayer', label: 'Walls', color: '#1c1c1e' },
  { key: 'openingLayer', label: 'Openings', color: '#00c7be' },
  { key: 'furnitureLayer', label: 'Furniture', color: '#bf5af2' },
  { key: 'annotationLayer', label: 'Annotations', color: '#636366' },
  { key: 'controlLayer', label: 'Edit Guides', color: '#ffd60a' },
];

export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  backgroundLayer: true,
  roomLayer: true,
  wallLayer: true,
  openingLayer: true,
  furnitureLayer: true,
  annotationLayer: true,
  controlLayer: true,
};

export const DEFAULT_LAYER_LOCKS: LayerLocks = {
  backgroundLayer: false,
  roomLayer: false,
  wallLayer: false,
  openingLayer: false,
  furnitureLayer: false,
  annotationLayer: false,
  controlLayer: false,
};
