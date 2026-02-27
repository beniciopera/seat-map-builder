import Konva from 'konva';
import type { Seat } from '@/src/domain/types';
import { categoryColor, hexToRgba } from '@/src/utils/color';

export function createSeatShape(seat: Seat): Konva.Group {
  const group = new Konva.Group({
    x: seat.transform.position.x,
    y: seat.transform.position.y,
    rotation: seat.transform.rotation * (180 / Math.PI),
  });
  group.setAttr('elementId', seat.id);
  group.setAttr('elementType', 'seat');

  const circle = new Konva.Circle({
    x: 0,
    y: 0,
    radius: seat.radius,
    fill: hexToRgba(categoryColor(seat.category), 0.35),
    stroke: categoryColor(seat.category),
    strokeWidth: 2,
    name: 'seatCircle',
  });

  const label = new Konva.Text({
    text: seat.label,
    fontSize: 7,
    fill: categoryColor(seat.category),
    align: 'center',
    verticalAlign: 'middle',
    name: 'seatLabel',
  });
  // Center the text
  label.offsetX(label.width() / 2);
  label.offsetY(label.height() / 2);

  group.add(circle);
  group.add(label);

  return group;
}

export function updateSeatShape(group: Konva.Group, seat: Seat): void {
  group.x(seat.transform.position.x);
  group.y(seat.transform.position.y);
  group.rotation(seat.transform.rotation * (180 / Math.PI));

  const circle = group.findOne('.seatCircle') as Konva.Circle;
  if (circle) {
    circle.radius(seat.radius);
    circle.fill(hexToRgba(categoryColor(seat.category), 0.35));
    circle.stroke(categoryColor(seat.category));
  }

  const label = group.findOne('.seatLabel') as Konva.Text;
  if (label) {
    label.text(seat.label);
    label.fill(categoryColor(seat.category));
    label.offsetX(label.width() / 2);
    label.offsetY(label.height() / 2);
  }
}

export function applySeatSelection(group: Konva.Group): void {
  const circle = group.findOne('.seatCircle') as Konva.Circle;
  if (circle) {
    circle.stroke('#1565C0');
    circle.strokeWidth(3);
  }
}

export function clearSeatSelection(group: Konva.Group, seat: Seat): void {
  const circle = group.findOne('.seatCircle') as Konva.Circle;
  if (circle) {
    circle.fill(hexToRgba(categoryColor(seat.category), 0.35));
    circle.stroke(categoryColor(seat.category));
    circle.strokeWidth(2);
  }
}
