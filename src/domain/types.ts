import type { Point, Rect, Transform } from './geometry';

export type ElementId = string & { readonly __brand: unique symbol };

export type ElementType = 'seat' | 'row' | 'area' | 'table';

export interface BaseElement {
  readonly id: ElementId;
  readonly type: ElementType;
  readonly transform: Transform;
  readonly bounds: Rect;
  readonly locked: boolean;
  readonly visible: boolean;
}

export type SeatStatus = 'available' | 'reserved' | 'blocked' | 'sold';

export type SeatCategory = 'planta1' | 'planta2' | 'vip';

export interface Seat extends BaseElement {
  readonly type: 'seat';
  readonly label: string;
  readonly rowId: ElementId | null;
  readonly tableId: ElementId | null;
  readonly status: SeatStatus;
  readonly category: SeatCategory;
  readonly radius: number;
}

export type SeatOrderDirection = 'left-to-right' | 'right-to-left';

export type RowCategory = 'planta1' | 'planta2' | 'vip';

export interface Row extends BaseElement {
  readonly type: 'row';
  readonly label: string;
  readonly seatIds: readonly ElementId[];
  readonly orientationAngle: number;
  readonly spacing: number;
  readonly seatOrderDirection: SeatOrderDirection;
  readonly areaId: ElementId | null;
  readonly curveRadius: number; // 0 = straight, non-zero = curved arc
  readonly category: RowCategory;
  readonly price: number;
}

export interface Area extends BaseElement {
  readonly type: 'area';
  readonly label: string;
  readonly color: string;
  readonly rowIds: readonly ElementId[];
}

export type TableShape = 'round' | 'rectangular';

export interface Table extends BaseElement {
  readonly type: 'table';
  readonly label: string;
  readonly shape: TableShape;
  readonly seatCount: number;
  readonly seatIds: readonly ElementId[];
  readonly tableRadius: number;
  readonly tableWidth: number;
  readonly tableHeight: number;
  readonly category: SeatCategory;
}

export type MapElement = Seat | Row | Area | Table;

export interface MapLayout {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly elements: ReadonlyMap<ElementId, MapElement>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export function isSeat(el: MapElement): el is Seat {
  return el.type === 'seat';
}

export function isRow(el: MapElement): el is Row {
  return el.type === 'row';
}

export function isArea(el: MapElement): el is Area {
  return el.type === 'area';
}

export function isTable(el: MapElement): el is Table {
  return el.type === 'table';
}
