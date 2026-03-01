import Konva from 'konva';
import type { Table } from '@/src/domain/types';

export function createTableShape(table: Table): Konva.Group {
  const group = new Konva.Group({
    x: table.transform.position.x,
    y: table.transform.position.y,
  });
  group.setAttr('elementId', table.id);
  group.setAttr('elementType', 'table');

  const circle = new Konva.Circle({
    x: 0,
    y: 0,
    radius: table.tableRadius,
    fill: '#A1887F',
    stroke: '#8D6E63',
    strokeWidth: 2,
    name: 'tableBody',
  });
  group.add(circle);

  const label = new Konva.Text({
    text: table.label,
    fontSize: 11,
    fontStyle: 'bold',
    fill: '#fff',
    align: 'center',
    verticalAlign: 'middle',
    name: 'tableLabel',
  });
  label.offsetX(label.width() / 2);
  label.offsetY(label.height() / 2);
  group.add(label);

  return group;
}

export function updateTableShape(group: Konva.Group, table: Table): void {
  group.x(table.transform.position.x);
  group.y(table.transform.position.y);

  const label = group.findOne('.tableLabel') as Konva.Text;
  if (label) {
    label.text(table.label);
    label.offsetX(label.width() / 2);
    label.offsetY(label.height() / 2);
  }
}

export function applyTableSelection(group: Konva.Group): void {
  const body = group.findOne('.tableBody') as Konva.Shape;
  if (body) {
    body.fill('rgba(66, 133, 244, 0.15)');
    body.stroke('rgba(66, 133, 244, 0.5)');
    body.strokeWidth(2);
  }
}

export function clearTableSelection(group: Konva.Group): void {
  const body = group.findOne('.tableBody') as Konva.Shape;
  if (body) {
    body.fill('#A1887F');
    body.stroke('#8D6E63');
    body.strokeWidth(2);
  }
}
