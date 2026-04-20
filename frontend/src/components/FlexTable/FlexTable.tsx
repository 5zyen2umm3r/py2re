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
import { FlexTableProps, RowDef, ColumnDef, SubAxis, CellDef, ContextMenuDef, ContextMenuItem, BarDef, BarPosition, BarContextMenuItem } from "./types";
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
  containerRef: React.RefObject<HTMLTableRowElement>;
  /** BarOverlay の left オフセット（行ヘッダ幅）。ドラッグ位置計算に使用 */
  overlayLeft: number;
  onPreviewChange: (start: BarPosition, end: BarPosition) => void;
  onDragComplete: (start: BarPosition, end: BarPosition) => void;
  onDragCancel: () => void;
}

function DragHandle({
  type, entity, barDef, rowChain, colChains, totalColumns,
  currentStart, currentEnd, containerRef, overlayLeft,
  onPreviewChange, onDragComplete, onDragCancel,
}: DragHandleProps) {
  const dragStartX = useRef<number | null>(null);
  const dragStartBarStart = useRef<BarPosition | null>(null);
  const dragStartBarEnd = useRef<BarPosition | null>(null);

  const calcPositions = useCallback((pointerX: number): { start: BarPosition; end: BarPosition } => {
    const container = containerRef.current;
    const rect = container ? container.getBoundingClientRect() : { left: 0, width: 1 };
    // データ列領域の幅（行ヘッダを除く）
    const containerWidth = rect.width - overlayLeft;
    // ポインタ位置をデータ列領域の左端基準に変換
    const relativeX = pointerX - rect.left - overlayLeft;

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
    const moved = Math.abs(e.clientX - dragStartX.current) > 2;
    const positions = calcPositions(e.clientX);
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragStartX.current = null;
    dragStartBarStart.current = null;
    dragStartBarEnd.current = null;
    if (moved) {
      onDragComplete(positions.start, positions.end);
    } else {
      // クリックのみ（移動なし）→ プレビューをリセット
      onDragCancel();
    }
  }, [calcPositions, onDragComplete, onPreviewChange, currentStart, currentEnd]);

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
  containerRef: React.RefObject<HTMLTableRowElement>;
  laneTop: number;
  laneHeight: number;
  /** BarOverlay の left オフセット（行ヘッダ幅）。ドラッグ位置計算に使用 */
  overlayLeft: number;
  onContextMenu: (e: React.MouseEvent, items: BarContextMenuItem[], entity: FlowEntity, rowChain: unknown[]) => void;
}

function BarElement({ entity, barDef, rowChain, colChains, totalColumns, containerRef, laneTop, laneHeight, overlayLeft, onContextMenu }: BarElementProps) {
  const [preview, setPreview] = useState<{ start: BarPosition; end: BarPosition } | null>(null);

  const { start: baseStart, end: baseEnd } = barDef.position(entity, colChains);
  const start = preview?.start ?? baseStart;
  const end = preview?.end ?? baseEnd;

  // Don't render if start > end
  if (start.colIndex + start.offset > end.colIndex + end.offset) return null;

  const left = barToLeftPercent(start, totalColumns);
  const right = barToRightPercent(end, totalColumns);

  const PADDING = 3; // px 上下パディング
  const defaultStyle: CSSProperties = {
    position: 'absolute',
    top: laneTop + PADDING,
    height: laneHeight - PADDING * 2,
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

  const handleDragCancel = useCallback(() => {
    setPreview(null);
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
    <div
      style={barStyle}
      onContextMenu={barDef.contextMenu ? (e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, barDef.contextMenu!.items, entity, rowChain);
      } : undefined}
    >
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
          overlayLeft={overlayLeft}
          onPreviewChange={handlePreviewChange}
          onDragComplete={handleStartDragComplete}
          onDragCancel={handleDragCancel}
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
          overlayLeft={overlayLeft}
          onPreviewChange={handlePreviewChange}
          onDragComplete={handleMoveDragComplete}
          onDragCancel={handleDragCancel}
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
          overlayLeft={overlayLeft}
          onPreviewChange={handlePreviewChange}
          onDragComplete={handleEndDragComplete}
          onDragCancel={handleDragCancel}
        />
      )}
      {/* 左端ラベル */}
      {barDef.labelStart && (
        <span style={{
          position: 'absolute', left: 2, top: 0, bottom: 0,
          display: 'flex', alignItems: 'center',
          fontSize: '0.7rem', color: '#fff',
          pointerEvents: 'none', zIndex: 3,
          whiteSpace: 'nowrap', overflow: 'hidden',
        }}>
          {barDef.labelStart(entity)}
        </span>
      )}
      {/* 中央ラベル */}
      <span style={{
        flex: 1, textAlign: 'center',
        paddingLeft: barDef.labelStart ? 48 : 4,
        paddingRight: barDef.labelEnd ? 48 : 4,
        fontSize: '0.75rem', color: '#fff',
        overflow: 'hidden', whiteSpace: 'nowrap',
        pointerEvents: 'none', zIndex: 3, position: 'relative',
      }}>
        {barDef.label(entity)}
      </span>
      {/* 右端ラベル */}
      {barDef.labelEnd && (
        <span style={{
          position: 'absolute', right: 2, top: 0, bottom: 0,
          display: 'flex', alignItems: 'center',
          fontSize: '0.7rem', color: '#fff',
          pointerEvents: 'none', zIndex: 3,
          whiteSpace: 'nowrap', overflow: 'hidden',
        }}>
          {barDef.labelEnd(entity)}
        </span>
      )}
    </div>
  );
}

