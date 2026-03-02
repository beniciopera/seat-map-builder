import { BaseTool } from './Tool';
import type { EditorInputEvent } from '../input/InputEvent';
import type { Point } from '@/src/domain/geometry';
import type { Table, Seat, ElementId } from '@/src/domain/types';
import type { AngleSnapTarget } from '../systems/SnapEngine';
import { generateElementId } from '@/src/domain/ids';
import { DEFAULT_TRANSFORM } from '@/src/domain/geometry';
import { DEFAULT_SEAT_RADIUS, DEFAULT_TABLE_RADIUS, DEFAULT_TABLE_SEAT_GAP, DEFAULT_SEATS_PER_TABLE } from '@/src/domain/constraints';
import { DEFAULT_CATEGORY_ID } from '@/src/domain/categories';
import { CreateTableCommand } from '../commands/CreateTableCommand';

const PREVIEW_TABLE_SOURCE_ID = 'preview-table' as unknown as ElementId;

export class TableTool extends BaseTool {
  readonly id = 'table';
  readonly label = 'Place Table';
  readonly icon = 'TableRestaurant';
  readonly cursor = 'crosshair';

  private tableCounter = 0;
  private seatCount = DEFAULT_SEATS_PER_TABLE;
  private tableRadius = DEFAULT_TABLE_RADIUS;

  onPointerDown(event: EditorInputEvent): void {
    if (!this.engine || event.button !== 0) return;

    this.transition('placing');
  }

  onPointerMove(event: EditorInputEvent): void {
    if (!this.engine) return;

    if (this._currentState === 'idle') {
      this.transition('preview');
    }

    // Element-to-create guidelines only: horizontal and vertical through preview center (no proximity/snap)
    const center = event.worldPoint;
    const selfGuidelines: AngleSnapTarget[] = [
      { throughPoint: center, angle: 0, sourceElementId: PREVIEW_TABLE_SOURCE_ID, alignmentType: 'center' },
      { throughPoint: center, angle: Math.PI / 2, sourceElementId: PREVIEW_TABLE_SOURCE_ID, alignmentType: 'center' },
    ];
    this.engine.guidelines.computeFromSnapTargets([], selfGuidelines);

    this.engine.events.emit('preview:table', {
      center: event.worldPoint,
      tableRadius: this.tableRadius,
      seatCount: this.seatCount,
      seatGap: DEFAULT_TABLE_SEAT_GAP,
      label: `T${this.tableCounter + 1}`,
    });
    this.engine.events.emit('render:request', {});
  }

  onPointerUp(event: EditorInputEvent): void {
    if (!this.engine) return;

    if (this._currentState === 'placing') {
      this.placeTable(event.worldPoint);
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.cancel();
  }

  onDeactivate(): void {
    this.engine?.events.emit('preview:clear', {} as Record<string, never>);
    super.onDeactivate();
  }

  cancel(): void {
    this.engine?.events.emit('preview:clear', {} as Record<string, never>);
    this.engine?.guidelines.clear();
    this.transition('idle');
  }

  setSeatCount(count: number): void {
    this.seatCount = count;
  }

  setTableRadius(radius: number): void {
    this.tableRadius = radius;
  }

  private placeTable(pos: Point): void {
    if (!this.engine) return;

    this.engine.events.emit('preview:clear', {} as Record<string, never>);

    const { label: tableLabel, counter } = this.engine.nextAvailableTableLabel(1);
    this.tableCounter = counter;
    const seatRadius = DEFAULT_SEAT_RADIUS;
    const seatDistFromCenter = this.tableRadius + seatRadius + DEFAULT_TABLE_SEAT_GAP;

    const tableId = generateElementId();

    // Generate seats around the table
    const seats: Seat[] = [];
    const seatIds = [];
    for (let i = 0; i < this.seatCount; i++) {
      const angle = (2 * Math.PI * i) / this.seatCount;
      const seatPos = {
        x: pos.x + Math.cos(angle) * seatDistFromCenter,
        y: pos.y + Math.sin(angle) * seatDistFromCenter,
      };
      const id = generateElementId();
      seatIds.push(id);
      seats.push({
        id,
        type: 'seat',
        label: `${tableLabel}-${i + 1}`,
        rowId: null,
        tableId,
        status: 'available',
        category: DEFAULT_CATEGORY_ID,
        radius: seatRadius,
        locked: false,
        visible: true,
        transform: { ...DEFAULT_TRANSFORM, position: seatPos },
        bounds: {
          x: seatPos.x - seatRadius,
          y: seatPos.y - seatRadius,
          width: seatRadius * 2,
          height: seatRadius * 2,
        },
      });
    }

    const table: Table = {
      id: tableId,
      type: 'table',
      label: tableLabel,
      seatCount: this.seatCount,
      seatIds,
      tableRadius: this.tableRadius,
      category: DEFAULT_CATEGORY_ID,
      locked: false,
      visible: true,
      transform: { ...DEFAULT_TRANSFORM, position: pos },
      bounds: {
        x: pos.x - this.tableRadius,
        y: pos.y - this.tableRadius,
        width: this.tableRadius * 2,
        height: this.tableRadius * 2,
      },
    };

    const cmd = new CreateTableCommand(this.engine, table, seats);
    this.engine.history.execute(cmd);
    this.engine.guidelines.clear();
    this.transition('idle');
  }
}
