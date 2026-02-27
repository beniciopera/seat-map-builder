import type { MapLayout, MapElement, ElementId } from './types';

const SCHEMA_VERSION = 1;

export interface SerializedLayout {
  schemaVersion: number;
  id: string;
  name: string;
  width: number;
  height: number;
  elements: MapElement[];
  createdAt: number;
  updatedAt: number;
}

export function serializeLayout(layout: MapLayout): string {
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
  return JSON.stringify(data, null, 2);
}

export function deserializeLayout(json: string): MapLayout {
  const data = JSON.parse(json) as SerializedLayout;

  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid JSON: expected an object');
  }

  if (data.schemaVersion !== undefined && data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version: ${data.schemaVersion}`);
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

  return {
    id: data.id,
    name: data.name,
    width: data.width,
    height: data.height,
    elements,
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
  };
}
