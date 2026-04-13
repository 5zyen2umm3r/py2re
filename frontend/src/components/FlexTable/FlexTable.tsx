/**
 * FlexTable: 行・列ともに再帰的な副軸を持つ汎用集計表
 *
 * 行展開モデル:
 *   - RowDef ごとに「親行」を1行表示し、sub が定義されていれば子行を展開/折りたたみできる
 *   - sub も同様に再帰的に展開/折りたたみ可能
 *   - 各行の開閉状態は rowKey（階層パスの文字列）で管理する
 */
import React, { useState, useCallback, useMemo, useRef, CSSProperties } from "react";
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Menu, MenuItem, IconButton, Box,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { FlexTableProps, RowDef, ColumnDef, SubAxis, CellDef, ContextMenuDef, ContextMenuItem, BarDef, BarPosition } from "./types";
import { FlowEntity, EntityType } from "../../api/entities";
import { CellEditor } from "./CellEditor";
import { pointerToBarPosition, barToLeftPercent, barToRightPercent } from "./barUtils";

// ---- DragHandle ----

type HandleType = 'start' | 'end' | 'move';

interface DragHandleProps {
  type: HandleType;
  entity: FlowEntity;
  barDef: BarDef;
  rowChain: unknown[];
  colChains: unknown[][];
  totalColumns: number;
  currentStart: BarPosition;
  currentEnd: BarPosition;
  containerRef: React.RefObject<HTMLElement>;
  onPreviewChange: (start: BarPosition, end: BarPosition) => void;
  onDragComplete: (start: BarPosition, end: BarPosition) => void;
}

function DragHandle({
  type, entity, barDef, rowChain, colChains, totalColumns,
  currentStart, currentEnd, containerRef,
  onPreviewChange, onDragComplete,
}: DragHandleProps) {
  const dragStartX = useRef<number | null>(null);
  const dragStartBarStart = useRef<BarPosition | null>(null);
  const dragStartBarEnd = useRef<BarPosition | null>(null);

  const calcPositions = useCallback((pointerX: number): { start: BarPosition; end: BarPosition } => {
    const container = containerRef.current;
    const containerWidth = container ? container.getBoundingClientRect().width : 1;
    const rect = container ? container.getBoundingClientRect() : { left: 0 };
    const relativeX = pointerX - rect.left;

    if (type === 'start') {
      const newStart = pointerToBarPosition(relativeX, containerWidth, totalColumns);
      return { start: newStart, end: currentEnd };
    } else if (type === 'end') {
      const newEnd = pointerToBarPosition(relativeX, containerWidth, totalColumns);
      return { start: currentStart, end: newEnd };
    } else {
      // move: maintain duration
      const origStart = dragStartBarStart.current!;
      const origEnd = dragStartBarEnd.current!;
      const origStartVal = origStart.colIndex + origStart.offset;
      const origEndVal = origEnd.colIndex + origEnd.offset;
      const duration = origEndVal - origStartVal;

      const startX = dragStartX.current!;
      const deltaX = pointerX - startX;
      const deltaRatio = deltaX / containerWidth;
      const deltaCols = deltaRatio * totalColumns;

      let newStartVal = origStartVal + deltaCols;
      let newEndVal = origEndVal + deltaCols;

      // clamp so both ends stay within [0, totalColumns]
      if (newStartVal < 0) {
        newStartVal = 0;
        newEndVal = duration;
      }
      if (newEndVal > totalColumns) {
        newEndVal = totalColumns;
        newStartVal = totalColumns - duration;
      }

      const newStartColIndex = Math.min(Math.floor(newStartVal), totalColumns - 1);
      const newStartOffset = Math.max(0, Math.min(1, newStartVal - newStartColIndex));
      const newEndColIndex = Math.min(Math.floor(newEndVal), totalColumns - 1);
      const newEndOffset = Math.max(0, Math.min(1, newEndVal - newEndColIndex));

      return {
        start: { colIndex: newStartColIndex, offset: newStartOffset },
        end: { colIndex: newEndColIndex, offset: newEndOffset },
      };
    }
  }, [type, containerRef, totalColumns, currentStart, currentEnd]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragStartX.current = e.clientX;
    dragStartBarStart.current = currentStart;
    dragStartBarEnd.current = currentEnd;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [currentStart, currentEnd]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return;
    const positions = calcPositions(e.clientX);
    onPreviewChange(positions.start, positions.end);
  }, [calcPositions, onPreviewChange]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return;
    const positions = calcPositions(e.clientX);
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragStartX.current = null;
    dragStartBarStart.current = null;
    dragStartBarEnd.current = null;
    onDragComplete(positions.start, positions.end);
  }, [calcPositions, onDragComplete]);

  const style: CSSProperties = type === 'move'
    ? { position: 'absolute', inset: 0, cursor: 'grab', zIndex: 1 }
    : type === 'start'
    ? { position: 'absolute', top: 0, bottom: 0, left: 0, width: 8, cursor: 'ew-resize', zIndex: 2 }
    : { position: 'absolute', top: 0, bottom: 0, right: 0, width: 8, cursor: 'ew-resize', zIndex: 2 };

  return (
    <div
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}

