/**
 * FlexTable: 行・列ともに再帰的な副軸を持つ汎用集計表
 *
 * 行展開モデル:
 *   - RowDef ごとに「親行」を1行表示し、sub が定義されていれば子行を展開/折りたたみできる
 *   - sub も同様に再帰的に展開/折りたたみ可能
 *   - 各行の開閉状態は rowKey（階層パスの文字列）で管理する
 */
import React, { useState, useCallback, useMemo, CSSProperties } from "react";
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Menu, MenuItem, IconButton, Collapse, Box,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { FlexTableProps, RowDef, ColumnDef, SubAxis, CellDef, ContextMenuDef, ContextMenuItem } from "./types";
import { FlowEntity, EntityType } from "../../api/entities";

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
  /** この行の子ノードを生成する関数（遅延評価） */
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
}

function RowRenderer({
  node, colChains, columns, entities, openKeys, onToggle, onContextMenu, totalDepth,
}: RowRendererProps) {
  const { rowKey, chain, depth, hasChildren, rowDef, isSubRow } = node;
  const isOpen = openKeys.has(rowKey);
  const children = isOpen ? node.buildChildren() : [];

  const rowVal = chain[chain.length - 1];

  const displayFn = isSubRow
    ? (rowDef.sub ? findSubDisplay(rowDef.sub, depth) : undefined)
    : rowDef.display;
  const label = displayFn ? displayFn(rowVal) : String(rowVal ?? "");

  const highlightFn = isSubRow
    ? (rowDef.sub ? findSubHighlight(rowDef.sub, depth) : undefined)
    : rowDef.highlight;
  const rowStyle: CSSProperties = highlightFn?.(rowVal) ?? {};

  const cellDef: CellDef = rowDef.cell;
  const cellEntities = cellDef.entityType ? (entities[cellDef.entityType] ?? []) : [];

  // 当該深さまでのContextMenuアイテムを統合
  const menuItems = collectContextMenuItems(rowDef, depth);
  const hasMenu = menuItems.length > 0;

  return (
    <>
      <TableRow
        onContextMenu={
          hasMenu
            ? (e) => onContextMenu(e, menuItems, { rowChain: chain, colChain: [], entities: cellEntities })
            : undefined
        }
        sx={{ "& > td": { borderBottom: hasChildren && isOpen ? "none" : undefined } }}
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
          const value = cellDef.cellValue(cellEntities, chain, colChain);
          const cellStyle: CSSProperties = cellDef.highlight?.(rowVal, colChain[colChain.length - 1], value) ?? {};
          // セルのContextMenuも統合（cellDef.contextMenuはセル固有）
          const cellMenuItems = cellDef.contextMenu
            ? [...menuItems, ...cellDef.contextMenu.items]
            : menuItems;
          return (
            <TableCell
              key={ci}
              style={cellStyle}
              onContextMenu={
                cellMenuItems.length > 0
                  ? (e) => onContextMenu(e, cellMenuItems, { rowChain: chain, colChain, entities: cellEntities })
                  : undefined
              }
            >
              {cellDef.display(value)}
            </TableCell>
          );
        })}
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
                        ? (e) => handleContextMenu(e, colDef.contextMenu!, { rowChain: [], colChain: chain, entities: [] })
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