// ---- BarOverlay ----

const BAR_LANE_HEIGHT = 28; // px per lane

/** バーの重なりを検出してレーン番号を割り当てる */
function assignLanes(
  bars: { startVal: number; endVal: number }[],
): number[] {
  const lanes: number[] = new Array(bars.length).fill(0);
  // 各レーンの現在の終端値
  const laneEnds: number[] = [];

  for (let i = 0; i < bars.length; i++) {
    const { startVal, endVal } = bars[i];
    // 空いている最小レーンを探す
    let assigned = -1;
    for (let l = 0; l < laneEnds.length; l++) {
      if (laneEnds[l] <= startVal) {
        assigned = l;
        break;
      }
    }
    if (assigned === -1) {
      assigned = laneEnds.length;
      laneEnds.push(endVal);
    } else {
      laneEnds[assigned] = endVal;
    }
    lanes[i] = assigned;
  }
  return lanes;
}

interface BarOverlayProps {
  barDef: BarDef;
  rowChain: unknown[];
  colChains: unknown[][];
  entities: Record<EntityType, FlowEntity[]>;
  totalColumns: number;
  /** 行ヘッダセル（最初の td）への ref。バー位置のオフセット計算に使用 */
  headerCellRef: React.RefObject<HTMLTableCellElement>;
  containerRef: React.RefObject<HTMLTableRowElement>;
  /** レーン数が確定したときに親へ通知 */
  onLaneCount: (count: number) => void;
  onContextMenu: (e: React.MouseEvent, items: BarContextMenuItem[], entity: FlowEntity, rowChain: unknown[]) => void;
}

