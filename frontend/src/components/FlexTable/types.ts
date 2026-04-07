import { CSSProperties, ReactNode } from "react";
import { EntityType, FlowEntity } from "../../api/entities";

export type StyleFn<T> = (value: T) => CSSProperties | undefined;
export type DisplayFn<T> = (value: T) => ReactNode;

/** 副列/副行の再帰定義 */
export interface SubAxis<TValue> {
  value: (entity: FlowEntity) => TValue[];
  display?: DisplayFn<TValue>;
  highlight?: StyleFn<TValue>;
  sub?: SubAxis<unknown>;
}

/** 列定義 */
export interface ColumnDef<TValue = unknown> {
  entityType?: EntityType;
  filter?: Record<string, unknown>;
  value?: (entity?: FlowEntity) => TValue[];
  display?: DisplayFn<TValue>;
  highlight?: StyleFn<TValue>;
  sub?: SubAxis<unknown>;
  contextMenu?: ContextMenuDef;
}

/** セル定義 */
export interface CellDef<TValue = unknown> {
  entityType: EntityType;
  cellValue: (entities: FlowEntity[], rowChain: unknown[], colChain: unknown[]) => TValue;
  display: DisplayFn<TValue>;
  onUpdate?: (entities: FlowEntity[], rowChain: unknown[], colChain: unknown[]) => boolean;
  highlight?: (row: unknown, col: unknown, value: TValue) => CSSProperties | undefined;
  contextMenu?: ContextMenuDef;
}

/** 行定義 */
export interface RowDef<TValue = unknown> {
  entityType?: EntityType;
  filter?: Record<string, unknown>;
  value: (entity?: FlowEntity) => TValue[];
  display?: DisplayFn<TValue>;
  highlight?: StyleFn<TValue>;
  sub?: SubAxis<unknown>;
  cell: CellDef;
  contextMenu?: ContextMenuDef;
}

export interface ContextMenuDef {
  items: ContextMenuItem[];
}

export interface ContextMenuItem {
  label: string;
  action: (params: { rowChain: unknown[]; colChain: unknown[]; entities: FlowEntity[] }) => void;
}

/** FlexTable全体のProps */
export interface FlexTableProps {
  layout?: "stacked" | "overlay";
  columns: ColumnDef[];
  rows: RowDef[];
  /** 全エンティティリスト（Contextから渡す） */
  entities: Record<EntityType, FlowEntity[]>;
}
