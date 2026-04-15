import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  generateTimeColumns,
  generateDateRows,
  snapToMinUnit,
  decreaseMinUnit,
  increaseMinUnit,
  isInHighlightZone,
  timeToBarPosition,
  barPositionToTime,
  resolveOverlaps,
  computeNewStartTime,
  type MinUnit,
  type HighlightZone,
  type TimeLogEntry,
} from "./timeLogUtils";

// MinUnit values
const MIN_UNITS: MinUnit[] = [5, 10, 15, 30, 60];

// Arbitrary for MinUnit
const arbMinUnit = fc.constantFrom(...MIN_UNITS);

// Arbitrary for "HH:MM" string given hours and minutes
function toHHMM(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// -----------------------------------------------------------------------
// Property 1: generateTimeColumns returns floor((H_end - H_start) / M) columns
// Feature: timelog-page, Property 1: generateTimeColumns returns floor((H_end - H_start) / M) columns
// Validates: Requirements 6.1, 6.3
// -----------------------------------------------------------------------
describe("Feature: timelog-page, Property 1: generateTimeColumns returns floor((H_end - H_start) / M) columns", () => {
  it("returns exactly floor((endMin - startMin) / M) columns for any valid range and MinUnit", () => {
    fc.assert(
      fc.property(
        // Generate start hour 0-22, end hour start+1 to 23
        fc.integer({ min: 0, max: 22 }).chain((startH) =>
          fc.integer({ min: startH + 1, max: 23 }).map((endH) => ({ startH, endH }))
        ),
        arbMinUnit,
        ({ startH, endH }, minUnit) => {
          const timeStart = toHHMM(startH, 0);
          const timeEnd = toHHMM(endH, 0);
          const cols = generateTimeColumns(timeStart, timeEnd, minUnit);
          const startMin = startH * 60;
          const endMin = endH * 60;
          const expected = Math.floor((endMin - startMin) / minUnit);
          expect(cols.length).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -----------------------------------------------------------------------
// Property 2: generateDateRows returns (end - start + 1) rows
// Feature: timelog-page, Property 2: generateDateRows returns (end - start + 1) rows
// Validates: Requirements 7.1, 7.3
// -----------------------------------------------------------------------
describe("Feature: timelog-page, Property 2: generateDateRows returns (end - start + 1) rows", () => {
  it("returns exactly (rangeEnd - rangeStart).days + 1 rows for any valid date range", () => {
    // Generate a start date offset (days from 2020-01-01) and a range length 0-30
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 365 }),
        fc.integer({ min: 0, max: 30 }),
        (startOffset, rangeLen) => {
          const base = new Date(2020, 0, 1);
          const startDate = new Date(base);
          startDate.setDate(base.getDate() + startOffset);
          const endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + rangeLen);

          const fmt = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

          const rows = generateDateRows(fmt(startDate), fmt(endDate));
          expect(rows.length).toBe(rangeLen + 1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -----------------------------------------------------------------------
// Property 3: snapToMinUnit result is a multiple of M nearest to input
// Feature: timelog-page, Property 3: snapToMinUnit result is a multiple of M nearest to input
// Validates: Requirements 9.1, 9.2, 9.3
// -----------------------------------------------------------------------
describe("Feature: timelog-page, Property 3: snapToMinUnit result is a multiple of M nearest to input", () => {
  it("result is always a multiple of M", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 2000 }),
        arbMinUnit,
        (minutes, minUnit) => {
          const result = snapToMinUnit(minutes, minUnit);
          // Use Math.abs to handle -0 === 0 case in JavaScript
          expect(Math.abs(result % minUnit)).toBe(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("result is the nearest multiple of M to the input", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 2000 }),
        arbMinUnit,
        (minutes, minUnit) => {
          const result = snapToMinUnit(minutes, minUnit);
          // No other multiple of M is closer
          const distResult = Math.abs(result - minutes);
          const lower = result - minUnit;
          const upper = result + minUnit;
          expect(distResult).toBeLessThanOrEqual(Math.abs(lower - minutes));
          expect(distResult).toBeLessThanOrEqual(Math.abs(upper - minutes));
        }
      ),
      { numRuns: 200 }
    );
  });
});

// -----------------------------------------------------------------------
// Property 4: decreaseMinUnit never goes below 5, increaseMinUnit never exceeds 60
// Feature: timelog-page, Property 4: decreaseMinUnit never goes below 5, increaseMinUnit never exceeds 60
// Validates: Requirements 3.5, 3.6, 3.7, 3.8
// -----------------------------------------------------------------------
describe("Feature: timelog-page, Property 4: decreaseMinUnit never goes below 5, increaseMinUnit never exceeds 60", () => {
  it("repeated decreaseMinUnit never produces a value below 5", () => {
    fc.assert(
      fc.property(
        arbMinUnit,
        fc.integer({ min: 1, max: 20 }),
        (initial, steps) => {
          let current = initial;
          for (let i = 0; i < steps; i++) {
            current = decreaseMinUnit(current);
            expect(current).toBeGreaterThanOrEqual(5);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("repeated increaseMinUnit never produces a value above 60", () => {
    fc.assert(
      fc.property(
        arbMinUnit,
        fc.integer({ min: 1, max: 20 }),
        (initial, steps) => {
          let current = initial;
          for (let i = 0; i < steps; i++) {
            current = increaseMinUnit(current);
            expect(current).toBeLessThanOrEqual(60);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -----------------------------------------------------------------------
// Property 5: isInHighlightZone returns true iff time falls within any zone
// Feature: timelog-page, Property 5: isInHighlightZone returns true iff time falls within any zone
// Validates: Requirements 4.4, 4.5
// -----------------------------------------------------------------------
describe("Feature: timelog-page, Property 5: isInHighlightZone returns true iff time falls within any zone", () => {
  // Arbitrary for a HighlightZone: start < end, both in [0, 23*60+59]
  const arbHighlightZone: fc.Arbitrary<HighlightZone> = fc
    .integer({ min: 0, max: 23 * 60 + 58 })
    .chain((startMin) =>
      fc.integer({ min: startMin + 1, max: 23 * 60 + 59 }).map((endMin) => ({
        start: toHHMM(Math.floor(startMin / 60), startMin % 60),
        end: toHHMM(Math.floor(endMin / 60), endMin % 60),
      }))
    );

  it("returns true iff the time falls within [start, end) of any zone", () => {
    fc.assert(
      fc.property(
        // time-of-day in minutes 0-1439
        fc.integer({ min: 0, max: 1439 }),
        fc.array(arbHighlightZone, { minLength: 0, maxLength: 5 }),
        (timeMin, zones) => {
          const base = new Date(2000, 0, 1);
          base.setHours(Math.floor(timeMin / 60), timeMin % 60, 0, 0);

          const result = isInHighlightZone(base, zones);

          // Manual reference implementation
          const expected = zones.some((zone) => {
            const [sh, sm] = zone.start.split(":").map(Number);
            const [eh, em] = zone.end.split(":").map(Number);
            const zoneStart = sh * 60 + sm;
            const zoneEnd = eh * 60 + em;
            return timeMin >= zoneStart && timeMin < zoneEnd;
          });

          expect(result).toBe(expected);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// -----------------------------------------------------------------------
// Property 7: timeToBarPosition then barPositionToTime round-trips to original time
// Feature: timelog-page, Property 7: timeToBarPosition then barPositionToTime round-trips to original time
// Validates: Requirements 8.2, 8.3, 9.1, 9.2
// -----------------------------------------------------------------------
describe("Feature: timelog-page, Property 7: timeToBarPosition then barPositionToTime round-trips to original time", () => {
  it("round-trips for any valid time that is a multiple of MinUnit within the column range", () => {
    fc.assert(
      fc.property(
        // start hour 0-20, end hour start+1 to 23
        fc.integer({ min: 0, max: 20 }).chain((startH) =>
          fc.integer({ min: startH + 1, max: 23 }).map((endH) => ({ startH, endH }))
        ),
        arbMinUnit,
        ({ startH, endH }, minUnit) => {
          const timeStart = toHHMM(startH, 0);
          const timeEnd = toHHMM(endH, 0);
          const timeCols = generateTimeColumns(timeStart, timeEnd, minUnit);
          if (timeCols.length === 0) return;

          // Pick a valid time: a multiple of minUnit within [startH*60, endH*60)
          const startMin = startH * 60;
          const endMin = endH * 60;
          const numSlots = Math.floor((endMin - startMin) / minUnit);
          // Use a fixed slot index to keep it deterministic within this property
          // We'll test the first, middle, and last slot
          for (const slotIdx of [0, Math.floor(numSlots / 2), numSlots - 1]) {
            const tMin = startMin + slotIdx * minUnit;
            const h = Math.floor(tMin / 60);
            const m = tMin % 60;
            // Build ISO datetime on 2000-01-01
            const iso = `2000-01-01T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;

            const pos = timeToBarPosition(iso, timeCols, minUnit);
            const roundTripped = barPositionToTime(pos, timeCols, minUnit);

            expect(roundTripped.getHours()).toBe(h);
            expect(roundTripped.getMinutes()).toBe(m);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -----------------------------------------------------------------------
// Property 8: after resolveOverlaps, no two TimeLogs overlap
// Feature: timelog-page, Property 8: after resolveOverlaps, no two TimeLogs overlap
// Validates: Requirements 10.1, 10.2
// -----------------------------------------------------------------------
describe("Feature: timelog-page, Property 8: after resolveOverlaps, no two TimeLogs overlap", () => {
  // Arbitrary for a TimeLogEntry with ISO datetime on 2000-01-01
  const arbTimeLogEntry = (id: number): fc.Arbitrary<TimeLogEntry> => fc.record({
    id: fc.constant(id),
    // sg_start_time: random minute offset 0-1380 on 2000-01-01
    sg_start_time: fc.integer({ min: 0, max: 1380 }).map((m) => {
      const h = Math.floor(m / 60);
      const min = m % 60;
      return `2000-01-01T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00.000Z`;
    }),
    duration: fc.integer({ min: 1, max: 120 }),
  });

  // Generate an array of entries with unique IDs
  const arbTimeLogEntries: fc.Arbitrary<TimeLogEntry[]> = fc.integer({ min: 0, max: 10 }).chain((len) => {
    if (len === 0) return fc.constant([]);
    return fc.tuple(...Array.from({ length: len }, (_, i) => arbTimeLogEntry(i + 1)));
  });

  it("no two entries overlap after resolveOverlaps is applied", () => {
    fc.assert(
      fc.property(
        arbTimeLogEntries,
        (entries) => {
          const patches = resolveOverlaps(entries);

          // Build the resolved list by applying patches
          const patchMap = new Map(patches.map((p) => [p.id, p]));
          const resolved = entries.map((e) => {
            const patch = patchMap.get(e.id);
            return patch
              ? { ...e, sg_start_time: patch.sg_start_time, duration: patch.duration }
              : e;
          });

          // Sort by start time
          const sorted = [...resolved].sort(
            (a, b) => new Date(a.sg_start_time).getTime() - new Date(b.sg_start_time).getTime()
          );

          // Check no two consecutive entries overlap
          for (let i = 0; i < sorted.length - 1; i++) {
            const endA = new Date(sorted[i].sg_start_time).getTime() + sorted[i].duration * 60 * 1000;
            const startB = new Date(sorted[i + 1].sg_start_time).getTime();
            expect(endA).toBeLessThanOrEqual(startB);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

// -----------------------------------------------------------------------
// Property 9: computeNewStartTime returns 09:00 for empty list, max end time otherwise
// Feature: timelog-page, Property 9: computeNewStartTime returns 09:00 for empty list, max end time otherwise
// Validates: Requirements 14.2, 14.3
// -----------------------------------------------------------------------
describe("Feature: timelog-page, Property 9: computeNewStartTime returns 09:00 for empty list, max end time otherwise", () => {
  const arbTimeLogEntry: fc.Arbitrary<TimeLogEntry> = fc.record({
    id: fc.integer({ min: 1, max: 9999 }),
    sg_start_time: fc.integer({ min: 0, max: 1380 }).map((m) => {
      const h = Math.floor(m / 60);
      const min = m % 60;
      return `2000-01-01T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00.000Z`;
    }),
    duration: fc.integer({ min: 1, max: 120 }),
  });

  const baseDate = new Date(2024, 0, 15); // 2024-01-15

  it("returns 09:00 on baseDate when the list is empty", () => {
    fc.assert(
      fc.property(fc.constant([] as TimeLogEntry[]), (_entries: TimeLogEntry[]) => {
        const result = computeNewStartTime([], baseDate);
        const d = new Date(result);
        expect(d.getHours()).toBe(9);
        expect(d.getMinutes()).toBe(0);
      }),
      { numRuns: 1 }
    );
  });

  it("returns the maximum end time (sg_start_time + duration) for non-empty lists", () => {
    fc.assert(
      fc.property(
        fc.array(arbTimeLogEntry, { minLength: 1, maxLength: 10 }),
        (entries) => {
          const result = computeNewStartTime(entries, baseDate);
          const resultTime = new Date(result).getTime();

          // Compute expected max end time
          let maxEnd = 0;
          for (const e of entries) {
            const end = new Date(e.sg_start_time).getTime() + e.duration * 60 * 1000;
            if (end > maxEnd) maxEnd = end;
          }

          expect(resultTime).toBe(maxEnd);
        }
      ),
      { numRuns: 200 }
    );
  });
});
