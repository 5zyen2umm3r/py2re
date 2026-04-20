import React, { createContext, useContext, useState } from "react";

// Types

export type MinUnit = 5 | 10 | 15 | 30 | 60;

export interface HighlightZone {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface TimeLogSettings {
  timeStart: string;          // "HH:MM"
  timeEnd: string;            // "HH:MM"
  minUnit: MinUnit;
  highlightZones: HighlightZone[];
}

export interface AppSettings {
  timeLog: TimeLogSettings;
}

interface SettingsContextValue {
  settings: AppSettings;
  updateTimeLogSettings: (patch: Partial<TimeLogSettings>) => void;
  exportSettings: () => string;
  importSettings: (json: string) => void;
  clearAllSettings: () => void;
}

// Constants

const STORAGE_KEY = "appSettings";

const DEFAULT_SETTINGS: AppSettings = {
  timeLog: {
    timeStart: "09:00",
    timeEnd: "18:00",
    minUnit: 30,
    highlightZones: [
      { start: "09:00", end: "12:00" },
      { start: "13:00", end: "18:00" },
    ],
  },
};

// Validation

export function validateSettings(json: unknown): AppSettings {
  if (typeof json !== "object" || json === null) {
    throw new Error("Invalid settings: must be an object");
  }
  const s = json as Record<string, unknown>;

  if (!s.timeLog || typeof s.timeLog !== "object" || s.timeLog === null) {
    throw new Error("Invalid settings: missing or invalid 'timeLog'");
  }
  const tl = s.timeLog as Record<string, unknown>;

  if (typeof tl.timeStart !== "string") {
    throw new Error("Invalid settings: 'timeLog.timeStart' must be a string");
  }
  if (typeof tl.timeEnd !== "string") {
    throw new Error("Invalid settings: 'timeLog.timeEnd' must be a string");
  }

  const validMinUnits: MinUnit[] = [5, 10, 15, 30, 60];
  if (!validMinUnits.includes(tl.minUnit as MinUnit)) {
    throw new Error(
      `Invalid settings: 'timeLog.minUnit' must be one of ${validMinUnits.join(", ")}`
    );
  }

  if (!Array.isArray(tl.highlightZones)) {
    throw new Error("Invalid settings: 'timeLog.highlightZones' must be an array");
  }
  for (let i = 0; i < tl.highlightZones.length; i++) {
    const zone = tl.highlightZones[i];
    if (typeof zone !== "object" || zone === null) {
      throw new Error(`Invalid settings: 'timeLog.highlightZones[${i}]' must be an object`);
    }
    const z = zone as Record<string, unknown>;
    if (typeof z.start !== "string") {
      throw new Error(`Invalid settings: 'timeLog.highlightZones[${i}].start' must be a string`);
    }
    if (typeof z.end !== "string") {
      throw new Error(`Invalid settings: 'timeLog.highlightZones[${i}].end' must be a string`);
    }
  }

  return json as AppSettings;
}

// LocalStorage helpers

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return validateSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// Context

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  function updateTimeLogSettings(patch: Partial<TimeLogSettings>): void {
    setSettings((prev) => {
      const next: AppSettings = {
        ...prev,
        timeLog: { ...prev.timeLog, ...patch },
      };
      saveSettings(next);
      return next;
    });
  }

  function exportSettings(): string {
    return JSON.stringify(settings);
  }

  function importSettings(json: string): void {
    const parsed = JSON.parse(json);
    const validated = validateSettings(parsed);
    setSettings(validated);
    saveSettings(validated);
  }

  function clearAllSettings(): void {
    // appSettings
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    // scheduleFilter
    try { localStorage.removeItem('scheduleFilter'); } catch { /* ignore */ }
    // granularity
    try { localStorage.removeItem('granularity_schedule'); } catch { /* ignore */ }
    try { localStorage.removeItem('granularity_gantt'); } catch { /* ignore */ }
    setSettings(DEFAULT_SETTINGS);
  }

  return (
    <SettingsContext.Provider
      value={{ settings, updateTimeLogSettings, exportSettings, importSettings, clearAllSettings }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return ctx;
}