// ---- BarElement ----

interface BarElementProps {
  entity: FlowEntity;
  barDef: BarDef;
  rowChain: unknown[];
  colChains: unknown[][];
  totalColumns: number;
  containerRef: React.RefObject<HTMLElement>;
}

function BarElement({ entity, barDef, rowChain, colChains, totalColumns, containerRef }: BarElementProps) {
  const [preview, setPreview] = useState<{ start: BarPosition; end: BarPosition } | null>(null);

  const { start: baseStart, end: baseEnd } = barDef.position(entity, colChains);
  const start = preview?.start ?? baseStart;
  const end = preview?.end ?? baseEnd;

  // Don't render if start > end
  if (start.colIndex + start.offset > end.colIndex + end.offset) return null;

  const left = barToLeftPercent(start, totalColumns);
  const right = barToRightPercent(end, totalColumns);

  const defaultStyle: CSSProperties = {
    position: 'absolute',
    top: '10%',
    bottom: '10%',
    left: `${left}%`,
    right: `${right}%`,
    backgroundColor: '#1976d2',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
    pointerEvents: 'auto',
    cursor: 'default',
    minWidth: 2,
    zIndex: 1,
  };

  const customStyle = barDef.style ? barDef.style(entity) : {};
  const barStyle: CSSProperties = { ...defaultStyle, ...customStyle };

  const handlePreviewChange = useCallback((s: BarPosition, e: BarPosition) => {
    setPreview({ start: s, end: e });
  }, []);

  const handleStartDragComplete = useCallback((s: BarPosition, e: BarPosition) => {
    setPreview(null);
    barDef.onDragStart?.(entity, rowChain, s);
  }, [barDef, entity, rowChain]);

  const handleEndDragComplete = useCallback((s: BarPosition, e: BarPosition) => {
    setPreview(null);
    barDef.onDragEnd?.(entity, rowChain, e);
  }, [barDef, entity, rowChain]);

  const handleMoveDragComplete = useCallback((s: BarPosition, e: BarPosition) => {
    setPreview(null);
    barDef.onDragMove?.(entity, rowChain, s, e);
  }, [barDef, entity, rowChain]);

  return (
    <div style={barStyle}>
      {barDef.onDragStart && (
        <DragHandle
          type="start"
          entity={entity}
          barDef={barDef}
          rowChain={rowChain}
          colChains={colChains}
          totalColumns={totalColumns}
          currentStart={start}
          currentEnd={end}
          containerRef={containerRef}
          onPreviewChange={handlePreviewChange}
          onDragComplete={handleStartDragComplete}
        />
      )}
      {barDef.onDragMove && (
        <DragHandle
          type="move"
          entity={entity}
          barDef={barDef}
          rowChain={rowChain}
          colChains={colChains}
          totalColumns={totalColumns}
          currentStart={start}
          currentEnd={end}
          containerRef={containerRef}
          onPreviewChange={handlePreviewChange}
          onDragComplete={handleMoveDragComplete}
        />
      )}
      {barDef.onDragEnd && (
        <DragHandle
          type="end"
          entity={entity}
          barDef={barDef}
          rowChain={rowChain}
          colChains={colChains}
          totalColumns={totalColumns}
          currentStart={start}
          currentEnd={end}
          containerRef={containerRef}
          onPreviewChange={handlePreviewChange}
          onDragComplete={handleEndDragComplete}
        />
      )}
      <span style={{ paddingLeft: 4, paddingRight: 4, fontSize: '0.75rem', color: '#fff', overflow: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 3, position: 'relative' }}>
        {barDef.label(entity)}
      </span>
    </div>
  );
}

