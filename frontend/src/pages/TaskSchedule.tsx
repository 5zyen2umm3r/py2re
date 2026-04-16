import React, { CSSProperties, useState, useCallback, useMemo } from 'react';
import { Box } from '@mui/material';
import { useEntities } from '../context/EntityContext';
import { useScheduleFilter } from '../context/ScheduleFilterContext';
import { FlowEntity } from '../api/entities';
import { ScheduleFilterBar } from '../components/ScheduleFilterBar/ScheduleFilterBar';
import { FlexTable } from '../components/FlexTable/FlexTable';
import { BarDef, BarContextMenuDef, ColumnDef, RowDef } from '../components/FlexTable/types';
import { DynamicForm } from '../components/DynamicForm/DynamicForm';
import { useDynamicForm } from '../components/DynamicForm/useDynamicForm';
import { buildAssetFilter } from '../utils/assetFilter';
import {
  TimeGranularity,
  generateTimeCols,
  formatColHeader,
  dateToBarPosition,
  barPositionToDate,
  clampStartDate,
  clampDueDate,
  parseDateLocal,
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
    return { backgroundColor: '#9e9e9e' };
  }
  if (dueDate) {
    const due = new Date(dueDate);
    if (due < today) {
      return { backgroundColor: '#f44336' };
    }
    const sevenDaysLater = new Date(today.getTime() + 7 * 86400000);
    if (due <= sevenDaysLater) {
      return { backgroundColor: '#ff9800' };
    }
  }
  return { backgroundColor: '#1976d2' };
}

// ── メインコンポーネント ──────────────────────────────────────

