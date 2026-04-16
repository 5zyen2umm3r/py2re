/**
 * フィールド定義の共通型。
 * DynamicForm と FlexTable のセル編集で共有する。
 */
import { ReactNode } from "react";
import { FlowEntity, EntityType } from "../api/entities";
export type FieldType = "text" | "number" | "select" | "entity" | "date" | "readonly";

interface FieldBase {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** true の場合、フォーム上で読み取り専用表示になる（submit 値には含まれる） */
  readonly?: boolean;
}

export interface TextField extends FieldBase {
  type: "text";
  maxLength?: number;
}

export interface NumberField extends FieldBase {
  type: "number";
  min?: number;
  max?: number;
  step?: number;
  /** 表示用変換（例: 人月→時間）*/
  toDisplay?: (v: number) => number;
  fromDisplay?: (v: number) => number;
  helperText?: string;
}

export interface SelectField extends FieldBase {
  type: "select";
  options: { value: string | number; label: string }[];
}

/** エンティティ参照型: 選択肢をEntityContextから動的に取得 */
export interface EntityField extends FieldBase {
  type: "entity";
  entityType: EntityType;
  /** 選択肢を絞り込むフィルタ関数 */
  filter?: (entity: FlowEntity) => boolean;
  /** 表示ラベルに使うフィールド名（デフォルト: "name"） */
  labelField?: string;
}

export interface DateField extends FieldBase {
  type: "date";
}

export interface ReadonlyField extends FieldBase {
  type: "readonly";
  render?: (value: unknown) => ReactNode;
}

export type FieldDef =
  | TextField
  | NumberField
  | SelectField
  | EntityField
  | DateField
  | ReadonlyField;
