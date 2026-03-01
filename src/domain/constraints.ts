import type { Seat, Row } from './types';

export const MIN_SEAT_SPACING = 10;
export const MAX_SEATS_PER_ROW = 100;
export const MIN_SEAT_RADIUS = 5;
export const MAX_SEAT_RADIUS = 30;
export const DEFAULT_SEAT_RADIUS = 12;
export const DEFAULT_SEAT_SPACING = 14;
export const DEFAULT_TABLE_RADIUS = 32;
export const DEFAULT_TABLE_SEAT_GAP = 4;
export const MIN_SEATS_PER_TABLE = 1;
export const MAX_SEATS_PER_TABLE = 8;
export const DEFAULT_SEATS_PER_TABLE = 6;
export const CURVATURE_EPSILON = 3; // abs(sagitta) below this snaps to perfectly straight

/**
 * Single canonical "effectively straight" rule for row curvature.
 * Used by shadow, seat layout, commit, and extend/contract so they stay in sync.
 */
export function isRowCurvatureEffectivelyStraight(sagitta: number, chord: number): boolean {
  if (!sagitta || Math.abs(sagitta) <= CURVATURE_EPSILON) return true;
  if (chord > 0 && Math.abs(sagitta) / chord < 0.02) return true;
  return false;
}

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
