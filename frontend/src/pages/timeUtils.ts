import { BarPosition } from '../components/FlexTable/types';
import { FlowEntity } from '../api/entities';

export type TimeGranularity = 'day' | 'week' | 'month';

// ── 内部ヘルパー ──────────────────────────────────────────────

/** ISO 8601 週番号を返す（1月4日が常に第1週） */
function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // 木曜日を基準にした年を求める
  const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay(); // 月=1 … 日=7
  d.setDate(d.getDate() + 4 - dayOfWeek); // 同週の木曜日
  const year = d.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() === 0 ? 7 : jan4.getDay();
  const firstMonday = new Date(jan4.getTime() - (jan4Day - 1) * 86400000);
  const week = Math.round((d.getTime() - firstMonday.getTime()) / (7 * 86400000)) + 1;
  return { year, week };
}

/** 指定日が属するISO週の月曜日を返す */
function isoWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() === 0 ? 7 : d.getDay(); // 月=1 … 日=7
  d.setDate(d.getDate() - (day - 1));
  return d;
}

/** 指定日の月初を返す */
function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** 列の終了日時（次の列の開始日時）を返す */
export function colEnd(colStart: Date, granularity: TimeGranularity): Date {
  switch (granularity) {
    case 'day':
      return new Date(colStart.getFullYear(), colStart.getMonth(), colStart.getDate() + 1);
    case 'week':
      return new Date(colStart.getFullYear(), colStart.getMonth(), colStart.getDate() + 7);
    case 'month':
      return new Date(colStart.getFullYear(), colStart.getMonth() + 1, 1);
  }
}

/**
 * 日付文字列 "YYYY-MM-DD" をローカルタイムゾーンの Date に変換する。
 * new Date("YYYY-MM-DD") は UTC 0時として解釈されるため、
 * ローカルタイムゾーンで解析するためにこの関数を使う。
 */
export function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function stringDateLocal(date: Date) : string { return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`; }

/**
 * 全タスクの start_date / due_date から時系列列配列を生成する。
 * 最低4週間を保証し、granularity に応じた列を返す。
 * rangeStart / rangeEnd が指定された場合はその範囲を優先する。
 */
export function generateTimeCols(
  tasks: FlowEntity[],
  granularity: TimeGranularity,
  rangeStart?: string | null,
  rangeEnd?: string | null,
): Date[] {
  const MIN_WEEKS = 4;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 外部指定の範囲があればそれを優先
  let minDate: Date | null = rangeStart ? parseDateLocal(rangeStart) : null;
  let maxDate: Date | null = rangeEnd ? parseDateLocal(rangeEnd) : null;

  // タスクの日付範囲でさらに拡張（外部指定がない場合はタスクから算出）
  if (!minDate || !maxDate) {
    for (const task of tasks) {
      const startStr = task['start_date'] as string | null | undefined;
      const dueStr = task['due_date'] as string | null | undefined;
      if (startStr && !rangeStart) {
        const d = parseDateLocal(startStr);
        if (!isNaN(d.getTime())) {
          if (!minDate || d < minDate) minDate = d;
        }
      }
      if (dueStr && !rangeEnd) {
        const d = parseDateLocal(dueStr);
        if (!isNaN(d.getTime())) {
          if (!maxDate || d > maxDate) maxDate = d;
        }
      }
    }
  }

  // タスクなし or 日付なしの場合は今日を基準に前後2週間
  if (!minDate || !maxDate) {
    minDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14);
    maxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14);
  }

  // 最低4週間を保証
  const spanMs = maxDate.getTime() - minDate.getTime();
  const fourWeeksMs = MIN_WEEKS * 7 * 86400000;
  if (spanMs < fourWeeksMs) {
    const extra = (fourWeeksMs - spanMs) / 2;
    minDate = new Date(minDate.getTime() - extra);
    maxDate = new Date(maxDate.getTime() + extra);
  }

  // 列の開始日を granularity に合わせて切り捨て
  let cursor: Date;
  switch (granularity) {
    case 'day':
      cursor = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
      break;
    case 'week':
      cursor = isoWeekMonday(minDate);
      break;
    case 'month':
      cursor = monthStart(minDate);
      break;
  }

  const cols: Date[] = [];
  while (cursor <= maxDate) {
    cols.push(new Date(cursor));
    const next = colEnd(cursor, granularity);
    cursor = next;
  }

  return cols;
}

/**
 * 列ヘッダ文字列を返す。
 * - day:   YYYY-MM-DD
 * - week:  YYYY-Www
 * - month: YYYY/MM
 */
export function formatColHeader(date: Date, granularity: TimeGranularity): string {
  switch (granularity) {
    case 'day': {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const dw = ["日", "月", "火", "水", "木" ,"金" ,"土"][date.getDay()];
      //return `${y}-${m}-${d}`;
      return `${m}-${d} (${dw})`;
    }
    case 'week': {
      const { year, week } = getISOWeek(date);
      // 月曜日の日付も表示: YYYY-MM-DD~ (Www)
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      //return `${y}-${m}-${d}~ (W${String(week).padStart(2, '0')})`;
      return `${m}-${d}~ (W${String(week).padStart(2, '0')})`;
    }
    case 'month': {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      return `${y}/${m}`;
    }
  }
}

/**
 * 日付を BarPosition に変換する。
 * 範囲外の場合はクランプする。
 */
export function dateToBarPosition(
  date: Date,
  timeCols: Date[],
  granularity: TimeGranularity,
): BarPosition {
  if (timeCols.length === 0) return { colIndex: 0, offset: 0 };

  for (let i = 0; i < timeCols.length; i++) {
    const start = timeCols[i];
    const end = colEnd(start, granularity);
    if (date < end) {
      if (date < start) {
        return { colIndex: 0, offset: 0 };
      }
      const offset = (date.getTime() - start.getTime()) / (end.getTime() - start.getTime());
      return { colIndex: i, offset: Math.min(1, Math.max(0, offset)) };
    }
  }

  return { colIndex: timeCols.length - 1, offset: 1 };
}

/**
 * BarPosition を Date に変換する。
 */
export function barPositionToDate(
  pos: BarPosition,
  timeCols: Date[],
  granularity: TimeGranularity,
): Date {
  if (timeCols.length === 0) return new Date();

  const clampedIndex = Math.min(Math.max(0, pos.colIndex), timeCols.length - 1);
  const clampedOffset = Math.min(1, Math.max(0, pos.offset));

  const start = timeCols[clampedIndex];
  const end = colEnd(start, granularity);
  const ms = start.getTime() + clampedOffset * (end.getTime() - start.getTime());
  return new Date(ms);
}

/**
 * 新しい start_date が due_date を超えないようにクランプする。
 */
export function clampStartDate(newStart: string, due: string): string {
  return newStart > due ? due : newStart;
}

/**
 * 新しい due_date が start_date より前にならないようにクランプする。
 */
export function clampDueDate(start: string, newDue: string): string {
  return newDue < start ? start : newDue;
}
