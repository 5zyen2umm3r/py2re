import { BarPosition } from "./types";

/**
 * ポインタのX座標をBarPositionに変換する。
 * colIndex ∈ [0, totalColumns-1], offset ∈ [0, 1] にクランプされる。
 */
export function pointerToBarPosition(
  x: number,
  containerWidth: number,
  totalColumns: number,
): BarPosition {
  const rawRatio = x / containerWidth;
  let colIndex = Math.floor(rawRatio * totalColumns);
  let offset = rawRatio * totalColumns - colIndex;

  // クランプ
  if (colIndex < 0) {
    colIndex = 0;
    offset = 0;
  } else if (colIndex >= totalColumns) {
    colIndex = totalColumns - 1;
    offset = 1;
  }

  if (offset < 0) offset = 0;
  if (offset > 1) offset = 1;

  return { colIndex, offset };
}

/**
 * BarPositionをleft%に変換する。
 * left = (colIndex + offset) / totalColumns * 100
 */
export function barToLeftPercent(pos: BarPosition, totalColumns: number): number {
  return ((pos.colIndex + pos.offset) / totalColumns) * 100;
}

/**
 * BarPositionをright%に変換する。
 * right = (1 - (colIndex + offset) / totalColumns) * 100
 */
export function barToRightPercent(pos: BarPosition, totalColumns: number): number {
  return (1 - (pos.colIndex + pos.offset) / totalColumns) * 100;
}
