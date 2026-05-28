import { useMemo, useState } from 'react';
import { ChevronDown, Search, Sofa } from 'lucide-react';
import { FURNITURE_CATEGORIES, furnitureAssetUrl } from '../lib/furniture/catalog';
import type { FurnitureCatalogItem } from '../lib/furniture/catalog';
import type { OpeningType } from '../lib/types';

interface Props {
  onAddFurniture: (item: FurnitureCatalogItem, category: string) => void;
  onAddOpening: (type: OpeningType) => void;
  disabled?: boolean;
}

export function FurniturePanel({ onAddFurniture, onAddOpening, disabled = false }: Props) {
  const [query, setQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(FURNITURE_CATEGORIES.map((category) => category.name)),
  );
  const normalizedQuery = query.trim().toLowerCase();
  const sections = useMemo(
    () =>
      FURNITURE_CATEGORIES.map((category) => ({
        ...category,
        label: categoryLabel(category.name),
        items: normalizedQuery
          ? category.items.filter((item) => `${category.name} ${item.name}`.toLowerCase().includes(normalizedQuery))
          : category.items,
      })).filter((category) => category.items.length > 0),
    [normalizedQuery],
  );
  const assetCount = FURNITURE_CATEGORIES.reduce((total, category) => total + category.items.length, 0);

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryName)) next.delete(categoryName);
      else next.add(categoryName);
      return next;
    });
  };

  return (
    <section className="panel furniture-panel shape-library-panel">
      <div className="panel-title with-icon">
        <Sofa size={15} />
        <span>Furniture</span>
        <small>{assetCount} assets</small>
      </div>
      <label className="shape-search">
        <Search size={14} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Shapes" />
      </label>
      <div className="shape-section-list">
        {sections.map((category) => {
          const expanded = expandedCategories.has(category.name);
          return (
            <section key={category.name} className="shape-section">
              <button className="shape-section-header" type="button" onClick={() => toggleCategory(category.name)}>
                <span>{category.label}</span>
                <ChevronDown size={14} className={expanded ? 'expanded' : ''} />
              </button>
              {expanded && (
                <div className="shape-symbol-grid">
                  {category.items.map((item) => (
                    <CatalogButton
                      key={`${category.name}-${item.name}`}
                      category={category.name}
                      item={item}
                      disabled={disabled}
                      onAddFurniture={onAddFurniture}
                      onAddOpening={onAddOpening}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {sections.length === 0 && <div className="shape-empty-state">No matching furniture symbols.</div>}
      </div>
    </section>
  );
}

function CatalogButton({
  category,
  item,
  disabled,
  onAddFurniture,
  onAddOpening,
}: {
  category: string;
  item: FurnitureCatalogItem;
  disabled: boolean;
  onAddFurniture: (item: FurnitureCatalogItem, category: string) => void;
  onAddOpening: (type: OpeningType) => void;
}) {
  const openingType = category === 'Wall' ? openingTypeFromCatalogItem(item.name) : null;

  return (
    <button
      className="furniture-catalog-item"
      type="button"
      disabled={disabled}
      title={openingType ? `${item.name}: snap to nearest wall opening` : item.name}
      draggable={!disabled}
      onDragStart={(event) => {
        if (openingType) {
          event.dataTransfer.setData('application/x-floorplan-opening-type', openingType);
        } else {
          event.dataTransfer.setData('application/x-floorplan-furniture', JSON.stringify({ category, item }));
        }
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => {
        if (disabled) return;
        if (openingType) onAddOpening(openingType);
        else onAddFurniture(item, category);
      }}
    >
      <img src={furnitureAssetUrl(item.imagePath)} alt="" />
      <span>{item.name}</span>
    </button>
  );
}

function openingTypeFromCatalogItem(name: string): OpeningType | null {
  const normalized = name.toLowerCase();
  if (normalized.includes('window')) return 'window';
  if (normalized.includes('door')) return 'door';
  return null;
}

function categoryLabel(name: string) {
  if (name === 'Wall') return 'Doors and Walls';
  if (name === 'Bedroom') return 'Bed Room';
  return name;
}
