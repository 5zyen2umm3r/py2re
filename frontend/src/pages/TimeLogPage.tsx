/**
 * TimeLogPage
 * 列を時刻スロット・行を日付とするグリッドで TimeLog を可視化・編集するページ。
 */
import React, { useCallback, useMemo, useEffect } from 'react';
import {
  Box,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

import { useEntities } from '../context/EntityContext';
import { useSettings } from '../context/SettingsContext';
import { useTimeLogFilter, generateWeekDates } from '../context/TimeLogFilterContext';
import { useSession } from '../context/SessionContext';
import { FlowEntity } from '../api/entities';
import { FlexTable } from '../components/FlexTable/FlexTable';
import { BarDef, BarContextMenuDef, ColumnDef, RowDef, ContextMenuItem } from '../components/FlexTable/types';
import { TimeLogFilterBar } from '../components/TimeLogFilterBar/TimeLogFilterBar';

import {
  generateTimeColumns,
  isInHighlightZone,
  timeToBarPosition,
  barPositionToTime,
  snapToMinUnit,
  decreaseMinUnit,
  increaseMinUnit,
  resolveOverlaps,
  computeNewStartTime,
} from './timeLogUtils';

// ── ヘルパー ──────────────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTimeCol(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// ── メインコンポーネント ──────────────────────────────────────

export function TimeLogPage(): JSX.Element {
  // コンテキスト利用
  const { getList, patch, create, remove, load, getAll } = useEntities();
  const { settings } = useSettings();
  const { timeStart, timeEnd, minUnit, highlightZones } = settings.timeLog;
  const { weekStart, showWeekends, selectedUserId, setSelectedUserId } = useTimeLogFilter();
  const { user } = useSession();

  // マウント時: selectedUserId が null なら現在ユーザの id をセット
  useEffect(() => {
    if (selectedUserId === null && user?.id != null) {
      setSelectedUserId(user.id);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* マウント時に TimeLog をロード
  useEffect(() => {
    load('TimeLog');
  }, [load]);
  */
  // エンティティ取得
  const timeLogs = getList('TimeLog');
  const tasks = getList('Task');
  const assets = getList('Asset');
  const projects = getList('Project');

  // generateTimeColumns / generateWeekDates で列・行を生成
  const timeCols = useMemo(
    () => generateTimeColumns(timeStart, timeEnd, minUnit),
    [timeStart, timeEnd, minUnit],
  );

  const dateRows = useMemo(
    () => generateWeekDates(weekStart, showWeekends),
    [weekStart, showWeekends],
  );

  // Shift+ホイールで MinUnit を変更
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    // MinUnit の変更は SettingsContext 経由で行う必要があるが、
    // ホイール操作はローカルな一時変更として扱う（SettingsContext に updateTimeLogSettings がある）
  }, []);

  // TimeLog_Bar の BarDef
  const timeLogBarDef: BarDef = useMemo(() => ({
    entityType: 'TimeLog',
    filter: (tl, rowChain) => {
      const dateStr = formatDate(rowChain[0] as Date);
      return (tl['date'] as string) === dateStr &&
        (tl['user'] as any)?.id === selectedUserId;
    },
    position: (tl, _colChains) => {
      const sgStart = tl['sg_start_time'] as string;
      const duration = tl['duration'] as number;
      const start = timeToBarPosition(sgStart, timeCols, minUnit);
      const startDate = new Date(sgStart);
      const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
      const end = timeToBarPosition(endDate.toISOString(), timeCols, minUnit);
      return { start, end };
    },
    label: (tl) => {
      const taskRef = tl['entity'] as { type: string; id: number } | undefined;
      if (!taskRef) return '';
      const task = tasks.find((t) => t.id === taskRef.id);
      if (!task) return '';
      const assetRef = task['entity'] as { type: string; id: number } | undefined;
      if (!assetRef) return String(task['content'] ?? '');
      const asset = assets.find((a) => a.id === assetRef.id);
      if (!asset) return String(task['content'] ?? '');
      return `${String(asset['code'] ?? '')}\n${String(task['content'] ?? '')}`;
    },
    labelLines: 2,
    onDragStart: (tl, _rowChain, newPosition) => {
      const newTime = barPositionToTime(newPosition, timeCols, minUnit);
      const snappedMin = snapToMinUnit(newTime.getHours() * 60 + newTime.getMinutes(), minUnit);
      const snapped = new Date(newTime);
      snapped.setHours(Math.floor(snappedMin / 60), snappedMin % 60, 0, 0);
      patch('TimeLog', tl.id, { sg_start_time: snapped.toISOString() });
    },
    onDragEnd: (tl, _rowChain, newPosition) => {
      const newEndTime = barPositionToTime(newPosition, timeCols, minUnit).getTime() % (24*60*60*1000);
      const startTime = new Date(tl['sg_start_time'] as string).getTime() % (24*60*60*1000);
      let durationMin = Math.round((newEndTime - startTime) / 60000);
      durationMin = snapToMinUnit(durationMin, minUnit);
      if (durationMin < minUnit) durationMin = minUnit;
      patch('TimeLog', tl.id, { duration: durationMin });
    },
    onDragMove: (tl, rowChain, newStart, newEnd) => {
      const newStartTime = barPositionToTime(newStart, timeCols, minUnit);
      const newEndTime = barPositionToTime(newEnd, timeCols, minUnit);
      const snappedStartMin = snapToMinUnit(
        newStartTime.getHours() * 60 + newStartTime.getMinutes(), minUnit,
      );
      const snappedStart = new Date(newStartTime);
      snappedStart.setHours(Math.floor(snappedStartMin / 60), snappedStartMin % 60, 0, 0);
      let durationMin = Math.round((newEndTime.getTime() - snappedStart.getTime()) / 60000);
      durationMin = snapToMinUnit(durationMin, minUnit);
      if (durationMin < minUnit) durationMin = minUnit;
      patch('TimeLog', tl.id, {
        sg_start_time: snappedStart.toISOString(),
        duration: durationMin,
      });

      const dateStr = formatDate(rowChain[0] as Date);
      const sameDateUserLogs = timeLogs.filter(
        (l) => (l['date'] as string) === dateStr && (l['user'] as any)?.id === selectedUserId,
      );
      const overlapPatches = resolveOverlaps(
        sameDateUserLogs.map((l) => ({
          id: l.id,
          sg_start_time: l.id === tl.id ? snappedStart.toISOString() : (l['sg_start_time'] as string),
          duration: l.id === tl.id ? durationMin : (l['duration'] as number),
        })),
      );
      for (const p of overlapPatches) {
        if (p.id !== tl.id) {
          patch('TimeLog', p.id, { sg_start_time: p.sg_start_time, duration: p.duration });
        }
      }
    },
    contextMenu: {
      items: [
        {
          label: '削除',
          action: ({ entity }: { entity: FlowEntity; rowChain: unknown[] }) => {
            remove('TimeLog', entity.id);
          },
        },
      ],
    } satisfies BarContextMenuDef,
  }), [timeCols, minUnit, tasks, assets, timeLogs, selectedUserId, patch, remove]);

  // DateRow コンテキストメニュー: Project → Asset → Task 階層の subItems を構築
  const dateRowContextMenuItems: ContextMenuItem[] = useMemo(() => {
    if (selectedUserId === null) return [];

    const assignedTasks = tasks.filter((t) => {
      const assignees = t['task_assignees'] as Array<{ type: string; id: number }> | undefined;
      return Array.isArray(assignees) && assignees.some((a) => a.id === selectedUserId);
    });

    const projectMap = new Map<number, {
      project: FlowEntity;
      assetMap: Map<number, { asset: FlowEntity; tasks: FlowEntity[] }>;
    }>();

    for (const task of assignedTasks) {
      const assetRef = task['entity'] as { type: string; id: number } | undefined;
      if (!assetRef) continue;
      const asset = assets.find((a) => a.id === assetRef.id);
      if (!asset) continue;
      const projectRef = asset['project'] as { type: string; id: number } | undefined;
      if (!projectRef) continue;
      const project = projects.find((p) => p.id === projectRef.id);
      if (!project) continue;

      if (!projectMap.has(project.id as number)) {
        projectMap.set(project.id as number, { project, assetMap: new Map() });
      }
      const projEntry = projectMap.get(project.id as number)!;
      if (!projEntry.assetMap.has(asset.id as number)) {
        projEntry.assetMap.set(asset.id as number, { asset, tasks: [] });
      }
      projEntry.assetMap.get(asset.id as number)!.tasks.push(task);
    }

    const items: ContextMenuItem[] = [];
    for (const { project, assetMap } of projectMap.values()) {
      const assetItems: ContextMenuItem[] = [];
      for (const { asset, tasks: assetTasks } of assetMap.values()) {
        const taskItems: ContextMenuItem[] = assetTasks.map((task) => ({
          label: String(task['content'] ?? task.id),
          action: ({ rowChain }: { rowChain: unknown[]; colChain: unknown[]; entities: FlowEntity[] }) => {
            if (selectedUserId === null) return;
            const dateRow = rowChain[0] as Date;
            const dateStr = formatDate(dateRow);
            const existingLogs = timeLogs.filter(
              (l) => (l['date'] as string) === dateStr && (l['user'] as any)?.id === selectedUserId,
            );
            const sgStartTime = computeNewStartTime(
              existingLogs.map((l) => ({
                id: l.id,
                sg_start_time: l['sg_start_time'] as string,
                duration: l['duration'] as number,
              })),
              dateRow,
            );
            create('TimeLog', {
              type: 'TimeLog',
              entity: { type: 'Task', id: task.id },
              date: dateStr,
              user: { type: 'HumanUser', id: selectedUserId },
              duration: minUnit,
              sg_start_time: sgStartTime,
            });
          },
        }));
        assetItems.push({
          label: String(asset['code'] ?? asset.id),
          subItems: taskItems,
        });
      }
      items.push({
        label: String(project['name'] ?? project.id),
        subItems: assetItems,
      });
    }
    return items;
  }, [selectedUserId, tasks, assets, projects, timeLogs, minUnit, create]);

  // FlexTable の columns を構築
  const columns: ColumnDef[] = useMemo(() => [{
    value: () => timeCols,
    display: (d) => formatTimeCol(d as Date),
    highlight: (d) =>
      isInHighlightZone(d as Date, highlightZones)
        ? { backgroundColor: '#fff9c4' }
        : { backgroundColor: '#f5f5f5' },
  }], [timeCols, highlightZones]);

  // FlexTable の rows を構築
  const rows: RowDef[] = useMemo(() => [{
    value: () => dateRows,
    display: (d) => formatDate(d as Date),
    bar: timeLogBarDef,
    contextMenu: {
      items: dateRowContextMenuItems,
    },
  }], [dateRows, timeLogBarDef, dateRowContextMenuItems]);

  const entities = useMemo(() => getAll(), [getAll]);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box
        sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
        onWheel={handleWheel}
      >
        {/* TimeLogFilterBar */}
        <Box sx={{ px: 1, pt: 1 }}>
          <TimeLogFilterBar />
        </Box>

        {/* FlexTable */}
        <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <FlexTable
            columns={columns}
            rows={rows}
            entities={entities}
          />
        </Box>
      </Box>
    </LocalizationProvider>
  );
}
