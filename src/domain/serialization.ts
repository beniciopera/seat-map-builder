import type { MapLayout, MapElement, ElementId } from './types';
import type { Category } from './categories';
import { DEFAULT_CATEGORIES } from './categories';

const SCHEMA_VERSION = 2;

export interface SerializedLayout {
  schemaVersion: number;
  id: string;
  name: string;
  width: number;
  height: number;
  elements: MapElement[];
  createdAt: number;
  updatedAt: number;
  categories?: Category[];
}

export function serializeLayout(layout: MapLayout, categories?: Category[]): string {
  const data: SerializedLayout = {
    schemaVersion: SCHEMA_VERSION,
    id: layout.id,
    name: layout.name,
    width: layout.width,
    height: layout.height,
    elements: Array.from(layout.elements.values()),
    createdAt: layout.createdAt,
    updatedAt: layout.updatedAt,
  };
  if (categories !== undefined && categories.length > 0) {
    data.categories = categories;
  }
  return JSON.stringify(data, null, 2);
}

export interface DeserializedLayout {
  layout: MapLayout;
  categories: Category[];
}

export function deserializeLayout(json: string): DeserializedLayout {
  const data = JSON.parse(json) as SerializedLayout;

  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid JSON: expected an object');
  }

  const version = data.schemaVersion ?? 1;
  if (version !== 1 && version !== 2) {
    throw new Error(`Unsupported schema version: ${version}`);
  }

  if (!Array.isArray(data.elements)) {
    throw new Error('Invalid layout: elements must be an array');
  }

  if (!data.id || !data.name || !data.width || !data.height) {
    throw new Error('Invalid layout: missing required fields (id, name, width, height)');
  }

  const elements = new Map<ElementId, MapElement>();
  for (const el of data.elements) {
    if (!el.id || !el.type) {
      throw new Error('Invalid element: missing id or type');
    }
    elements.set(el.id as ElementId, el as MapElement);
  }

  const layout: MapLayout = {
    id: data.id,
    name: data.name,
    width: data.width,
    height: data.height,
    elements,
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
  };

  let categories: Category[];
  if (version === 2 && Array.isArray(data.categories) && data.categories.length > 0) {
    const byId = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
    for (const cat of data.categories) {
      if (cat?.id && cat?.name != null && cat?.color != null) {
        byId.set(cat.id, {
          id: cat.id,
          name: cat.name,
          color: cat.color,
          isDefault: cat.isDefault ?? DEFAULT_CATEGORIES.some((d) => d.id === cat.id),
        });
      }
    }
    categories = Array.from(byId.values());
  } else {
    categories = [...DEFAULT_CATEGORIES];
  }

  return { layout, categories };
}