export function TaskSchedule() {
  const { getList, patch, create, remove, getAll } = useEntities();
  const { selectedProjectIds, selectedSubProjectIds, selectedPhaseIds, rangeStart, rangeEnd } = useScheduleFilter();

  const [granularity, setGranularity] = useState<TimeGranularity>('week');
  const { formProps, openForm } = useDynamicForm();

  const tasks = getList('Task');
  const allPhases = getList('Phase');

  const assetFilter = useMemo(
    () => buildAssetFilter(selectedProjectIds, selectedSubProjectIds, selectedPhaseIds, allPhases),
    [selectedProjectIds, selectedSubProjectIds, selectedPhaseIds, allPhases],
  );

  // 時系列列配列（対象期間を反映）
  const timeCols = useMemo(
    () => generateTimeCols(tasks, granularity, rangeStart, rangeEnd),
    [tasks, granularity, rangeStart, rangeEnd],
  );

  // Shift+ホイールで粒度切り替え
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    setGranularity((prev) => {
      if (e.deltaY < 0) {
        if (prev === 'month') return 'week';
        if (prev === 'week') return 'day';
        return prev;
      } else {
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
      (task['entity'] as any)?.id === (rowChain[0] as FlowEntity)?.id,
    position: (task, _colChains) => {
      const startStr = task['start_date'] as string | null | undefined;
      const dueStr = task['due_date'] as string | null | undefined;
      const invalid = { start: { colIndex: -1, offset: 0 }, end: { colIndex: -1, offset: 0 } };
      if (!startStr || !dueStr) return invalid;
      const startDate = parseDateLocal(startStr);
      const dueDate = parseDateLocal(dueStr);
      if (isNaN(startDate.getTime()) || isNaN(dueDate.getTime())) return invalid;
      const start = dateToBarPosition(startDate, timeCols, granularity);
      const end = dateToBarPosition(dueDate, timeCols, granularity);
      return { start, end };
    },
    label: (task) => String(task['content'] ?? ''),
    labelStart: (task) => {
      const s = task['start_date'] as string | null | undefined;
      if (!s) return null;
      const d = parseDateLocal(s);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    },
    labelEnd: (task) => {
      const s = task['due_date'] as string | null | undefined;
      if (!s) return null;
      const d = parseDateLocal(s);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    },
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
    contextMenu: {
      items: [
        {
          label: 'タスクを編集',
          action: ({ entity }: { entity: FlowEntity; rowChain: unknown[] }) => {
            openForm({
              title: 'タスクを編集',
              fields: [
                { name: 'content', label: 'タスク名', type: 'text' as const, required: true },
                { name: 'start_date', label: '開始日', type: 'date' as const, required: true },
                { name: 'due_date', label: '期限日', type: 'date' as const, required: true },
                { name: 'sg_user', label: '担当ユーザ', type: 'entity' as const, entityType: 'HumanUser' as const, labelField: 'name', required: false },
              ],
              defaultValues: {
                content: entity['content'],
                start_date: entity['start_date'],
                due_date: entity['due_date'],
                sg_user: (entity['sg_user'] as any)?.id ?? null,
              },
              onSubmit: (values) => {
                patch('Task', entity.id, values);
              },
            });
          },
        },
        {
          label: 'タスクを削除',
          action: ({ entity }: { entity: FlowEntity; rowChain: unknown[] }) => {
            if (entity?.id && window.confirm(`タスク「${String(entity['content'] ?? entity.id)}」を削除しますか？`)) {
              remove('Task', entity.id);
            }
          },
        },
      ],
    } satisfies BarContextMenuDef,
  }), [timeCols, granularity, patch, remove, openForm]);

  // RowDef
  const assetRowDef: RowDef = useMemo(() => ({
    entityType: 'Asset',
    filter: assetFilter,
    value: (asset) => [asset],
    display: (asset) => String((asset as FlowEntity)?.['code'] ?? ''),
    bar: barDef,
    contextMenu: {
      items: [
        {
          label: 'タスクを追加',
          action: ({ rowChain }) => {
            const asset = rowChain[0] as FlowEntity;
            const projectId = (asset.project as FlowEntity)?.id;
            openForm({
              title: 'タスクを追加',
              fields: [
                { name: 'project', label: 'プロジェクト', type: 'entity' as const, entityType: 'Project' as const, labelField: 'name', readonly: true },
                { name: 'entity', label: 'アセット', type: 'entity' as const, entityType: 'Asset' as const, labelField: 'code', readonly: true },
                { name: 'content', label: 'タスク名', type: 'text' as const, required: true },
                { name: 'start_date', label: '開始日', type: 'date' as const, required: true },
                { name: 'due_date', label: '期限日', type: 'date' as const, required: true },
                { name: 'sg_user', label: '担当ユーザ', type: 'entity' as const, entityType: 'HumanUser' as const, labelField: 'name', required: false, filter: (user) => (user.projects as FlowEntity[])?.some((p) => p.id === projectId)},
              ],
              defaultValues: { project: projectId , entity: asset?.id },
              onSubmit: (values) => {
                create('Task', values);
              },
            });
          },
        },
        {
          label: 'アセットを追加',
          action: ({ rowChain }) => {
            const asset = rowChain[0] as FlowEntity | null;
            const projectId = (asset?.['project'] as any)?.id ?? null;
            openForm({
              title: 'アセットを追加',
              fields: [
                { name: 'code', label: 'アセットコード', type: 'text' as const, required: true },
                { name: 'project', label: 'プロジェクト', type: 'entity' as const, entityType: 'Project' as const, labelField: 'name', required: true },
              ],
              defaultValues: { project: projectId ?? undefined },
              onSubmit: (values) => {
                create('Asset', values);
              },
            });
          },
        },
        {
          label: 'アセットを削除',
          action: ({ rowChain }) => {
            const asset = rowChain[0] as FlowEntity | null;
            if (!asset?.id) return;
            if (window.confirm(`アセット「${String(asset['code'] ?? asset.id)}」を削除しますか？`)) {
              remove('Asset', asset.id);
            }
          },
        },
      ],
    },
  }), [barDef, create, remove, openForm, assetFilter]);

  // ColumnDef（時系列列）
  const columns: ColumnDef[] = useMemo(() => [{
    value: () => timeCols,
    display: (d) => formatColHeader(d as Date, granularity),
  }], [timeCols, granularity]);

  // entities
  const entities = useMemo(() => getAll(), [getAll]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* フィルタバー */}
      <ScheduleFilterBar />

      {/* ガントテーブル（Ctrl+ホイールで粒度切り替え） */}
      <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }} onWheel={handleWheel}>
        <FlexTable
          columns={columns}
          rows={[assetRowDef]}
          entities={entities}
          stickyRowHeader
        />
      </Box>

      <DynamicForm {...formProps} />
    </Box>
  );
}
