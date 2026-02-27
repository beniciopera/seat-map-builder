import type { Seat, Row } from './types';

export const MIN_SEAT_SPACING = 18;
export const MAX_SEATS_PER_ROW = 100;
export const MIN_SEAT_RADIUS = 5;
export const MAX_SEAT_RADIUS = 30;
export const DEFAULT_SEAT_RADIUS = 8;
export const DEFAULT_SEAT_SPACING = 18;

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateSeat(seat: Seat): ValidationResult {
  const errors: string[] = [];
  if (seat.radius < MIN_SEAT_RADIUS) {
    errors.push(`Seat radius must be at least ${MIN_SEAT_RADIUS}`);
  }
  if (seat.radius > MAX_SEAT_RADIUS) {
    errors.push(`Seat radius must be at most ${MAX_SEAT_RADIUS}`);
  }
  if (!seat.label || seat.label.trim().length === 0) {
    errors.push('Seat must have a label');
  }
  return { valid: errors.length === 0, errors };
}

export function validateRow(row: Row): ValidationResult {
  const errors: string[] = [];
  if (row.seatIds.length > MAX_SEATS_PER_ROW) {
    errors.push(`Row cannot have more than ${MAX_SEATS_PER_ROW} seats`);
  }
  if (row.spacing < MIN_SEAT_SPACING) {
    errors.push(`Row spacing must be at least ${MIN_SEAT_SPACING}`);
  }
  if (!row.label || row.label.trim().length === 0) {
    errors.push('Row must have a label');
  }
  return { valid: errors.length === 0, errors };
}