function BarOverlay({
  barDef, rowChain, colChains, entities, totalColumns,
  headerCellRef, containerRef, onLaneCount, onContextMenu,
}: BarOverlayProps) {
  // ヘッダ幅・行幅を ResizeObserver で監視して正確に取得
  const [headerWidth, setHeaderWidth] = useState(0);
  const [rowWidth, setRowWidth] = useState(0);

  React.useEffect(() => {
    const updateSizes = () => {
      setHeaderWidth(headerCellRef.current?.getBoundingClientRect().width ?? 0);
      setRowWidth(containerRef.current?.getBoundingClientRect().width ?? 0);
    };
    updateSizes();
    const ro = new ResizeObserver(updateSizes);
    if (headerCellRef.current) ro.observe(headerCellRef.current);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [headerCellRef, containerRef]);

  const allEntities = entities[barDef.entityType] ?? [];
  const filtered = barDef.filter
    ? allEntities.filter((e) => {
        try { return barDef.filter!(e, rowChain); } catch { return false; }
      })
    : allEntities;

  // 各バーの start/end 値を計算
  const barInfos = filtered.map((entity) => {
    const { start, end } = barDef.position(entity, colChains);
    const startVal = start.colIndex + start.offset;
    const endVal = end.colIndex + end.offset;
    return { entity, startVal, endVal, valid: startVal <= endVal && start.colIndex >= 0 };
  });

  const validBars = barInfos.filter((b) => b.valid);
  const lanes = assignLanes(validBars.map((b) => ({ startVal: b.startVal, endVal: b.endVal })));
  const laneCount = lanes.length > 0 ? Math.max(...lanes) + 1 : 1;

  React.useEffect(() => {
    onLaneCount(laneCount);
  }, [laneCount, onLaneCount]);

  const dataWidth = rowWidth - headerWidth;
  const totalHeight = laneCount * BAR_LANE_HEIGHT;

  let validIdx = 0;
  return (
    <div style={{
      position: 'absolute', top: 0, left: headerWidth, width: dataWidth,
      height: totalHeight, pointerEvents: 'none',
    }}>
      {barInfos.map((info) => {
        if (!info.valid) return null;
        const lane = lanes[validIdx++];
        const top = lane * BAR_LANE_HEIGHT;
        return (
          <BarElement
            key={info.entity.id}
            entity={info.entity}
            barDef={barDef}
            rowChain={rowChain}
            colChains={colChains}
            totalColumns={totalColumns}
            containerRef={containerRef}
            laneTop={top}
            laneHeight={BAR_LANE_HEIGHT}
            overlayLeft={headerWidth}
            onContextMenu={onContextMenu}
          />
        );
      })}
    </div>
  );
}

// ---- ユーティリティ ----

function filterEntities(entities: FlowEntity[], filter?: (entity: FlowEntity) => boolean): FlowEntity[] {
  if (!filter) return entities;
  return entities.filter(filter);
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
 * kind: "label" = ラベル行, "dummy" = ダミー行, "data" = 通常データ行
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
  /** 行の種別: "data"=通常, "label"=ラベル行, "dummy"=ダミー行 */
  kind: "data" | "label" | "dummy";
  /** RowDef 境目の先頭行か（上部に太い区切り線を引く） */
  isGroupStart: boolean;
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

  // ラベル行（label が定義されている場合）
  if (rowDef.label !== undefined) {
    nodes.push({
      rowKey: `${keyPrefix}:__label__`,
      chain: [rowDef.label],
      depth: 0,
      hasChildren: false,
      rowDef,
      isSubRow: false,
      cellDef: null,
      barDef: null,
      buildChildren: () => [],
      kind: "label",
      isGroupStart: true,
    });
  }

  baseEntities.forEach((entity, ei) => {
    const values = rowDef.value(entity as FlowEntity | undefined);
    values.forEach((val, vi) => {
      const rowKey = `${keyPrefix}:${ei}:${vi}`;
      const chain = [val];
      const hasChildren = !!rowDef.sub && rowDef.sub.value(entity as FlowEntity).length > 0;
      const isFirst = ei === 0 && vi === 0;

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
        kind: "data",
        // ラベル行がない場合は最初のデータ行がグループ先頭
        isGroupStart: rowDef.label === undefined && isFirst,
      });
    });
  });

  // ダミー行（末尾に常に追加）
  nodes.push({
    rowKey: `${keyPrefix}:__dummy__`,
    chain: [null],
    depth: 0,
    hasChildren: false,
    rowDef,
    isSubRow: false,
    cellDef: null,
    barDef: rowDef.bar ?? null,
    buildChildren: () => [],
    kind: "dummy",
    isGroupStart: false,
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
      kind: "data" as const,
      isGroupStart: false,
    };
  });
}

// ---- 列展開 ----

function expandColAxis(
  def: { entityType?: EntityType; filter?: (entity: FlowEntity) => boolean; value?: (e?: FlowEntity) => unknown[]; sub?: SubAxis<unknown> },
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
  onBarContextMenu: (e: React.MouseEvent, items: BarContextMenuItem[], entity: FlowEntity, rowChain: unknown[]) => void;
  totalDepth: number;
  editingCell: EditingCell | null;
  onStartEdit: (rowKey: string, colIndex: number, currentValue: unknown) => void;
  onCommitEdit: (rowChain: unknown[], colChain: unknown[], currentValue: unknown, inputValue: unknown, cellDef: CellDef | null) => void;
  onCancelEdit: () => void;
  stickyRowHeader?: boolean;
}

