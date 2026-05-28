import catalogData from './arcadaCatalog.json';
import type { Furniture, Point, Viewport } from '../types';

export const ARCADA_ASSET_BASE = '/vendor/arcada/assets/2d';

export interface FurnitureCatalogItem {
  name: string;
  width: number;
  height: number;
  imagePath: string;
  zIndex?: number;
}

export interface FurnitureCatalogCategory {
  name: string;
  items: FurnitureCatalogItem[];
}

export const FURNITURE_CATEGORIES = catalogData.categories as FurnitureCatalogCategory[];

export function furnitureAssetUrl(assetId: string): string {
  return `${ARCADA_ASSET_BASE}/${assetId}.svg`;
}

export function createFurnitureFromCatalog(item: FurnitureCatalogItem, category: string, center: Point, worldUnit: 'mm' | 'source_px'): Furniture {
  const scale = worldUnit === 'mm' ? 1000 : 100;
  const size: Point = [item.width * scale, item.height * scale];
  return {
    id: `furniture_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    assetId: item.imagePath,
    name: item.name,
    category,
    position: [center[0] - size[0] / 2, center[1] - size[1] / 2],
    size,
    rotationDeg: 0,
    zIndex: item.zIndex ?? 100,
    locked: false,
  };
}

export function viewportCenter(viewport: Viewport, width = window.innerWidth, height = window.innerHeight): Point {
  return [(width / 2 - viewport.x) / viewport.scale, (height / 2 - viewport.y) / viewport.scale];
}
