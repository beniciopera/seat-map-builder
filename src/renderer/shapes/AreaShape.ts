import Konva from 'konva';
import type { Area } from '@/src/domain/types';
import { hexToRgba } from '@/src/utils/color';

export function createAreaShape(area: Area): Konva.Group {
  const group = new Konva.Group({
    x: area.bounds.x,
    y: area.bounds.y,
  });
  group.setAttr('elementId', area.id);
  group.setAttr('elementType', 'area');

  const rect = new Konva.Rect({
    x: 0,
    y: 0,
    width: area.bounds.width,
    height: area.bounds.height,
    fill: hexToRgba(area.color, 0.08),
    stroke: area.color,
    strokeWidth: 1.5,
    cornerRadius: 4,
    name: 'areaRect',
  });

  const label = new Konva.Text({
    text: area.label,
    fontSize: 13,
    fill: area.color,
    width: area.bounds.width,
    align: 'center',
    verticalAlign: 'middle',
    name: 'areaLabel',
  });
  label.y((area.bounds.height - label.height()) / 2);

  group.add(rect);
  group.add(label);

  return group;
}

export function updateAreaShape(group: Konva.Group, area: Area): void {
  group.x(area.bounds.x);
  group.y(area.bounds.y);

  const rect = group.findOne('.areaRect') as Konva.Rect;
  if (rect) {
    rect.width(area.bounds.width);
    rect.height(area.bounds.height);
    rect.fill(hexToRgba(area.color, 0.08));
    rect.stroke(area.color);
  }

  const label = group.findOne('.areaLabel') as Konva.Text;
  if (label) {
    label.text(area.label);
    label.fill(area.color);
    label.width(area.bounds.width);
    label.y((area.bounds.height - label.height()) / 2);
  }
}

export function applyAreaSelection(group: Konva.Group): void {
  const rect = group.findOne('.areaRect') as Konva.Rect;
  if (rect) {
    rect.stroke('#1A73E8');
    rect.strokeWidth(2.5);
    rect.dash([6, 3]);
    rect.dashEnabled(true);
  }
}

export function clearAreaSelection(group: Konva.Group, area: Area): void {
  const rect = group.findOne('.areaRect') as Konva.Rect;
  if (rect) {
    rect.fill(hexToRgba(area.color, 0.08));
    rect.stroke(area.color);
    rect.strokeWidth(1.5);
    rect.dashEnabled(false);
  }
}