function RowRenderer({
  node, colChains, columns, entities, openKeys, onToggle, onContextMenu, onBarContextMenu, totalDepth,
  editingCell, onStartEdit, onCommitEdit, onCancelEdit, stickyRowHeader = false,
}: RowRendererProps) {
  const { rowKey, chain, depth, hasChildren, rowDef, isSubRow, cellDef } = node;
  const isOpen = openKeys.has(rowKey);
  const children = isOpen ? node.buildChildren() : [];

  const containerRef = useRef<HTMLTableRowElement>(null);
  const headerCellRef = useRef<HTMLTableCellElement>(null);
  const [laneCount, setLaneCount] = useState(1);

  const handleLaneCount = useCallback((count: number) => {
    setLaneCount((prev) => prev !== count ? count : prev);
  }, []);

  const rowVal = chain[chain.length - 1];

  // ---- ラベル行 ----
  if (node.kind === "label") {
    return (
      <TableRow sx={{ borderTop: '2px solid', borderTopColor: 'divider' }}>
        <TableCell
          colSpan={colChains.length + 1}
          sx={{
            backgroundColor: 'action.hover',
            fontWeight: 'bold',
            fontSize: '0.8rem',
            color: 'text.secondary',
            py: 0.25,
            px: 1,
            letterSpacing: '0.05em',
            ...(stickyRowHeader ? { position: 'sticky', left: 0, zIndex: 1 } : {}),
          }}
        >
          {String(rowVal ?? '')}
        </TableCell>
      </TableRow>
    );
  }

  // ---- ダミー行 ----
  if (node.kind === "dummy") {
    const menuItems = collectContextMenuItems(rowDef, 0);
    const hasMenu = menuItems.length > 0;
    const cellEntities: FlowEntity[] = [];
    return (
      <TableRow
        sx={{
          '& > td': { borderBottom: '2px solid', borderBottomColor: 'divider' },
        }}
      >
        <TableCell
          sx={{
            color: 'text.disabled',
            fontSize: '0.75rem',
            fontStyle: 'italic',
            whiteSpace: 'nowrap',
            width: '1%',
            py: 0.25,
            pl: 4,
            ...(stickyRowHeader ? { position: 'sticky', left: 0, zIndex: 1, backgroundColor: 'background.paper' } : {}),
          }}
          onContextMenu={
            hasMenu
              ? (e) => onContextMenu(e, menuItems, { rowChain: [null], colChain: colChains[0] ?? [], entities: cellEntities })
              : undefined
          }
        >
          (EOF)
        </TableCell>
        {colChains.map((colChain, ci) => (
          <TableCell
            key={ci}
            onContextMenu={
              hasMenu
                ? (e) => onContextMenu(e, menuItems, { rowChain: [null], colChain, entities: cellEntities })
                : undefined
            }
          />
        ))}
      </TableRow>
    );
  }

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

  // バーがある場合は laneCount に応じて行の高さを設定
  const rowHeight = node.barDef ? laneCount * BAR_LANE_HEIGHT : undefined;

  // グループ先頭（ラベル行なし）の場合は上部に区切り線
  const groupStartSx = node.isGroupStart
    ? { borderTop: '2px solid', borderTopColor: 'divider' }
    : {};

  return (
    <>
      <TableRow
        ref={containerRef}
        sx={{
          position: 'relative',
          height: rowHeight,
          ...groupStartSx,
          "& > td": { borderBottom: hasChildren && isOpen ? "none" : undefined },
        }}
      >
        <TableCell
          ref={headerCellRef}
          style={{
            ...rowStyle,
            paddingLeft: 8 + depth * 20,
            whiteSpace: "nowrap",
            width: "1%",
            verticalAlign: 'middle',
            ...(stickyRowHeader ? {
              position: 'sticky',
              left: 0,
              zIndex: 1,
              backgroundColor: 'var(--mui-palette-background-paper, #fff)',
            } : {}),
          }}
          onContextMenu={
            hasMenu
              ? (e) => onContextMenu(e, menuItems, { rowChain: chain, colChain: colChains[0] ?? [], entities: cellEntities })
              : undefined
          }
        >
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
            return (
              <TableCell
                key={ci}
                onContextMenu={
                  hasMenu
                    ? (e) => onContextMenu(e, menuItems, { rowChain: chain, colChain, entities: cellEntities })
                    : undefined
                }
              />
            );
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
              zIndex: 0,
            }}
          >
            <BarOverlay
              barDef={node.barDef}
              rowChain={chain}
              colChains={colChains}
              entities={entities}
              totalColumns={colChains.length}
              headerCellRef={headerCellRef}
              containerRef={containerRef}
              onLaneCount={handleLaneCount}
              onContextMenu={onBarContextMenu}
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
          onBarContextMenu={onBarContextMenu}
          totalDepth={totalDepth}
          editingCell={editingCell}
          onStartEdit={onStartEdit}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
          stickyRowHeader={stickyRowHeader}
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

