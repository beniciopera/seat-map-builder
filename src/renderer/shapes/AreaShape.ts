import Konva from 'konva';
import type { Area } from '@/src/domain/types';
import { hexToRgba, ensureMinDarkness } from '@/src/utils/color';

export function createAreaShape(area: Area): Konva.Group {
  const color = ensureMinDarkness(area.color);
  const group = new Konva.Group({
    x: area.transform.position.x,
    y: area.transform.position.y,
    rotation: area.transform.rotation * (180 / Math.PI),
  });
  group.setAttr('elementId', area.id);
  group.setAttr('elementType', 'area');

  if (area.vertices && area.vertices.length >= 3) {
    const cx = area.transform.position.x;
    const cy = area.transform.position.y;
    const localPoints = area.vertices.flatMap((v) => [v.x - cx, v.y - cy]);
    const line = new Konva.Line({
      points: localPoints,
      closed: true,
      fill: hexToRgba(color, 0.08),
      stroke: color,
      strokeWidth: 1.5,
      name: 'areaPolygon',
    });
    group.add(line);
  } else {
    const halfW = area.bounds.width / 2;
    const halfH = area.bounds.height / 2;
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
    group.add(rect);
  }

  const label = new Konva.Text({
    text: area.label,
    fontSize: 13,
    fill: color,
    width: area.bounds.width,
    align: 'center',
    verticalAlign: 'middle',
    name: 'areaLabel',
  });
  const halfW = area.bounds.width / 2;
  label.x(-halfW);
  label.y(-label.height() / 2);
  group.add(label);

  return group;
}

export function updateAreaShape(group: Konva.Group, area: Area): void {
  group.x(area.transform.position.x);
  group.y(area.transform.position.y);
  group.rotation(area.transform.rotation * (180 / Math.PI));

  const color = ensureMinDarkness(area.color);

  if (area.vertices && area.vertices.length >= 3) {
    const cx = area.transform.position.x;
    const cy = area.transform.position.y;
    const localPoints = area.vertices.flatMap((v) => [v.x - cx, v.y - cy]);
    const line = group.findOne('.areaPolygon') as Konva.Line | undefined;
    if (line) {
      line.points(localPoints);
      line.fill(hexToRgba(color, 0.08));
      line.stroke(color);
    }
  } else {
    const halfW = area.bounds.width / 2;
    const halfH = area.bounds.height / 2;
    const rect = group.findOne('.areaRect') as Konva.Rect | undefined;
    if (rect) {
      rect.x(-halfW);
      rect.y(-halfH);
      rect.width(area.bounds.width);
      rect.height(area.bounds.height);
      rect.fill(hexToRgba(color, 0.08));
      rect.stroke(color);
    }
  }

  const label = group.findOne('.areaLabel') as Konva.Text;
  if (label) {
    label.text(area.label);
    label.fill(color);
    label.width(area.bounds.width);
    label.x(-area.bounds.width / 2);
    label.y(-label.height() / 2);
  }
}

export function applyAreaSelection(group: Konva.Group): void {
  const rect = group.findOne('.areaRect') as Konva.Rect | undefined;
  const line = group.findOne('.areaPolygon') as Konva.Line | undefined;
  const shape = rect ?? line;
  if (shape) {
    shape.stroke('#1A73E8');
    shape.strokeWidth(2.5);
    shape.dash([6, 3]);
    shape.dashEnabled(true);
  }
}

export function clearAreaSelection(group: Konva.Group, area: Area): void {
  const color = ensureMinDarkness(area.color);
  const rect = group.findOne('.areaRect') as Konva.Rect | undefined;
  const line = group.findOne('.areaPolygon') as Konva.Line | undefined;
  const shape = rect ?? line;
  if (shape) {
    shape.fill(hexToRgba(color, 0.08));
    shape.stroke(color);
    shape.strokeWidth(1.5);
    shape.dashEnabled(false);
  }
}
