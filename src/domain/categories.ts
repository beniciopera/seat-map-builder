import { nanoid } from 'nanoid';

export type CategoryId = string;

export interface Category {
  id: CategoryId;
  name: string;
  color: string;
  isDefault: boolean;
}

export const DEFAULT_CATEGORY_ID = 'planta1' as CategoryId;

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'planta1', name: 'Planta 1', color: '#2196F3', isDefault: true },
  { id: 'planta2', name: 'Planta 2', color: '#4CAF50', isDefault: true },
  { id: 'vip', name: 'VIP', color: '#FFD700', isDefault: true },
];

export function generateCategoryId(): CategoryId {
  return nanoid(10);
}
