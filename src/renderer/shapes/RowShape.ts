import Konva from 'konva';
import type { Row } from '@/src/domain/types';

export function createRowShape(row: Row): Konva.Group {
  const group = new Konva.Group({
    x: row.transform.position.x,
    y: row.transform.position.y,
  });
  group.setAttr('elementId', row.id);
  group.setAttr('elementType', 'row');

  return group;
}

export function updateRowShape(group: Konva.Group, row: Row): void {
  group.x(row.transform.position.x);
  group.y(row.transform.position.y);
}
