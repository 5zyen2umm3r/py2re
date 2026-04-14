/**
 * TimeLogPage
 * 列を時刻スロット・行を日付とするグリッドで TimeLog を可視化・編集するページ。
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Box, Select, MenuItem, Button, IconButton, TextField,
  FormControl, InputLabel, SelectChangeEvent,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';

import { useEntities } from '../context/EntityContext';
import { useScheduleFilter } from '../context/ScheduleFilterContext';
import { FlowEntity } from '../api/entities';
import { FlexTable } from '../components/FlexTable/FlexTable';
import { BarDef, BarContextMenuDef, ColumnDef, RowDef, ContextMenuItem } from '../components/FlexTable/types';

import {
  MinUnit,
  HighlightZone,
  generateTimeColumns,
  generateDateRows,
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

/** 今日を基準に ±days 日の日付文字列を返す */
function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

// ── メインコンポーネント ──────────────────────────────────────

export function TimeLogPage(): JSX.Element {
  // 5.1 状態定義
  const [timeStart, setTimeStart] = useState<string>('09:00');
  const [timeEnd, setTimeEnd] = useState<string>('18:00');
  const [minUnit, setMinUnit] = useState<MinUnit>(30);
  const [highlightZones, setHighlightZones] = useState<HighlightZone[]>([
    { start: '09:00', end: '12:00' },
    { start: '13:00', end: '18:00' },
  ]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  // コンテキスト利用
  const { getList, patch, create, remove, load } = useEntities();
  const { rangeStart, rangeEnd, setRangeStart, setRangeEnd } = useScheduleFilter();

  // 5.11 マウント時に TimeLog をロード
  useEffect(() => {
    load('TimeLog');
  }, [load]);

  // エンティティ取得
  const timeLogs = getList('TimeLog');
  const tasks = getList('Task');
  const assets = getList('Asset');
  const projects = getList('Project');
  const users = getList('HumanUser');

  // デフォルト範囲: 今日 ±7日
  const effectiveRangeStart = rangeStart ?? todayPlusDays(-7);
  const effectiveRangeEnd = rangeEnd ?? todayPlusDays(7);

  // 5.5 generateTimeColumns / generateDateRows で列・行を生成
  const timeCols = useMemo(
    () => generateTimeColumns(timeStart, timeEnd, minUnit),
    [timeStart, timeEnd, minUnit],
  );

  const dateRows = useMemo(
    () => generateDateRows(effectiveRangeStart, effectiveRangeEnd),
    [effectiveRangeStart, effectiveRangeEnd],
  );

  // 5.4 Shift+ホイールで MinUnit を変更
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    setMinUnit((prev) => e.deltaY < 0 ? decreaseMinUnit(prev) : increaseMinUnit(prev));
  }, []);

  // 5.7 TimeLog_Bar の BarDef
  const timeLogBarDef: BarDef = useMemo(() => ({
    entityType: 'TimeLog',
    // filter: 同じ日付かつ選択ユーザの TimeLog のみ表示
    filter: (tl, rowChain) => {
      const dateStr = formatDate(rowChain[0] as Date);
      return (tl['date'] as string) === dateStr &&
        (tl['user'] as any)?.id === selectedUserId;
    },
    // position: sg_start_time と duration から start/end BarPosition を計算
    position: (tl, _colChains) => {
      const sgStart = tl['sg_start_time'] as string;
      const duration = tl['duration'] as number;
      const start = timeToBarPosition(sgStart, timeCols, minUnit);
      const startDate = new Date(sgStart);
      const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
      const end = timeToBarPosition(endDate.toISOString(), timeCols, minUnit);
      return { start, end };
    },
    // label: "[Asset.code > Task.content]"
    label: (tl) => {
      const taskRef = tl['entity'] as { type: string; id: number } | undefined;
      if (!taskRef) return '';
      const task = tasks.find((t) => t.id === taskRef.id);
      if (!task) return '';
      const assetRef = task['entity'] as { type: string; id: number } | undefined;
      if (!assetRef) return String(task['content'] ?? '');
      const asset = assets.find((a) => a.id === assetRef.id);
      if (!asset) return String(task['content'] ?? '');
      return `[${String(asset['code'] ?? '')} > ${String(task['content'] ?? '')}]`;
    },
    // onDragStart: sg_start_time を MinUnit スナップして更新
    onDragStart: (tl, _rowChain, newPosition) => {
      const newTime = barPositionToTime(newPosition, timeCols, minUnit);
      const snappedMin = snapToMinUnit(newTime.getHours() * 60 + newTime.getMinutes(), minUnit);
      const snapped = new Date(newTime);
      snapped.setHours(Math.floor(snappedMin / 60), snappedMin % 60, 0, 0);
      patch('TimeLog', tl.id, { sg_start_time: snapped.toISOString() });
    },
    // onDragEnd: duration を MinUnit スナップして更新（最小 minUnit）
    onDragEnd: (tl, _rowChain, newPosition) => {
      const newEndTime = barPositionToTime(newPosition, timeCols, minUnit);
      const startTime = new Date(tl['sg_start_time'] as string);
      let durationMin = Math.round((newEndTime.getTime() - startTime.getTime()) / 60000);
      durationMin = snapToMinUnit(durationMin, minUnit);
      if (durationMin < minUnit) durationMin = minUnit;
      patch('TimeLog', tl.id, { duration: durationMin });
    },
    // onDragMove: sg_start_time と duration を両方更新
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

      // 5.8 ドラッグ完了後に resolveOverlaps を呼び出し、重複する TimeLog を一括 patch
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
    // contextMenu: 削除
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

  // 5.9 DateRow コンテキストメニュー: Project → Asset → Task 階層の subItems を構築
  const dateRowContextMenuItems: ContextMenuItem[] = useMemo(() => {
    if (selectedUserId === null) return [];

    // selectedUserId がアサインされた Task のみ
    const assignedTasks = tasks.filter((t) => {
      const assignees = t['task_assignees'] as Array<{ type: string; id: number }> | undefined;
      return Array.isArray(assignees) && assignees.some((a) => a.id === selectedUserId);
    });

    // Project → Asset → Task 階層を構築
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
        // 5.10 Task リーフ: 選択時に computeNewStartTime を使って TimeLog を create
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

  // 5.5 FlexTable の columns を構築
  const columns: ColumnDef[] = useMemo(() => [{
    value: () => timeCols,
    display: (d) => formatTimeCol(d as Date),
    // 5.6 highlight: isInHighlightZone で背景色を設定
    highlight: (d) =>
      isInHighlightZone(d as Date, highlightZones)
        ? { backgroundColor: '#fff9c4' }
        : { backgroundColor: '#f5f5f5' },
  }], [timeCols, highlightZones]);

  // 5.5 FlexTable の rows を構築（5.9 contextMenu 含む）
  const rows: RowDef[] = useMemo(() => [{
    value: () => dateRows,
    display: (d) => formatDate(d as Date),
    bar: timeLogBarDef,
    contextMenu: {
      items: dateRowContextMenuItems,
    },
  }], [dateRows, timeLogBarDef, dateRowContextMenuItems]);

  // entities オブジェクト（TimeLog を含む）
  const entities = useMemo(() => ({
    Task: tasks,
    Asset: assets,
    Project: projects,
    HumanUser: users,
    Phase: [],
    Step: [],
    Estimation: [],
    TimeLog: timeLogs,
  }), [tasks, assets, projects, users, timeLogs]);

  // 5.3 HighlightZone 設定 UI のハンドラ
  const handleAddHighlightZone = useCallback(() => {
    setHighlightZones((prev) => [...prev, { start: '09:00', end: '18:00' }]);
  }, []);

  const handleRemoveHighlightZone = useCallback((index: number) => {
    setHighlightZones((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleHighlightZoneChange = useCallback(
    (index: number, field: 'start' | 'end', value: string) => {
      setHighlightZones((prev) =>
        prev.map((z, i) => (i === index ? { ...z, [field]: value } : z)),
      );
    },
    [],
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box
        sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
        onWheel={handleWheel}
      >
        {/* 5.2 表外コントロールバー */}
        <Box sx={{ p: 1, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 対象期間 DatePicker × 2 */}
          <DatePicker
            label="対象期間 開始"
            value={rangeStart ? dayjs(rangeStart) : null}
            onChange={(val) => setRangeStart(val ? val.format('YYYY-MM-DD') : null)}
            slotProps={{ textField: { size: 'small' } }}
          />
          <DatePicker
            label="対象期間 終了"
            value={rangeEnd ? dayjs(rangeEnd) : null}
            onChange={(val) => setRangeEnd(val ? val.format('YYYY-MM-DD') : null)}
            slotProps={{ textField: { size: 'small' } }}
          />

          {/* 対象時間帯 TimePicker × 2 */}
          <TimePicker
            label="対象時間帯 開始"
            value={dayjs(`2000-01-01T${timeStart}:00`)}
            onChange={(val) => {
              if (val) setTimeStart(val.format('HH:mm'));
            }}
            slotProps={{ textField: { size: 'small' } }}
          />
          <TimePicker
            label="対象時間帯 終了"
            value={dayjs(`2000-01-01T${timeEnd}:00`)}
            onChange={(val) => {
              if (val) setTimeEnd(val.format('HH:mm'));
            }}
            slotProps={{ textField: { size: 'small' } }}
          />

          {/* MinUnit セレクタ */}
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>MinUnit</InputLabel>
            <Select
              label="MinUnit"
              value={minUnit}
              onChange={(e: SelectChangeEvent<number>) =>
                setMinUnit(Number(e.target.value) as MinUnit)
              }
            >
              {([5, 10, 15, 30, 60] as MinUnit[]).map((v) => (
                <MenuItem key={v} value={v}>{v}分</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* HumanUser セレクタ */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>ユーザ</InputLabel>
            <Select
              label="ユーザ"
              value={selectedUserId ?? ''}
              onChange={(e: SelectChangeEvent<number | ''>) => {
                const v = e.target.value;
                setSelectedUserId(v === '' ? null : Number(v));
              }}
            >
              <MenuItem value="">（未選択）</MenuItem>
              {users.map((u) => (
                <MenuItem key={u.id} value={u.id as number}>
                  {String(u['name'] ?? u.id)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* 5.3 HighlightZone 設定 UI */}
        <Box sx={{ px: 1, pb: 1, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box sx={{ fontSize: '0.85rem', color: 'text.secondary', mr: 1 }}>強調時間帯:</Box>
          {highlightZones.map((zone, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TextField
                size="small"
                label="開始"
                value={zone.start}
                onChange={(e) => handleHighlightZoneChange(i, 'start', e.target.value)}
                sx={{ width: 80 }}
                inputProps={{ pattern: '[0-9]{2}:[0-9]{2}' }}
              />
              <Box sx={{ fontSize: '0.8rem' }}>〜</Box>
              <TextField
                size="small"
                label="終了"
                value={zone.end}
                onChange={(e) => handleHighlightZoneChange(i, 'end', e.target.value)}
                sx={{ width: 80 }}
                inputProps={{ pattern: '[0-9]{2}:[0-9]{2}' }}
              />
              <IconButton size="small" onClick={() => handleRemoveHighlightZone(i)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAddHighlightZone}
            variant="outlined"
          >
            追加
          </Button>
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
