/**
 * Generates row labels: A, B, ..., Z, AA, AB, ...
 */
export function rowLabelFromIndex(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * Generates a seat label: "{rowLabel}-{seatNumber}" e.g. "A-1"
 */
export function seatLabel(rowLabel: string, seatIndex: number): string {
  return `${rowLabel}-${seatIndex + 1}`;
}

/**
 * Extracts the display portion of a seat label for rendering.
 * "A-1" -> "1", standalone labels returned as-is.
 */
export function seatDisplayLabel(fullLabel: string): string {
  const dashIndex = fullLabel.lastIndexOf('-');
  if (dashIndex >= 0) return fullLabel.substring(dashIndex + 1);
  return fullLabel;
}

/**
 * Extracts the numeric seat number from a full seat label.
 * "A-3" -> 3, "B-12" -> 12. Returns null if parsing fails.
 */
export function seatNumberFromLabel(fullLabel: string): number | null {
  const dashIndex = fullLabel.lastIndexOf('-');
  if (dashIndex < 0) return null;
  const num = parseInt(fullLabel.substring(dashIndex + 1), 10);
  return Number.isNaN(num) ? null : num;
}

/**
 * When a row label changes, generate new labels for all its seats.
 * @param startIndex - offset for continuous numbering across rows sharing a label (default 0)
 */
export function propagateRowLabel(
  newRowLabel: string,
  seatCount: number,
  startIndex: number = 0,
): string[] {
  const labels: string[] = [];
  for (let i = 0; i < seatCount; i++) {
    labels.push(seatLabel(newRowLabel, startIndex + i));
  }
  return labels;
}