// ---- BarOverlay ----

interface BarOverlayProps {
  barDef: BarDef;
  rowChain: unknown[];
  colChains: unknown[][];
  entities: Record<EntityType, FlowEntity[]>;
  totalColumns: number;
  containerRef: React.RefObject<HTMLElement>;
}

function BarOverlay({ barDef, rowChain, colChains, entities, totalColumns, containerRef }: BarOverlayProps) {
  const allEntities = entities[barDef.entityType] ?? [];
  const filtered = barDef.filter
    ? allEntities.filter((e) => {
        try { return barDef.filter!(e, rowChain); } catch { return false; }
      })
    : allEntities;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
      {filtered.map((entity) => (
        <BarElement
          key={entity.id}
          entity={entity}
          barDef={barDef}
          rowChain={rowChain}
          colChains={colChains}
          totalColumns={totalColumns}
          containerRef={containerRef}
        />
      ))}
    </div>
  );
}

// ---- ユーティリティ ----

function filterEntities(entities: FlowEntity[], filter?: Record<string, unknown>): FlowEntity[] {
  if (!filter) return entities;
  return entities.filter((e) =>
    Object.entries(filter).every(([k, v]) => {
      const val = e[k];
      if (Array.isArray(v)) return v.includes(val);
      if (v && typeof v === "object" && "id" in (v as object))
        return (val as FlowEntity)?.id === (v as FlowEntity).id;
      return val === v;
    })
  );
}

// ---- 行ノード型 ----

/**
 * 表示上の1行を表すノード。
 * chain: ルートから当該ノードまでの値の配列（セル計算に使用）
 * depth: インデントレベル
 * hasChildren: 子行を持つか（折りたたみボタン表示判定）
 * rowKey: 開閉状態管理用のユニークキー
 * rowDef: 対応するRowDef（セル定義・ContextMenu等を参照）
 * isSubRow: RowDefの直接行(false)かsub行(true)か
 */
interface RowNode {
  rowKey: string;
  chain: unknown[];
  depth: number;
  hasChildren: boolean;
  rowDef: RowDef;
  isSubRow: boolean;
  /** この行に適用するセル定義（null の場合はセルを空白描画） */
  cellDef: CellDef | null;
  /** この行に適用するガントバー定義（null の場合はバーを描画しない） */
  barDef: BarDef | null;
  buildChildren: () => RowNode[];
}

function buildRowNodes(
  rowDef: RowDef,
  allEntities: Record<EntityType, FlowEntity[]>,
  keyPrefix: string,
): RowNode[] {
  const baseEntities = rowDef.entityType
    ? filterEntities(allEntities[rowDef.entityType] ?? [], rowDef.filter)
    : [undefined];

  const nodes: RowNode[] = [];
  baseEntities.forEach((entity, ei) => {
    const values = rowDef.value(entity as FlowEntity | undefined);
    values.forEach((val, vi) => {
      const rowKey = `${keyPrefix}:${ei}:${vi}`;
      const chain = [val];
      const hasChildren = !!rowDef.sub && rowDef.sub.value(entity as FlowEntity).length > 0;

      nodes.push({
        rowKey,
        chain,
        depth: 0,
        hasChildren,
        rowDef,
        isSubRow: false,
        cellDef: rowDef.cell ?? null,
        barDef: rowDef.bar ?? null,
        buildChildren: () =>
          rowDef.sub
            ? buildSubNodes(rowDef.sub, entity as FlowEntity, chain, 1, rowKey, rowDef)
            : [],
      });
    });
  });
  return nodes;
}

