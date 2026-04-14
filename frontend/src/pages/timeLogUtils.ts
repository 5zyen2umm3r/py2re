import { BarPosition } from "../components/FlexTable/types";

export type MinUnit = 5 | 10 | 15 | 30 | 60;

export interface HighlightZone {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface TimeLogEntry {
  id: number | string;
  sg_start_time: string; // ISO datetime
  duration: number;      // 分
}

const MIN_UNIT_STEPS: MinUnit[] = [5, 10, 15, 30, 60];

/** "HH:MM" を当日の Date に変換する */
export function parseTimeOfDay(timeStr: string, baseDate?: Date): Date {
  const [hh, mm] = timeStr.split(":").map(Number);
  const d = baseDate ? new Date(baseDate) : new Date();
  d.setHours(hh, mm, 0, 0);
  return d;
}

/** 対象時間帯を MinUnit で分割した時刻配列を生成する */
export function generateTimeColumns(
  timeStart: string,
  timeEnd: string,
  minUnit: MinUnit,
): Date[] {
  const base = new Date(2000, 0, 1); // 固定基準日
  const start = parseTimeOfDay(timeStart, base);
  const end = parseTimeOfDay(timeEnd, base);
  if (start >= end) return [];

  const cols: Date[] = [];
  const cur = new Date(start);
  while (cur < end) {
    cols.push(new Date(cur));
    cur.setMinutes(cur.getMinutes() + minUnit);
  }
  return cols;
}

/** 対象期間内の日付配列を生成する */
export function generateDateRows(
  rangeStart: string,
  rangeEnd: string,
): Date[] {
  const rows: Date[] = [];
  const [sy, sm, sd] = rangeStart.split("-").map(Number);
  const [ey, em, ed] = rangeEnd.split("-").map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (cur <= end) {
    rows.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return rows;
}

/** 分数を MinUnit にスナップする */
export function snapToMinUnit(minutes: number, minUnit: MinUnit): number {
  return Math.round(minutes / minUnit) * minUnit;
}

/** MinUnit を1段階小さくする */
export function decreaseMinUnit(current: MinUnit): MinUnit {
  const idx = MIN_UNIT_STEPS.indexOf(current);
  return MIN_UNIT_STEPS[Math.max(0, idx - 1)];
}

/** MinUnit を1段階大きくする */
export function increaseMinUnit(current: MinUnit): MinUnit {
  const idx = MIN_UNIT_STEPS.indexOf(current);
  return MIN_UNIT_STEPS[Math.min(MIN_UNIT_STEPS.length - 1, idx + 1)];
}

/** TimeColumn が HighlightZone 内に含まれるか判定する（[start, end) 半開区間） */
export function isInHighlightZone(colTime: Date, zones: HighlightZone[]): boolean {
  const h = colTime.getHours();
  const m = colTime.getMinutes();
  const totalMin = h * 60 + m;

  for (const zone of zones) {
    const [sh, sm] = zone.start.split(":").map(Number);
    const [eh, em] = zone.end.split(":").map(Number);
    const zoneStart = sh * 60 + sm;
    const zoneEnd = eh * 60 + em;
    if (totalMin >= zoneStart && totalMin < zoneEnd) return true;
  }
  return false;
}

/** ISO datetime の時刻部分を BarPosition に変換する */
export function timeToBarPosition(
  sgStartTime: string,
  timeCols: Date[],
  minUnit: MinUnit,
): BarPosition {
  if (timeCols.length === 0) return { colIndex: 0, offset: 0 };

  const dt = new Date(sgStartTime);
  const dtMin = dt.getHours() * 60 + dt.getMinutes();

  const firstMin = timeCols[0].getHours() * 60 + timeCols[0].getMinutes();
  const lastMin = timeCols[timeCols.length - 1].getHours() * 60 + timeCols[timeCols.length - 1].getMinutes();

  if (dtMin <= firstMin) return { colIndex: 0, offset: 0 };
  if (dtMin >= lastMin + minUnit) return { colIndex: timeCols.length - 1, offset: 1 };

  const diffMin = dtMin - firstMin;
  const colIndex = Math.floor(diffMin / minUnit);
  const offset = (diffMin % minUnit) / minUnit;

  const clampedIndex = Math.min(colIndex, timeCols.length - 1);
  return { colIndex: clampedIndex, offset };
}

/** BarPosition を時刻 Date に変換する */
export function barPositionToTime(
  pos: BarPosition,
  timeCols: Date[],
  minUnit: MinUnit,
): Date {
  if (timeCols.length === 0) return new Date();
  const base = timeCols[Math.min(pos.colIndex, timeCols.length - 1)];
  const result = new Date(base);
  result.setMinutes(result.getMinutes() + Math.round(pos.offset * minUnit));
  return result;
}

/**
 * 同一 DateRow・同一ユーザの TimeLogs から重複を解消する。
 * sg_start_time 順にソートし、重複するエントリを後ろにずらす。
 * 変更が必要なエントリのパッチ配列を返す。
 */
export function resolveOverlaps(
  timeLogs: TimeLogEntry[],
): Array<{ id: number | string; sg_start_time: string; duration: number }> {
  if (timeLogs.length === 0) return [];

  // sg_start_time でソート（元配列を変更しない）
  const sorted = [...timeLogs].sort(
    (a, b) => new Date(a.sg_start_time).getTime() - new Date(b.sg_start_time).getTime(),
  );

  const patches: Array<{ id: number | string; sg_start_time: string; duration: number }> = [];
  let prevEnd: Date | null = null;

  for (const log of sorted) {
    const start = new Date(log.sg_start_time);
    let adjustedStart = start;

    if (prevEnd !== null && start < prevEnd) {
      adjustedStart = new Date(prevEnd);
    }

    const end = new Date(adjustedStart.getTime() + log.duration * 60 * 1000);
    prevEnd = end;

    if (adjustedStart.getTime() !== start.getTime()) {
      patches.push({
        id: log.id,
        sg_start_time: adjustedStart.toISOString(),
        duration: log.duration,
      });
    }
  }

  return patches;
}

/**
 * DateRow 上の既存 TimeLogs から新規 TimeLog の sg_start_time を決定する。
 * 空なら baseDate の 09:00、そうでなければ最大終了時刻を返す。
 */
export function computeNewStartTime(
  existingLogs: TimeLogEntry[],
  baseDate: Date,
): string {
  if (existingLogs.length === 0) {
    const d = new Date(baseDate);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }

  let maxEnd = new Date(0);
  for (const log of existingLogs) {
    const end = new Date(new Date(log.sg_start_time).getTime() + log.duration * 60 * 1000);
    if (end > maxEnd) maxEnd = end;
  }
  return maxEnd.toISOString();
}
