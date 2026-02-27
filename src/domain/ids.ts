import { nanoid } from 'nanoid';
import type { ElementId } from './types';

export function generateElementId(): ElementId {
  return nanoid(12) as ElementId;
}

export function generateMapId(): string {
  return nanoid(16);
}
