import React, { CSSProperties, useState, useCallback, useMemo } from 'react';
import { Box, Autocomplete, TextField } from '@mui/material';
import { useEntities } from '../context/EntityContext';
import { FlowEntity } from '../api/entities';
import { FlexTable } from '../components/FlexTable/FlexTable';
import { BarDef, BarPosition, ColumnDef, RowDef } from '../components/FlexTable/types';
import { DynamicForm } from '../components/DynamicForm/DynamicForm';
import {
  TimeGranularity,
  generateTimeCols,
  formatColHeader,
  dateToBarPosition,
  barPositionToDate,
  clampStartDate,
  clampDueDate,
} from './timeUtils';

// ── ヘルパー ──────────────────────────────────────────────────

function formatDateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── タスクスタイル ────────────────────────────────────────────

function getTaskStyle(task: FlowEntity): CSSProperties {
  const status = task['sg_status_list'] as string | undefined;
  const dueDate = task['due_date'] as string | null | undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (status === 'fin') {
    return { backgroundColor: '#9e9e9e' }; // グレー
  }
  if (dueDate) {
    const due = new Date(dueDate);
    if (due < today) {
      return { backgroundColor: '#f44336' }; // 赤（遅延）
    }
    const sevenDaysLater = new Date(today.getTime() + 7 * 86400000);
    if (due <= sevenDaysLater) {
      return { backgroundColor: '#ff9800' }; // オレンジ（期限間近）
    }
  }
  return { backgroundColor: '#1976d2' }; // 青（通常）
}

// ── メインコンポーネント ──────────────────────────────────────

export function TaskSchedule() {
  const { getList, patch, create } = useEntities();

  const [granularity, setGranularity] = useState<TimeGranularity>('week');
  const [selectedProjects, setSelectedProjects] = useState<FlowEntity[]>([]);
  const [formAsset, setFormAsset] = useState<FlowEntity | null>(null);

  const tasks = getList('Task');
  const assets = getList('Asset');
  const projects = getList('Project');

  // プロジェクトフィルタ
  const filteredAssets = selectedProjects.length === 0
    ? assets
    : assets.filter(a => selectedProjects.some(p => (a['project'] as any)?.id === p.id));

  // 時系列列配列
  const timeCols = useMemo(
    () => generateTimeCols(tasks, granularity),
    [tasks, granularity],
  );

  // ホイールで粒度切り替え
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setGranularity((prev) => {
      if (e.deltaY < 0) {
        // 上スクロール: month → week → day
        if (prev === 'month') return 'week';
        if (prev === 'week') return 'day';
        return prev;
      } else {
        // 下スクロール: day → week → month
        if (prev === 'day') return 'week';
        if (prev === 'week') return 'month';
        return prev;
      }
    });
  }, []);

  // BarDef
  const barDef: BarDef = useMemo(() => ({
    entityType: 'Task',
    filter: (task, rowChain) =>
      (task['sg_asset'] as any)?.id === (rowChain[0] as FlowEntity)?.id,
    position: (task, _colChains) => {
      const startStr = task['start_date'] as string | null | undefined;
      const dueStr = task['due_date'] as string | null | undefined;
      const invalid = { start: { colIndex: -1, offset: 0 }, end: { colIndex: -1, offset: 0 } };
      if (!startStr || !dueStr) return invalid;
      const startDate = new Date(startStr);
      const dueDate = new Date(dueStr);
      if (isNaN(startDate.getTime()) || isNaN(dueDate.getTime())) return invalid;
      const start = dateToBarPosition(startDate, timeCols, granularity);
      const end = dateToBarPosition(dueDate, timeCols, granularity);
      return { start, end };
    },
    label: (task) => String(task['content'] ?? ''),
    style: (task) => getTaskStyle(task),
    onDragStart: (task, _rowChain, newPosition) => {
      const newDate = barPositionToDate(newPosition, timeCols, granularity);
      const newStartStr = formatDateToISO(newDate);
      const dueStr = (task['due_date'] as string) ?? newStartStr;
      const clamped = clampStartDate(newStartStr, dueStr);
      patch('Task', task.id, { start_date: clamped });
    },
    onDragEnd: (task, _rowChain, newPosition) => {
      const newDate = barPositionToDate(newPosition, timeCols, granularity);
      const newDueStr = formatDateToISO(newDate);
      const startStr = (task['start_date'] as string) ?? newDueStr;
      const clamped = clampDueDate(startStr, newDueStr);
      patch('Task', task.id, { due_date: clamped });
    },
    onDragMove: (task, _rowChain, newStart, newEnd) => {
      const startDate = barPositionToDate(newStart, timeCols, granularity);
      const dueDate = barPositionToDate(newEnd, timeCols, granularity);
      const start_date = formatDateToISO(startDate);
      const due_date = formatDateToISO(dueDate);
      patch('Task', task.id, { start_date, due_date });
    },
  }), [timeCols, granularity, patch]);

  // RowDef
  const assetRowDef: RowDef = useMemo(() => ({
    entityType: 'Asset',
    value: (asset) => [asset],
    display: (asset) => String((asset as FlowEntity)?.['code'] ?? ''),
    bar: barDef,
    contextMenu: {
      items: [{
        label: 'タスクを追加',
        action: ({ rowChain }) => setFormAsset(rowChain[0] as FlowEntity),
      }],
    },
  }), [barDef]);

  // ColumnDef（時系列列）
  const columns: ColumnDef[] = useMemo(() => [{
    value: () => timeCols,
    display: (d) => formatColHeader(d as Date, granularity),
  }], [timeCols, granularity]);

  // entities
  const entities = useMemo(() => ({
    Task: tasks,
    Asset: filteredAssets,
    Project: projects,
    HumanUser: [],
    Phase: [],
    Step: [],
    Estimation: [],
  }), [tasks, filteredAssets, projects]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* プロジェクト選択欄 */}
      <Box sx={{ p: 1 }}>
        <Autocomplete
          multiple
          options={projects}
          getOptionLabel={(p) => String(p['name'] ?? p.id)}
          value={selectedProjects}
          onChange={(_e, val) => setSelectedProjects(val)}
          renderInput={(params) => (
            <TextField {...params} label="プロジェクト" size="small" />
          )}
          sx={{ maxWidth: 600 }}
        />
      </Box>

      {/* ガントテーブル */}
      <Box sx={{ flex: 1, overflow: 'auto' }} onWheel={handleWheel}>
        <FlexTable
          columns={columns}
          rows={[assetRowDef]}
          entities={entities}
        />
      </Box>

      {/* タスク追加フォーム */}
      <DynamicForm
        title="タスクを追加"
        open={formAsset !== null}
        onClose={() => setFormAsset(null)}
        fields={[
          { name: 'content', label: 'タスク名', type: 'text', required: true },
          { name: 'start_date', label: '開始日', type: 'date', required: true },
          { name: 'due_date', label: '期限日', type: 'date', required: true },
        ]}
        onSubmit={(values) => {
          if (!formAsset) return;
          create('Task', {
            sg_asset: { type: 'Asset', id: formAsset.id },
            content: values['content'],
            start_date: values['start_date'],
            due_date: values['due_date'],
          });
          setFormAsset(null);
        }}
      />
    </Box>
  );
}
