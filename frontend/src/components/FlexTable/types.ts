import { CSSProperties, ReactNode } from "react";
import { EntityType, FlowEntity } from "../../api/entities";
import { FieldDef } from "../../types/fieldDef";

export type { FieldDef };
export type StyleFn<T> = (value: T) => CSSProperties | undefined;
export type DisplayFn<T> = (value: T) => ReactNode;

export type BarPosition = { colIndex: number; offset: number };

export interface BarDef {
  entityType: EntityType;
  filter?: (entity: FlowEntity, rowChain: unknown[]) => boolean;
  position: (entity: FlowEntity, colChains: unknown[][]) => { start: BarPosition; end: BarPosition };
  onDragStart?: (entity: FlowEntity, rowChain: unknown[], newPosition: BarPosition) => void;
  onDragEnd?: (entity: FlowEntity, rowChain: unknown[], newPosition: BarPosition) => void;
  onDragMove?: (entity: FlowEntity, rowChain: unknown[], newStart: BarPosition, newEnd: BarPosition) => void;
  /** バー中央に表示するラベル（デフォルト） */
  label: (entity: FlowEntity) => ReactNode;
  /** バー左端に左詰めで表示するラベル（省略可） */
  labelStart?: (entity: FlowEntity) => ReactNode;
  /** バー右端に右詰めで表示するラベル（省略可） */
  labelEnd?: (entity: FlowEntity) => ReactNode;
  style?: (entity: FlowEntity) => CSSProperties;
  /** バー上で右クリックした際に表示するコンテキストメニュー（省略可） */
  contextMenu?: BarContextMenuDef;
}

export interface ContextMenuDef {
  items: ContextMenuItem[];
}

export interface ContextMenuItem {
  label: string;
  action?: (params: { rowChain: unknown[]; colChain: unknown[]; entities: FlowEntity[] }) => void;
  subItems?: ContextMenuItem[];
}

/** バー専用コンテキストメニューアイテム（entity = バーに対応するエンティティ） */
export interface BarContextMenuItem {
  label: string;
  action: (params: { entity: FlowEntity; rowChain: unknown[] }) => void;
}

export interface BarContextMenuDef {
  items: BarContextMenuItem[];
}

/** 副列/副行の再帰定義 */
export interface SubAxis<TValue> {
  value: (entity: FlowEntity) => TValue[];
  display?: DisplayFn<TValue>;
  highlight?: StyleFn<TValue>;
  sub?: SubAxis<unknown>;
  /** この副行レベルのContextMenu。上位のContextMenuと統合して表示される */
  contextMenu?: ContextMenuDef;
  /** この副行レベルのセル定義。定義された行にのみ適用される */
  cell?: CellDef;
  /** この副行レベルのガントバー定義 */
  bar?: BarDef;
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
  /**
   * セル編集フィールド定義。
   * 指定するとセルクリックで編集モードに入る。
   * FieldDef の型に応じたインライン入力が表示される。
   */
  editField?: FieldDef;
  /**
   * 編集確定時コールバック。
   * @param rowChain  行チェーン
   * @param colChain  列チェーン
   * @param value     現在のセル値（cellValue の戻り値）
   * @param inputValue ユーザが入力した値（editField の fromDisplay 適用済み）
   * @returns true: 更新成功, false: キャンセル扱い
   */
  onUpdate?: (
    rowChain: unknown[],
    colChain: unknown[],
    value: TValue,
    inputValue: unknown,
  ) => boolean;
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
  /** RowDef（親行）レベルのセル定義。省略時はセルを空白描画 */
  cell?: CellDef;
  /** RowDef（親行）レベルのContextMenu */
  contextMenu?: ContextMenuDef;
  /** RowDef（親行）レベルのガントバー定義 */
  bar?: BarDef;
}

/** FlexTable全体のProps */
export interface FlexTableProps {
  layout?: "stacked" | "overlay";
  columns: ColumnDef[];
  rows: RowDef[];
  entities: Record<EntityType, FlowEntity[]>;
  /** 列ヘッダを縦スクロール時に固定するか（デフォルト: true） */
  stickyHeader?: boolean;
}
