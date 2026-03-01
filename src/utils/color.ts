import type { SeatStatus } from '@/src/domain/types';
import type { Category } from '@/src/domain/categories';
import { DEFAULT_CATEGORIES } from '@/src/domain/categories';

let categoryRegistry = new Map<string, Category>();
function initRegistry(): void {
  categoryRegistry = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
}
initRegistry();

const STATUS_COLORS: Record<SeatStatus, string> = {
  available: '#4CAF50',
  reserved: '#FF9800',
  blocked: '#9E9E9E',
  sold: '#F44336',
};

export function setCategoryRegistry(map: Map<string, Category>): void {
  categoryRegistry = new Map(map);
}

export function categoryColor(categoryId: string): string {
  const cat = categoryRegistry.get(categoryId);
  return cat?.color ?? '#9E9E9E';
}

export function statusColor(status: SeatStatus): string {
  return STATUS_COLORS[status];
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
