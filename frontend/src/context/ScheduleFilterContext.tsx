/**
 * ScheduleFilterContext
 * ページ間共通のフィルタ状態（プロジェクト選択・対象期間）を管理する。
 * LocalStorage に永続化する。
 */
import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { FlowEntity } from "../api/entities";

const LS_KEY = "scheduleFilter";

interface ScheduleFilter {
  selectedProjectIds: number[];
  rangeStart: string | null; // YYYY-MM-DD
  rangeEnd: string | null;   // YYYY-MM-DD
}

interface ScheduleFilterContextValue {
  selectedProjectIds: number[];
  rangeStart: string | null;
  rangeEnd: string | null;
  setSelectedProjects: (projects: FlowEntity[]) => void;
  setRangeStart: (date: string | null) => void;
  setRangeEnd: (date: string | null) => void;
}

function loadFromLS(): ScheduleFilter {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as ScheduleFilter;
  } catch { /* ignore */ }
  return { selectedProjectIds: [], rangeStart: null, rangeEnd: null };
}

function saveToLS(f: ScheduleFilter) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

const ScheduleFilterContext = createContext<ScheduleFilterContextValue | null>(null);

export function ScheduleFilterProvider({ children }: { children: ReactNode }) {
  const initial = loadFromLS();
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>(initial.selectedProjectIds);
  const [rangeStart, setRangeStartState] = useState<string | null>(initial.rangeStart);
  const [rangeEnd, setRangeEndState] = useState<string | null>(initial.rangeEnd);

  const setSelectedProjects = useCallback((projects: FlowEntity[]) => {
    const ids = projects.map((p) => p.id as number);
    setSelectedProjectIds(ids);
    saveToLS({ selectedProjectIds: ids, rangeStart, rangeEnd });
  }, [rangeStart, rangeEnd]);

  const setRangeStart = useCallback((date: string | null) => {
    setRangeStartState(date);
    saveToLS({ selectedProjectIds, rangeStart: date, rangeEnd });
  }, [selectedProjectIds, rangeEnd]);

  const setRangeEnd = useCallback((date: string | null) => {
    setRangeEndState(date);
    saveToLS({ selectedProjectIds, rangeStart, rangeEnd: date });
  }, [selectedProjectIds, rangeStart]);

  return (
    <ScheduleFilterContext.Provider value={{
      selectedProjectIds, rangeStart, rangeEnd,
      setSelectedProjects, setRangeStart, setRangeEnd,
    }}>
      {children}
    </ScheduleFilterContext.Provider>
  );
}

export function useScheduleFilter(): ScheduleFilterContextValue {
  const ctx = useContext(ScheduleFilterContext);
  if (!ctx) throw new Error("useScheduleFilter must be used within ScheduleFilterProvider");
  return ctx;
}
