import Konva from 'konva';
import type { Area } from '@/src/domain/types';
import { hexToRgba, ensureMinDarkness } from '@/src/utils/color';

export function createAreaShape(area: Area): Konva.Group {
  const halfW = area.bounds.width / 2;
  const halfH = area.bounds.height / 2;
  const color = ensureMinDarkness(area.color);

  const group = new Konva.Group({
    x: area.transform.position.x,
    y: area.transform.position.y,
    rotation: area.transform.rotation * (180 / Math.PI),
  });
  group.setAttr('elementId', area.id);
  group.setAttr('elementType', 'area');

  const rect = new Konva.Rect({
    x: -halfW,
    y: -halfH,
    width: area.bounds.width,
    height: area.bounds.height,
    fill: hexToRgba(color, 0.08),
    stroke: color,
    strokeWidth: 1.5,
    cornerRadius: 4,
    name: 'areaRect',
  });

  const label = new Konva.Text({
    text: area.label,
    fontSize: 13,
    fill: color,
    width: area.bounds.width,
    align: 'center',
    verticalAlign: 'middle',
    name: 'areaLabel',
  });
  label.x(-halfW);
  label.y(-label.height() / 2);

  group.add(rect);
  group.add(label);

  return group;
}

export function updateAreaShape(group: Konva.Group, area: Area): void {
  const halfW = area.bounds.width / 2;
  const halfH = area.bounds.height / 2;

  group.x(area.transform.position.x);
  group.y(area.transform.position.y);
  group.rotation(area.transform.rotation * (180 / Math.PI));

  const color = ensureMinDarkness(area.color);
  const rect = group.findOne('.areaRect') as Konva.Rect;
  if (rect) {
    rect.x(-halfW);
    rect.y(-halfH);
    rect.width(area.bounds.width);
    rect.height(area.bounds.height);
    rect.fill(hexToRgba(color, 0.08));
    rect.stroke(color);
  }

  const label = group.findOne('.areaLabel') as Konva.Text;
  if (label) {
    label.text(area.label);
    label.fill(color);
    label.width(area.bounds.width);
    label.x(-halfW);
    label.y(-label.height() / 2);
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
  const color = ensureMinDarkness(area.color);
  const rect = group.findOne('.areaRect') as Konva.Rect;
  if (rect) {
    rect.fill(hexToRgba(color, 0.08));
    rect.stroke(color);
    rect.strokeWidth(1.5);
    rect.dashEnabled(false);
  }
}