// ---- ContextMenuItemRenderer ----

interface ContextMenuItemRendererProps {
  item: ContextMenuItem;
  params: CtxState["params"];
  onClose: () => void;
}

function ContextMenuItemRenderer({ item, params, onClose }: ContextMenuItemRendererProps) {
  const [subAnchor, setSubAnchor] = useState<HTMLElement | null>(null);

  if (item.subItems && item.subItems.length > 0) {
    return (
      <>
        <MenuItem
          onMouseEnter={(e) => setSubAnchor(e.currentTarget)}
          onMouseLeave={() => setSubAnchor(null)}
        >
          {item.label}
          <span style={{ marginLeft: 'auto', paddingLeft: 8, fontSize: '0.75rem' }}>▶</span>
          <Menu
            open={Boolean(subAnchor)}
            anchorEl={subAnchor}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            onClose={() => setSubAnchor(null)}
            disableAutoFocus
            disableEnforceFocus
            style={{ pointerEvents: 'none' }}
            PaperProps={{ style: { pointerEvents: 'auto' } }}
            onMouseLeave={() => setSubAnchor(null)}
          >
            {item.subItems.map((sub, si) => (
              <ContextMenuItemRenderer key={si} item={sub} params={params} onClose={onClose} />
            ))}
          </Menu>
        </MenuItem>
      </>
    );
  }

  return (
    <MenuItem onClick={() => { item.action?.(params); onClose(); }}>
      {item.label}
    </MenuItem>
  );
}

// ---- メインコンポーネント ----

export function FlexTable({ layout = "stacked", columns, rows, entities, stickyHeader = true, stickyRowHeader = false }: FlexTableProps) {
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

  const handleBarContextMenu = useCallback(
    (e: React.MouseEvent, barItems: BarContextMenuItem[], entity: FlowEntity, rowChain: unknown[]) => {
      e.preventDefault();
      // BarContextMenuItem を ContextMenuItem に変換して既存の ctx メニューを再利用
      const items: ContextMenuItem[] = barItems.map((bi) => ({
        label: bi.label,
        action: () => bi.action({ entity, rowChain }),
      }));
      setCtx({ mouseX: e.clientX, mouseY: e.clientY, items, params: { rowChain, colChain: [], entities: [] } });
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
      <TableContainer component={Paper} sx={{ maxHeight: '100%', height: '100%', overflow: 'auto' }}>
        <Table size="small" stickyHeader={stickyHeader}>
          <TableHead>
            <TableRow>
              {/* 左上の交差セル: stickyHeader + stickyRowHeader が両方有効な場合は z-index を上げる */}
              <TableCell sx={{
                width: '1%',
                whiteSpace: 'nowrap',
                ...(stickyRowHeader ? { position: 'sticky', left: 0, zIndex: stickyHeader ? 4 : 2, backgroundColor: 'background.paper' } : {}),
              }} />
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
                onBarContextMenu={handleBarContextMenu}
                totalDepth={0}
                editingCell={editingCell}
                onStartEdit={handleStartEdit}
                onCommitEdit={handleCommitEdit}
                onCancelEdit={handleCancelEdit}
                stickyRowHeader={stickyRowHeader}
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
          <ContextMenuItemRenderer key={i} item={item} params={ctx.params} onClose={closeCtx} />
        ))}
      </Menu>
    </>
  );
}
