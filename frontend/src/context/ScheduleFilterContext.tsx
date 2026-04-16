/**
 * ScheduleFilterContext
 * ページ間共通のフィルタ状態（プロジェクト・サブプロジェクト・フェーズ・対象期間）を管理する。
 * LocalStorage に永続化する。
 */
import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { FlowEntity } from "../api/entities";

const LS_KEY = "scheduleFilter";

interface ScheduleFilter {
  selectedProjectIds: number[];
  selectedSubProjectIds: number[];
  selectedPhaseIds: number[];
  rangeStart: string | null;
  rangeEnd: string | null;
}

interface ScheduleFilterContextValue {
  selectedProjectIds: number[];
  selectedSubProjectIds: number[];
  selectedPhaseIds: number[];
  rangeStart: string | null;
  rangeEnd: string | null;
  setSelectedProjects: (projects: FlowEntity[]) => void;
  setSelectedSubProjects: (subProjects: FlowEntity[]) => void;
  setSelectedPhases: (phases: FlowEntity[]) => void;
  setRangeStart: (date: string | null) => void;
  setRangeEnd: (date: string | null) => void;
}

function loadFromLS(): ScheduleFilter {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ScheduleFilter>;
      return {
        selectedProjectIds: parsed.selectedProjectIds ?? [],
        selectedSubProjectIds: parsed.selectedSubProjectIds ?? [],
        selectedPhaseIds: parsed.selectedPhaseIds ?? [],
        rangeStart: parsed.rangeStart ?? null,
        rangeEnd: parsed.rangeEnd ?? null,
      };
    }
  } catch { /* ignore */ }
  return { selectedProjectIds: [], selectedSubProjectIds: [], selectedPhaseIds: [], rangeStart: null, rangeEnd: null };
}

function saveToLS(f: ScheduleFilter) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

const ScheduleFilterContext = createContext<ScheduleFilterContextValue | null>(null);

export function ScheduleFilterProvider({ children }: { children: ReactNode }) {
  const initial = loadFromLS();
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>(initial.selectedProjectIds);
  const [selectedSubProjectIds, setSelectedSubProjectIds] = useState<number[]>(initial.selectedSubProjectIds);
  const [selectedPhaseIds, setSelectedPhaseIds] = useState<number[]>(initial.selectedPhaseIds);
  const [rangeStart, setRangeStartState] = useState<string | null>(initial.rangeStart);
  const [rangeEnd, setRangeEndState] = useState<string | null>(initial.rangeEnd);

  const save = useCallback((
    projectIds: number[],
    subProjectIds: number[],
    phaseIds: number[],
    start: string | null,
    end: string | null,
  ) => {
    saveToLS({
      selectedProjectIds: projectIds,
      selectedSubProjectIds: subProjectIds,
      selectedPhaseIds: phaseIds,
      rangeStart: start,
      rangeEnd: end,
    });
  }, []);

  const setSelectedProjects = useCallback((projects: FlowEntity[]) => {
    const ids = projects.map((p) => p.id as number);
    setSelectedProjectIds(ids);
    // Project が変わったら Sub Project・Phase の選択をリセット
    setSelectedSubProjectIds([]);
    setSelectedPhaseIds([]);
    save(ids, [], [], rangeStart, rangeEnd);
  }, [rangeStart, rangeEnd, save]);

  const setSelectedSubProjects = useCallback((subProjects: FlowEntity[]) => {
    const ids = subProjects.map((sp) => sp.id as number);
    setSelectedSubProjectIds(ids);
    // Sub Project が変わったら Phase の選択をリセット
    setSelectedPhaseIds([]);
    save(selectedProjectIds, ids, [], rangeStart, rangeEnd);
  }, [selectedProjectIds, rangeStart, rangeEnd, save]);

  const setSelectedPhases = useCallback((phases: FlowEntity[]) => {
    const ids = phases.map((ph) => ph.id as number);
    setSelectedPhaseIds(ids);
    save(selectedProjectIds, selectedSubProjectIds, ids, rangeStart, rangeEnd);
  }, [selectedProjectIds, selectedSubProjectIds, rangeStart, rangeEnd, save]);

  const setRangeStart = useCallback((date: string | null) => {
    setRangeStartState(date);
    save(selectedProjectIds, selectedSubProjectIds, selectedPhaseIds, date, rangeEnd);
  }, [selectedProjectIds, selectedSubProjectIds, selectedPhaseIds, rangeEnd, save]);

  const setRangeEnd = useCallback((date: string | null) => {
    setRangeEndState(date);
    save(selectedProjectIds, selectedSubProjectIds, selectedPhaseIds, rangeStart, date);
  }, [selectedProjectIds, selectedSubProjectIds, selectedPhaseIds, rangeStart, save]);

  return (
    <ScheduleFilterContext.Provider value={{
      selectedProjectIds, selectedSubProjectIds, selectedPhaseIds,
      rangeStart, rangeEnd,
      setSelectedProjects, setSelectedSubProjects, setSelectedPhases,
      setRangeStart, setRangeEnd,
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
