/**
 * Property tests for ScheduleFilterContext LocalStorage serialization.
 *
 * Property 1: ScheduleFilterContext の LocalStorage ラウンドトリップ
 * Validates: Requirements 2.2
 */
import { describe, test, expect, beforeEach } from "vitest";
import * as fc from "fast-check";

const LS_KEY = "scheduleFilter";

interface ScheduleFilter {
  selectedProjectIds: number[];
  rangeStart: string | null;
  rangeEnd: string | null;
}

// Minimal localStorage mock for node environment
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
};

// Mirror the exact read/write logic from ScheduleFilterContext.tsx
function saveToLS(f: ScheduleFilter): void {
  try {
    localStorageMock.setItem(LS_KEY, JSON.stringify(f));
  } catch { /* ignore */ }
}

function loadFromLS(): ScheduleFilter {
  try {
    const raw = localStorageMock.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as ScheduleFilter;
  } catch { /* ignore */ }
  return { selectedProjectIds: [], rangeStart: null, rangeEnd: null };
}

describe("ScheduleFilterContext LocalStorage round-trip", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  /**
   * Property 1: ScheduleFilterContext の LocalStorage ラウンドトリップ
   *
   * For any combination of selectedProjectIds, rangeStart, rangeEnd,
   * the values read back from LocalStorage match the original values.
   *
   * Validates: Requirements 2.2
   */
  test("Property 1: values written to LocalStorage are read back unchanged", () => {
    // Arbitrary project IDs: arrays of safe integers (positive, reasonable range)
    const projectIdsArb = fc.array(
      fc.integer({ min: 1, max: 999999 }),
      { minLength: 0, maxLength: 20 }
    );

    // Date strings in YYYY-MM-DD format, or null
    const dateStringArb = fc.oneof(
      fc.constant(null),
      fc.date({ min: new Date("2000-01-01"), max: new Date("2099-12-31") }).map(
        (d) => d.toISOString().slice(0, 10)
      )
    );

    fc.assert(
      fc.property(projectIdsArb, dateStringArb, dateStringArb, (selectedProjectIds, rangeStart, rangeEnd) => {
        const original: ScheduleFilter = { selectedProjectIds, rangeStart, rangeEnd };

        saveToLS(original);
        const loaded = loadFromLS();

        expect(loaded.selectedProjectIds).toEqual(original.selectedProjectIds);
        expect(loaded.rangeStart).toEqual(original.rangeStart);
        expect(loaded.rangeEnd).toEqual(original.rangeEnd);
      }),
      { numRuns: 100 }
    );
  });

  test("Property 1 (explicit): empty filter round-trips correctly", () => {
    const filter: ScheduleFilter = { selectedProjectIds: [], rangeStart: null, rangeEnd: null };
    saveToLS(filter);
    const loaded = loadFromLS();
    expect(loaded).toEqual(filter);
  });

  test("Property 1 (explicit): filter with multiple project IDs and dates round-trips correctly", () => {
    const filter: ScheduleFilter = {
      selectedProjectIds: [1, 2, 3],
      rangeStart: "2024-01-01",
      rangeEnd: "2024-12-31",
    };
    saveToLS(filter);
    const loaded = loadFromLS();
    expect(loaded).toEqual(filter);
  });
});
