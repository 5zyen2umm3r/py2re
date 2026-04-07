/**
 * FlexTable: 行・列ともに再帰的な副軸を持つ汎用集計表
 */
import React, { useState, useCallback, CSSProperties } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  FlexTableProps,
  RowDef,
  ColumnDef,
  SubAxis,
  CellDef,
  ContextMenuDef,
} from "./types";
import { FlowEntity, EntityType } from "../../api/entities";

// ---- ユーティリティ ----

function filterEntities(
  entities: FlowEntity[],
  filter?: Record<string, unknown>,
): FlowEntity[] {
  if (!filter) return entities;
  return entities.filter((e) =>
    Object.entries(filter).every(([k, v]) => {
      const val = e[k];
      if (Array.isArray(v)) return v.includes(val);
      if (v && typeof v === "object" && "id" in (v as object))
        return (val as FlowEntity)?.id === (v as FlowEntity).id;
      return val === v;
    }),
  );
}

/** 軸の値チェーンを再帰展開 */
function expandAxis(
  def: {
    entityType?: EntityType;
    filter?: Record<string, unknown>;
    value: (e?: FlowEntity) => unknown[];
    sub?: SubAxis<unknown>;
  },
  allEntities: Record<EntityType, FlowEntity[]>,
): unknown[][] {
  const baseEntities = def.entityType
    ? filterEntities(allEntities[def.entityType] ?? [], def.filter)
    : [undefined];

  const chains: unknown[][] = [];
  for (const entity of baseEntities) {
    const values = def.value(entity as FlowEntity | undefined);
    for (const v of values) {
      if (def.sub) {
        const subChains = expandSubAxis(
          def.sub,
          entity as FlowEntity,
          allEntities,
        );
        for (const sc of subChains) chains.push([v, ...sc]);
      } else {
        chains.push([v]);
      }
    }
  }
  return chains;
}

function expandSubAxis(
  sub: SubAxis<unknown>,
  parent: FlowEntity,
  allEntities: Record<EntityType, FlowEntity[]>,
): unknown[][] {
  const values = sub.value(parent);
  const chains: unknown[][] = [];
  for (const v of values) {
    if (sub.sub) {
      const subChains = expandSubAxis(sub.sub, v as FlowEntity, allEntities);
      for (const sc of subChains) chains.push([v, ...sc]);
    } else {
      chains.push([v]);
    }
  }
  return chains;
}

// ---- ContextMenu ----

interface CtxState {
  mouseX: number;
  mouseY: number;
  def: ContextMenuDef;
  params: { rowChain: unknown[]; colChain: unknown[]; entities: FlowEntity[] };
}

// ---- メインコンポーネント ----

export function FlexTable({
  layout = "stacked",
  columns,
  rows,
  entities,
}: FlexTableProps) {
  const [ctx, setCtx] = useState<CtxState | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, def: ContextMenuDef, params: CtxState["params"]) => {
      e.preventDefault();
      setCtx({ mouseX: e.clientX, mouseY: e.clientY, def, params });
    },
    [],
  );

  const closeCtx = () => setCtx(null);

  // 列チェーン展開
  const colChains: unknown[][] = columns.flatMap((col) =>
    col.value
      ? expandAxis(
          {
            entityType: col.entityType,
            filter: col.filter,
            value: col.value,
            sub: col.sub,
          },
          entities,
        )
      : [[undefined]],
  );

  // 行チェーン展開
  const rowChains: { chain: unknown[]; rowDef: RowDef }[] = rows.flatMap(
    (row) =>
      expandAxis(
        {
          entityType: row.entityType,
          filter: row.filter,
          value: row.value,
          sub: row.sub,
        },
        entities,
      ).map((chain) => ({ chain, rowDef: row })),
  );

  return (
    <>
      <TableContainer component={Paper}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell />
              {colChains.map((chain, ci) => {
                const colDef = columns[0]; // 列定義は先頭から順に対応
                const display = colDef.display ?? ((v) => String(v ?? ""));
                const style: CSSProperties =
                  colDef.highlight?.(chain[chain.length - 1]) ?? {};
                return (
                  <TableCell
                    key={ci}
                    style={style}
                    onContextMenu={
                      colDef.contextMenu
                        ? (e) =>
                            handleContextMenu(e, colDef.contextMenu!, {
                              rowChain: [],
                              colChain: chain,
                              entities: [],
                            })
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
            {rowChains.map(({ chain, rowDef }, ri) => {
              const rowDisplay = rowDef.display ?? ((v) => String(v ?? ""));
              const rowVal = chain[chain.length - 1];
              const rowStyle: CSSProperties = rowDef.highlight?.(rowVal) ?? {};
              const cellDef: CellDef = rowDef.cell;
              const cellEntities = cellDef.entityType
                ? (entities[cellDef.entityType] ?? [])
                : [];

              return (
                <TableRow
                  key={ri}
                  onContextMenu={
                    rowDef.contextMenu
                      ? (e) =>
                          handleContextMenu(e, rowDef.contextMenu!, {
                            rowChain: chain,
                            colChain: [],
                            entities: cellEntities,
                          })
                      : undefined
                  }
                >
                  <TableCell style={rowStyle}>{rowDisplay(rowVal)}</TableCell>
                  {colChains.map((colChain, ci) => {
                    const value = cellDef.cellValue(
                      cellEntities,
                      chain,
                      colChain,
                    );
                    const cellStyle: CSSProperties =
                      cellDef.highlight?.(
                        rowVal,
                        colChain[colChain.length - 1],
                        value,
                      ) ?? {};
                    return (
                      <TableCell
                        key={ci}
                        style={cellStyle}
                        onContextMenu={
                          cellDef.contextMenu
                            ? (e) =>
                                handleContextMenu(e, cellDef.contextMenu!, {
                                  rowChain: chain,
                                  colChain,
                                  entities: cellEntities,
                                })
                            : undefined
                        }
                      >
                        {cellDef.display(value)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ContextMenu */}
      <Menu
        open={ctx !== null}
        onClose={closeCtx}
        anchorReference="anchorPosition"
        anchorPosition={ctx ? { top: ctx.mouseY, left: ctx.mouseX } : undefined}
      >
        {ctx?.def.items.map((item, i) => (
          <MenuItem
            key={i}
            onClick={() => {
              item.action(ctx.params);
              closeCtx();
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