function buildSubNodes(
  sub: SubAxis<unknown>,
  parent: FlowEntity,
  parentChain: unknown[],
  depth: number,
  keyPrefix: string,
  rowDef: RowDef,
): RowNode[] {
  const values = sub.value(parent);
  return values.map((val, i) => {
    const rowKey = `${keyPrefix}.sub:${i}`;
    const chain = [...parentChain, val];
    const hasChildren = !!sub.sub && sub.sub.value(val as FlowEntity).length > 0;

    return {
      rowKey,
      chain,
      depth,
      hasChildren,
      rowDef,
      isSubRow: true,
      cellDef: sub.cell ?? null,
      barDef: sub.bar ?? null,
      buildChildren: () =>
        sub.sub
          ? buildSubNodes(sub.sub, val as FlowEntity, chain, depth + 1, rowKey, rowDef)
          : [],
    };
  });
}

// ---- 列展開 ----

function expandColAxis(
  def: { entityType?: EntityType; filter?: Record<string, unknown>; value?: (e?: FlowEntity) => unknown[]; sub?: SubAxis<unknown> },
  allEntities: Record<EntityType, FlowEntity[]>,
): unknown[][] {
  if (!def.value) return [[undefined]];
  const baseEntities = def.entityType
    ? filterEntities(allEntities[def.entityType] ?? [], def.filter)
    : [undefined];
  const chains: unknown[][] = [];
  for (const entity of baseEntities) {
    for (const v of def.value(entity as FlowEntity | undefined)) {
      if (def.sub) {
        for (const sc of expandSubColAxis(def.sub, entity as FlowEntity))
          chains.push([v, ...sc]);
      } else {
        chains.push([v]);
      }
    }
  }
  return chains;
}

function expandSubColAxis(sub: SubAxis<unknown>, parent: FlowEntity): unknown[][] {
  return sub.value(parent).flatMap((v) =>
    sub.sub ? expandSubColAxis(sub.sub, v as FlowEntity).map((sc) => [v, ...sc]) : [[v]]
  );
}

// ---- ContextMenu ----

interface CtxState {
  mouseX: number;
  mouseY: number;
  items: ContextMenuItem[];
  params: { rowChain: unknown[]; colChain: unknown[]; entities: FlowEntity[] };
}

/** 編集中セルの識別キー */
interface EditingCell {
  rowKey: string;
  colIndex: number;
  currentValue: unknown;
}

/**
 * RowNodeの階層を辿り、ルートから当該ノードまでのContextMenuアイテムを統合する。
 * 下位階層で右クリックした場合、上位のアイテムも含めて表示する。
 */
function collectContextMenuItems(
  rowDef: RowDef,
  depth: number,
): ContextMenuItem[] {
  // depth=0: RowDef自身, depth>=1: sub階層
  const items: ContextMenuItem[] = [];

  // RowDef（親）のアイテムは常に含める
  if (rowDef.contextMenu) items.push(...rowDef.contextMenu.items);

  // sub階層を depth まで辿ってアイテムを収集
  if (depth >= 1 && rowDef.sub) {
    collectSubContextMenuItems(rowDef.sub, depth, items);
  }
  return items;
}

function collectSubContextMenuItems(
  sub: SubAxis<unknown>,
  remainDepth: number,
  items: ContextMenuItem[],
) {
  if (sub.contextMenu) items.push(...sub.contextMenu.items);
  if (remainDepth > 1 && sub.sub) {
    collectSubContextMenuItems(sub.sub, remainDepth - 1, items);
  }
}

// ---- 行レンダリング（再帰） ----

interface RowRendererProps {
  node: RowNode;
  colChains: unknown[][];
  columns: ColumnDef[];
  entities: Record<EntityType, FlowEntity[]>;
  openKeys: Set<string>;
  onToggle: (key: string) => void;
  onContextMenu: (e: React.MouseEvent, items: ContextMenuItem[], params: CtxState["params"]) => void;
  totalDepth: number;
  editingCell: EditingCell | null;
  onStartEdit: (rowKey: string, colIndex: number, currentValue: unknown) => void;
  onCommitEdit: (rowChain: unknown[], colChain: unknown[], currentValue: unknown, inputValue: unknown, cellDef: CellDef | null) => void;
  onCancelEdit: () => void;
}

