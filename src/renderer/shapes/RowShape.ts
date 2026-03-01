import Konva from 'konva';
import type { Row } from '@/src/domain/types';
import type { Point } from '@/src/domain/geometry';
import { isRowCurvatureEffectivelyStraight } from '@/src/domain/constraints';
import { distance, angleBetween, parabolaTangentLocal, curveDefinitionFromEndpoints, worldToParabolaLocalX } from '@/src/utils/math';

export interface RowLabelInfo {
  firstSeatPos: Point;
  lastSeatPos: Point | null;
  seatRadius: number;
}

const LABEL_GAP = 12;
const LABEL_FONT_SIZE = 10;
const LABEL_OPACITY = 0.55;
const LABEL_COLOR = '#555';

function computeLabelPosition(
  row: Row,
  info: RowLabelInfo,
): { x: number; y: number } {
  const { firstSeatPos, lastSeatPos, seatRadius } = info;
  const offset = seatRadius + LABEL_GAP;

  let tangentAngle: number;

  if (!lastSeatPos || row.seatIds.length < 2) {
    tangentAngle = row.orientationAngle;
  } else {
    const sagitta = row.curveRadius;
    const def = row.curveDefinition ?? curveDefinitionFromEndpoints(firstSeatPos, lastSeatPos);

    if (isRowCurvatureEffectivelyStraight(sagitta, def.chord) || def.chord < 1e-6) {
      tangentAngle = angleBetween(firstSeatPos, lastSeatPos);
    } else {
      // Use actual local x of first seat on the parabola
      const localXFirst = worldToParabolaLocalX(firstSeatPos, def);
      const t = parabolaTangentLocal(localXFirst, sagitta, def.chord);
      const worldTx = t.tx * Math.cos(def.angle) - t.ty * Math.sin(def.angle);
      const worldTy = t.tx * Math.sin(def.angle) + t.ty * Math.cos(def.angle);
      tangentAngle = Math.atan2(worldTy, worldTx);
    }
  }

  const cos = Math.cos(tangentAngle);
  const sin = Math.sin(tangentAngle);
  const x = firstSeatPos.x - cos * offset;
  const y = firstSeatPos.y - sin * offset;

  return { x, y };
}

export function createRowShape(row: Row, labelInfo?: RowLabelInfo): Konva.Group {
  const group = new Konva.Group({
    x: row.transform.position.x,
    y: row.transform.position.y,
  });
  group.setAttr('elementId', row.id);
  group.setAttr('elementType', 'row');

  if (labelInfo && row.label) {
    const label = new Konva.Text({
      text: row.label,
      fontSize: LABEL_FONT_SIZE,
      fontStyle: 'bold',
      fill: LABEL_COLOR,
      opacity: LABEL_OPACITY,
      listening: false,
      name: 'rowLabel',
    });

    const { x, y } = computeLabelPosition(row, labelInfo);
    label.x(x - row.transform.position.x);
    label.y(y - row.transform.position.y);
    label.offsetX(label.width() / 2);
    label.offsetY(label.height() / 2);

    group.add(label);
  }

  return group;
}

export function updateRowShape(group: Konva.Group, row: Row, labelInfo?: RowLabelInfo): void {
  group.x(row.transform.position.x);
  group.y(row.transform.position.y);

  let label = group.findOne('.rowLabel') as Konva.Text | undefined;

  if (labelInfo && row.label) {
    if (!label) {
      label = new Konva.Text({
        text: row.label,
        fontSize: LABEL_FONT_SIZE,
        fontStyle: 'bold',
        fill: LABEL_COLOR,
        opacity: LABEL_OPACITY,
        listening: false,
        name: 'rowLabel',
      });
      group.add(label);
    }

    label.text(row.label);

    const { x, y } = computeLabelPosition(row, labelInfo);
    label.x(x - row.transform.position.x);
    label.y(y - row.transform.position.y);
    label.offsetX(label.width() / 2);
    label.offsetY(label.height() / 2);
  } else if (label) {
    label.destroy();
  }
}
