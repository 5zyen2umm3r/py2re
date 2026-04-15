/**
 * useDynamicForm
 *
 * DynamicForm の表示を統一的に管理するフック。
 *
 * 使い方:
 *   const { formProps, openForm } = useDynamicForm();
 *
 *   // フォームを開く（title・fields・defaultValues・onSubmit をまとめて渡す）
 *   openForm({
 *     title: "タスクを追加",
 *     fields: [...],
 *     defaultValues: { ... },
 *     onSubmit: (values) => { ... },
 *   });
 *
 *   // JSX に展開するだけ
 *   return <><YourContent /><DynamicForm {...formProps} /></>;
 */
import { useState, useCallback } from "react";
import { FieldDef } from "../../types/fieldDef";
import { DynamicFormProps } from "./types";

export interface FormConfig {
  title: string;
  fields: FieldDef[];
  defaultValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
}

export interface UseDynamicFormReturn {
  /** DynamicForm に spread するだけで動作する props */
  formProps: DynamicFormProps;
  /** フォームを開く。config をセットすると open=true になる */
  openForm: (config: FormConfig) => void;
  /** フォームを閉じる */
  closeForm: () => void;
}

export function useDynamicForm(): UseDynamicFormReturn {
  const [config, setConfig] = useState<FormConfig | null>(null);

  const openForm = useCallback((cfg: FormConfig) => {
    setConfig(cfg);
  }, []);

  const closeForm = useCallback(() => {
    setConfig(null);
  }, []);

  const formProps: DynamicFormProps = {
    title: config?.title ?? "",
    fields: config?.fields ?? [],
    defaultValues: config?.defaultValues,
    open: config !== null,
    onClose: closeForm,
    onSubmit: (values) => {
      config?.onSubmit(values);
      closeForm();
    },
  };

  return { formProps, openForm, closeForm };
}