function RowRenderer({
  node, colChains, columns, entities, openKeys, onToggle, onContextMenu, totalDepth,
  editingCell, onStartEdit, onCommitEdit, onCancelEdit,
}: RowRendererProps) {
  const { rowKey, chain, depth, hasChildren, rowDef, isSubRow, cellDef } = node;
  const isOpen = openKeys.has(rowKey);
  const children = isOpen ? node.buildChildren() : [];

  const containerRef = useRef<HTMLElement>(null);

  const rowVal = chain[chain.length - 1];

  const displayFn = isSubRow
    ? (rowDef.sub ? findSubDisplay(rowDef.sub, depth) : undefined)
    : rowDef.display;
  const label = displayFn ? displayFn(rowVal) : String(rowVal ?? "");

  const highlightFn = isSubRow
    ? (rowDef.sub ? findSubHighlight(rowDef.sub, depth) : undefined)
    : rowDef.highlight;
  const rowStyle: CSSProperties = highlightFn?.(rowVal) ?? {};

  const cellEntities = cellDef?.entityType ? (entities[cellDef.entityType] ?? []) : [];
  const menuItems = collectContextMenuItems(rowDef, depth);
  const hasMenu = menuItems.length > 0;

  return (
    <>
      <TableRow
        ref={containerRef}
        onContextMenu={
          hasMenu
            ? (e) => onContextMenu(e, menuItems, { rowChain: chain, colChain: [], entities: cellEntities })
            : undefined
        }
        sx={{ position: 'relative', "& > td": { borderBottom: hasChildren && isOpen ? "none" : undefined } }}
      >
        <TableCell style={{ ...rowStyle, paddingLeft: 8 + depth * 20, whiteSpace: "nowrap", width: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            {hasChildren ? (
              <IconButton size="small" onClick={() => onToggle(rowKey)} sx={{ p: 0.25 }}>
                {isOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
              </IconButton>
            ) : (
              <Box sx={{ width: 24 }} />
            )}
            {label}
          </Box>
        </TableCell>

        {colChains.map((colChain, ci) => {
          if (!cellDef) {
            // cell未定義の行はセルを空白描画
            return <TableCell key={ci} />;
          }
          const value = cellDef.cellValue(cellEntities, chain, colChain);
          const cellStyle: CSSProperties = cellDef.highlight?.(rowVal, colChain[colChain.length - 1], value) ?? {};
          const cellMenuItems = cellDef.contextMenu
            ? [...menuItems, ...cellDef.contextMenu.items]
            : menuItems;
          const isEditing = editingCell?.rowKey === rowKey && editingCell?.colIndex === ci;
          const isEditable = !!cellDef.editField && !!cellDef.onUpdate;

          return (
            <TableCell
              key={ci}
              style={{
                ...cellStyle,
                cursor: isEditable ? "pointer" : undefined,
                padding: isEditing ? 2 : undefined,
              }}
              onClick={
                isEditable && !isEditing
                  ? () => onStartEdit(rowKey, ci, value)
                  : undefined
              }
              onContextMenu={
                cellMenuItems.length > 0
                  ? (e) => onContextMenu(e, cellMenuItems, { rowChain: chain, colChain, entities: cellEntities })
                  : undefined
              }
            >
              {isEditing && cellDef.editField ? (
                <CellEditor
                  fieldDef={cellDef.editField}
                  initialValue={value}
                  onCommit={(inputValue) => onCommitEdit(chain, colChain, value, inputValue, cellDef)}
                  onCancel={onCancelEdit}
                />
              ) : (
                cellDef.display(value)
              )}
            </TableCell>
          );
        })}

        {node.barDef && (
          <TableCell
            sx={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              padding: 0,
              border: 'none',
              pointerEvents: 'none',
            }}
          >
            <BarOverlay
              barDef={node.barDef}
              rowChain={chain}
              colChains={colChains}
              entities={entities}
              totalColumns={colChains.length}
              containerRef={containerRef}
            />
          </TableCell>
        )}
      </TableRow>

      {isOpen && children.map((child) => (
        <RowRenderer
          key={child.rowKey}
          node={child}
          colChains={colChains}
          columns={columns}
          entities={entities}
          openKeys={openKeys}
          onToggle={onToggle}
          onContextMenu={onContextMenu}
          totalDepth={totalDepth}
          editingCell={editingCell}
          onStartEdit={onStartEdit}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
        />
      ))}
    </>
  );
}

/** depth に対応する SubAxis を辿って display を返す */
function findSubDisplay(sub: SubAxis<unknown>, depth: number): ((v: unknown) => React.ReactNode) | undefined {
  if (depth <= 1) return sub.display as ((v: unknown) => React.ReactNode) | undefined;
  return sub.sub ? findSubDisplay(sub.sub, depth - 1) : undefined;
}

function findSubHighlight(sub: SubAxis<unknown>, depth: number): ((v: unknown) => CSSProperties | undefined) | undefined {
  if (depth <= 1) return sub.highlight as ((v: unknown) => CSSProperties | undefined) | undefined;
  return sub.sub ? findSubHighlight(sub.sub, depth - 1) : undefined;
}

// ---- メインコンポーネント ----

export function FlexTable({ layout = "stacked", columns, rows, entities }: FlexTableProps) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const handleToggle = useCallback((key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, items: ContextMenuItem[], params: CtxState["params"]) => {
      e.preventDefault();
      setCtx({ mouseX: e.clientX, mouseY: e.clientY, items, params });
    },
    []
  );

  const handleStartEdit = useCallback((rowKey: string, colIndex: number, currentValue: unknown) => {
    setEditingCell({ rowKey, colIndex, currentValue });
  }, []);

  const handleCommitEdit = useCallback((
    rowChain: unknown[],
    colChain: unknown[],
    value: unknown,
    inputValue: unknown,
    cellDef: CellDef | null,
  ) => {
    cellDef?.onUpdate?.(rowChain, colChain, value, inputValue);
    setEditingCell(null);
  }, []);

  const handleCancelEdit = useCallback(() => setEditingCell(null), []);

  const closeCtx = () => setCtx(null);

  // 列チェーン展開
  const colChains = useMemo(
    () => columns.flatMap((col) => expandColAxis(col, entities)),
    [columns, entities]
  );

  // ルート行ノード生成
  const rootNodes = useMemo(
    () => rows.flatMap((row, ri) => buildRowNodes(row, entities, `row:${ri}`)),
    [rows, entities]
  );

  return (
    <>
      <TableContainer component={Paper}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell />
              {colChains.map((chain, ci) => {
                const colDef = columns[0];
                const display = colDef.display ?? ((v) => String(v ?? ""));
                const style: CSSProperties = colDef.highlight?.(chain[chain.length - 1]) ?? {};
                return (
                  <TableCell
                    key={ci}
                    style={style}
                    onContextMenu={
                      colDef.contextMenu
                        ? (e) => handleContextMenu(e, colDef.contextMenu!.items, { rowChain: [], colChain: chain, entities: [] })
                        : undefined
                    }
                  >
                    {display(chain[chain.length - 1])}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {rootNodes.map((node) => (
              <RowRenderer
                key={node.rowKey}
                node={node}
                colChains={colChains}
                columns={columns}
                entities={entities}
                openKeys={openKeys}
                onToggle={handleToggle}
                onContextMenu={handleContextMenu}
                totalDepth={0}
                editingCell={editingCell}
                onStartEdit={handleStartEdit}
                onCommitEdit={handleCommitEdit}
                onCancelEdit={handleCancelEdit}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Menu
        open={ctx !== null}
        onClose={closeCtx}
        anchorReference="anchorPosition"
        anchorPosition={ctx ? { top: ctx.mouseY, left: ctx.mouseX } : undefined}
      >
        {ctx?.items.map((item, i) => (
          <MenuItem key={i} onClick={() => { item.action(ctx.params); closeCtx(); }}>
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
