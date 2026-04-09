import { ReactNode } from "react";

/** フィールドの基本型 */
export type FieldType = "text" | "number" | "select" | "date" | "readonly";

interface FieldBase {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

export interface TextField extends FieldBase { type: "text"; }
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
export interface DateField extends FieldBase { type: "date"; }
export interface ReadonlyField extends FieldBase {
  type: "readonly";
  render?: (value: unknown) => ReactNode;
}

export type FieldDef = TextField | NumberField | SelectField | DateField | ReadonlyField;

export interface DynamicFormProps {
  title: string;
  fields: FieldDef[];
  defaultValues?: Record<string, unknown>;
  open: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}
