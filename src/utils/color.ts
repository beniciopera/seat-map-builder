import type { SeatCategory, SeatStatus } from '@/src/domain/types';

const CATEGORY_COLORS: Record<SeatCategory, string> = {
  planta1: '#2196F3',
  planta2: '#4CAF50',
  vip: '#FFD700',
};

const STATUS_COLORS: Record<SeatStatus, string> = {
  available: '#4CAF50',
  reserved: '#FF9800',
  blocked: '#9E9E9E',
  sold: '#F44336',
};

export function categoryColor(category: SeatCategory): string {
  return CATEGORY_COLORS[category];
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
