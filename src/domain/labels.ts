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
 * When a row label changes, generate new labels for all its seats.
 */
export function propagateRowLabel(
  newRowLabel: string,
  seatCount: number,
): string[] {
  const labels: string[] = [];
  for (let i = 0; i < seatCount; i++) {
    labels.push(seatLabel(newRowLabel, i));
  }
  return labels;
}
