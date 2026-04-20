import { FieldDef } from "../types/fieldDef";
export const HOURS_PER_MONTH = 160;
export const TaskFields: FieldDef[] = [
    { name: 'project', label: 'プロジェクト', type: 'entity' as const, entityType: 'Project' as const, labelField: 'name', readonly: true },
    { name: 'entity', label: 'アセット', type: 'entity' as const, entityType: 'Asset' as const, labelField: 'code', readonly: true },
    { name: 'content', label: 'タスク名', type: 'text' as const, required: true },
    { name: 'start_date', label: '開始日', type: 'date' as const, required: true },
    { name: 'due_date', label: '期限日', type: 'date' as const, required: true },
    { name: 'task_assignees', label: '担当ユーザ', type: 'multi_entity' as const, entityType: 'HumanUser' as const, labelField: 'name', required: false },
    { name: 'sg_work_category', label: 'カテゴリ', type: 'entity' as const, entityType: 'Category' as const, labelField: 'code', readonly: true },                
];

const AssetTypes = ["Character", "Prop", "Vehicle", "Environment", "FX"]
export const AssetFields :FieldDef[] = [
    { name: "project", label: "Project", type: "entity", entityType: "Project", required: true },
    { name: "sg_phase", label: "Phase", type: "entity", entityType: "Phase", labelField: "code", required: true },
    { name: "code",    label: "Asset名", type: "text", required: true },
    { name: "sg_asset_type", label: "アセットタイプ", type: "select", required: false, options: AssetTypes.map((v) => ({ value: v, label: v })) }
];

export const EstimationFields : FieldDef[] = [
    { name: "project",  label: "Project", type: "entity", entityType: "Project", readonly: true },
    { name: "sg_asset", label: "Asset",   type: "entity", entityType: "Asset",   readonly: true },
    { name: "sg_user", label: "Assign To", type: "entity", entityType: "HumanUser", required: true },
    { name: "sg_month", label: "月", type: "date", required: true },
    {
      name: "sg_man_months", label: "工数（人月）", type: "number", required: true,
      min: 0, step: 0.1,
      helperText: `1人月 = ${HOURS_PER_MONTH}h`,
      toDisplay: (h: number) => Math.round((h / HOURS_PER_MONTH) * 100) / 100,
      fromDisplay: (mm: number) => mm * HOURS_PER_MONTH,
    },
];