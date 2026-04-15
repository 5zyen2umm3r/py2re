/**
 * TimeLogFilterContext
 * TimeLogPage 専用の週単位期間・表示設定・対象ユーザを管理する。
 * LocalStorage に永続化する。
 */
import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

const LS_KEY = "timeLogFilter";

export interface TimeLogFilter {
  weekStart: string;      // YYYY-MM-DD（月曜日）
  showWeekends: boolean;
  selectedUserId: number | null;
}

export interface TimeLogFilterContextValue {
  weekStart: string;
  showWeekends: boolean;
  setWeekStart: (date: string) => void;
  setShowWeekends: (show: boolean) => void;
  /** 任意の日付文字列から、その週の月曜日を YYYY-MM-DD で返す */
  getWeekStart: (date: string) => string;
  selectedUserId: number | null;
  setSelectedUserId: (id: number | null) => void;
}

/** Date を "YYYY-MM-DD" 形式の文字列に変換する */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 任意の日付文字列（YYYY-MM-DD）から、その週の月曜日を返す。
 * 無効な日付の場合は今週の月曜日にフォールバックする。
 */
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // 無効な日付の場合は今週の月曜日にフォールバック
    return getWeekStart(formatDate(new Date()));
  }
  const day = d.getDay(); // 0=日, 1=月, ..., 6=土
  const diff = day === 0 ? -6 : 1 - day; // 月曜日へのオフセット
  d.setDate(d.getDate() + diff);
  return formatDate(d);
}

/**
 * weekStart（月曜日）から days 日分の Date 配列を返す。
 * showWeekends=false: 月〜金の5日間
 * showWeekends=true:  月〜日の7日間
 */
export function generateWeekDates(weekStart: string, showWeekends: boolean): Date[] {
  const days = showWeekends ? 7 : 5;
  const [y, m, d] = weekStart.split("-").map(Number);
  const result: Date[] = [];
  for (let i = 0; i < days; i++) {
    result.push(new Date(y, m - 1, d + i));
  }
  return result;
}

function loadFromLS(): TimeLogFilter {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as TimeLogFilter;
  } catch { /* ignore */ }
  return {
    weekStart: getWeekStart(formatDate(new Date())),
    showWeekends: false,
    selectedUserId: null,
  };
}

function saveToLS(f: TimeLogFilter) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

const TimeLogFilterContext = createContext<TimeLogFilterContextValue | null>(null);

export function TimeLogFilterProvider({ children }: { children: ReactNode }) {
  const initial = loadFromLS();
  const [weekStart, setWeekStartState] = useState<string>(initial.weekStart);
  const [showWeekends, setShowWeekendsState] = useState<boolean>(initial.showWeekends);
  const [selectedUserId, setSelectedUserIdState] = useState<number | null>(initial.selectedUserId);

  const setWeekStart = useCallback((date: string) => {
    setWeekStartState(date);
    saveToLS({ weekStart: date, showWeekends, selectedUserId });
  }, [showWeekends, selectedUserId]);

  const setShowWeekends = useCallback((show: boolean) => {
    setShowWeekendsState(show);
    saveToLS({ weekStart, showWeekends: show, selectedUserId });
  }, [weekStart, selectedUserId]);

  const setSelectedUserId = useCallback((id: number | null) => {
    setSelectedUserIdState(id);
    saveToLS({ weekStart, showWeekends, selectedUserId: id });
  }, [weekStart, showWeekends]);

  return (
    <TimeLogFilterContext.Provider value={{
      weekStart,
      showWeekends,
      setWeekStart,
      setShowWeekends,
      getWeekStart,
      selectedUserId,
      setSelectedUserId,
    }}>
      {children}
    </TimeLogFilterContext.Provider>
  );
}

export function useTimeLogFilter(): TimeLogFilterContextValue {
  const ctx = useContext(TimeLogFilterContext);
  if (!ctx) throw new Error("useTimeLogFilter must be used within TimeLogFilterProvider");
  return ctx;
}
