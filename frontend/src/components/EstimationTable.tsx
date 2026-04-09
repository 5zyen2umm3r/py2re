/**
 * プロジェクト別・月次工数集計表
 *
 * 行1: HumanUser × 月次工数合計（160h超で赤文字）
 * 行2: Asset（折りたたみ）
 *   副行: Assetに紐づくEstimationにアサインされているHumanUser
 *     セル: 当該HumanUser × 当該月のEstimation工数
 */
import React, { useState, useCallback, useMemo } from "react";
import {
  Box, FormControl, InputLabel, Select, MenuItem as MuiMenuItem, Typography,
} from "@mui/material";
import { FlexTable } from "./FlexTable/FlexTable";
import { ColumnDef, RowDef } from "./FlexTable/types";
import { DynamicForm } from "./DynamicForm/DynamicForm";
import { FieldDef } from "./DynamicForm/types";
import { useEntities } from "../context/EntityContext";
import { FlowEntity } from "../api/entities";

// ---- 月次列 ----
const MONTHS: Date[] = Array.from({ length: 12 }, (_, i) => new Date(2026, i, 1));

function isSameMonth(dateStr: string | undefined, month: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
}

// 1人月 = 160h
const HOURS_PER_MONTH = 160;

// ---- フォーム状態型 ----
type FormMode =
  | { type: "addEstimation"; asset: FlowEntity }
  | { type: "editEstimation"; estimation: FlowEntity }
  | { type: "addAsset"; project: FlowEntity }
  | null;

export function EstimationTable() {
  const { state, patch, create, remove, getList } = useEntities();
  const [selectedProjectId, setSelectedProjectId] = useState<number | "">("");
  const [formMode, setFormMode] = useState<FormMode>(null);

  const projects = getList("Project");
  const selectedProject = selectedProjectId !== "" ? state.Project[selectedProjectId] : undefined;

  const allEntities = useMemo(() => ({
    HumanUser: getList("HumanUser"),
    Project: projects,
    Asset: getList("Asset"),
    Task: getList("Task"),
    Phase: getList("Phase"),
    Step: getList("Step"),
    Estimation: getList("Estimation"),
  }), [state]);

  // ---- フォームフィールド定義 ----

  const projectUserOptions = useMemo(() =>
    getList("HumanUser").map((u) => ({ value: u.id, label: u.name as string })),
    [state]
  );

  const estimationFields = useCallback((asset: FlowEntity, project?: FlowEntity): FieldDef[] => [
    { name: "sg_project", label: "Project", type: "readonly", render: () => (project?.name as string) ?? "-" },
    { name: "sg_asset",   label: "Asset",   type: "readonly", render: () => (asset.code as string) ?? "-" },
    {
      name: "sg_user", label: "Assign To", type: "select", required: true,
      options: projectUserOptions,
    },
    { name: "sg_month", label: "月", type: "date", required: true },
    {
      name: "sg_man_months", label: "工数（人月）", type: "number", required: true,
      min: 0, step: 0.1,
      helperText: `1人月 = ${HOURS_PER_MONTH}h`,
      toDisplay: (h: number) => Math.round((h / HOURS_PER_MONTH) * 100) / 100,
      fromDisplay: (mm: number) => mm * HOURS_PER_MONTH,
    },
  ], [projectUserOptions]);

  const assetFields = useCallback((project?: FlowEntity): FieldDef[] => [
    { name: "project", label: "Project", type: "readonly", render: () => (project?.name as string) ?? "-" },
    { name: "code",    label: "Asset名", type: "text", required: true },
    {
      name: "sg_asset_type", label: "アセットタイプ", type: "select", required: false,
      options: ["Character", "Prop", "Vehicle", "Environment", "FX"].map((v) => ({ value: v, label: v })),
    },
  ], []);

  // ---- フォーム送信 ----

  const handleFormSubmit = useCallback((values: Record<string, unknown>) => {
    if (!formMode) return;

    if (formMode.type === "addEstimation") {
      create("Estimation", {
        sg_asset:   { type: "Asset",   id: formMode.asset.id },
        sg_project: selectedProject ? { type: "Project", id: selectedProject.id } : undefined,
        sg_user:    { type: "HumanUser", id: values.sg_user },
        sg_month:   values.sg_month,
        sg_hours:   values.sg_man_months as number,  // fromDisplay済み
      });
    } else if (formMode.type === "editEstimation") {
      patch("Estimation", formMode.estimation.id, {
        sg_user:  { type: "HumanUser", id: values.sg_user },
        sg_month: values.sg_month,
        sg_hours: values.sg_man_months as number,
      });
    } else if (formMode.type === "addAsset") {
      create("Asset", {
        code:          values.code,
        sg_asset_type: values.sg_asset_type,
        project:       { type: "Project", id: formMode.project.id },
      });
    }
    setFormMode(null);
  }, [formMode, selectedProject, create, patch]);

  // ---- 列定義 ----
  const columns: ColumnDef<Date>[] = [{
    value: () => MONTHS,
    display: (month) => (
      <Typography variant="caption" noWrap>
        {month.getFullYear()}/{month.getMonth() + 1}
      </Typography>
    ),
  }];

  // ---- 行1: HumanUser ----
  const rowUsers: RowDef<FlowEntity> = {
    entityType: "HumanUser",
    filter: selectedProject ? { "projects.id": selectedProject.id } : undefined,
    value: (entity) => entity ? [entity] : [],
    display: (user) => (user as FlowEntity)?.name as string ?? "",
    cell: {
      entityType: "Estimation",
      cellValue: (estimations, rowChain, colChain) => {
        const user  = rowChain[0] as FlowEntity;
        const month = colChain[0] as Date;
        return estimations
          .filter((e) =>
            (e.sg_user as FlowEntity)?.id === user?.id &&
            isSameMonth(e.sg_month as string, month) &&
            (!selectedProject || (e.sg_project as FlowEntity)?.id === selectedProject.id)
          )
          .reduce((sum, e) => sum + ((e.sg_hours as number) ?? 0), 0);
      },
      display: (value) => (value as number) > 0 ? `${value}h` : "",
      highlight: (_r, _c, value) =>
        (value as number) > HOURS_PER_MONTH ? { color: "red", fontWeight: "bold" } : undefined,
    },
  };

  // ---- 行2: Asset > HumanUser（副行） ----
  const rowAssets: RowDef<FlowEntity> = {
    entityType: "Asset",
    filter: selectedProject ? { "project.id": selectedProject.id } : undefined,
    value: (entity) => entity ? [entity] : [],
    display: (asset) => (asset as FlowEntity)?.code as string ?? "",

    // 副行: Assetに紐づくEstimationにアサインされているHumanUser（重複排除）
    sub: {
      value: (asset: FlowEntity) => {
        const estimations = getList("Estimation").filter(
          (e) => (e.sg_asset as FlowEntity)?.id === asset.id &&
                 (!selectedProject || (e.sg_project as FlowEntity)?.id === selectedProject.id)
        );
        const userIds = [...new Set(estimations.map((e) => (e.sg_user as FlowEntity)?.id).filter(Boolean))];
        return userIds.map((uid) => state.HumanUser[uid]).filter(Boolean) as FlowEntity[];
      },
      display: (user) => (user as FlowEntity)?.name as string ?? "",

      // 副行のContextMenu: HumanUser単位でEstimationを削除
      contextMenu: {
        items: [
          {
            label: "このユーザのEstimationを削除",
            action: ({ rowChain }) => {
              const asset = rowChain[0] as FlowEntity;
              const user  = rowChain[1] as FlowEntity;
              if (!user?.id) return;
              const targets = getList("Estimation").filter(
                (e) =>
                  (e.sg_asset as FlowEntity)?.id === asset.id &&
                  (e.sg_user  as FlowEntity)?.id === user.id &&
                  (!selectedProject || (e.sg_project as FlowEntity)?.id === selectedProject.id)
              );
              if (targets.length === 0) return;
              if (confirm(`${(user.name as string)} の Estimation ${targets.length}件を削除しますか?`)) {
                targets.forEach((e) => remove("Estimation", e.id));
              }
            },
          },
          {
            label: "Estimationを編集",
            action: ({ rowChain }) => {
              const asset = rowChain[0] as FlowEntity;
              const user  = rowChain[1] as FlowEntity;
              // 最初の1件を編集対象とする（複数ある場合は先頭）
              const est = getList("Estimation").find(
                (e) =>
                  (e.sg_asset as FlowEntity)?.id === asset.id &&
                  (e.sg_user  as FlowEntity)?.id === user.id
              );
              if (est) setFormMode({ type: "editEstimation", estimation: est });
            },
          },
        ],
      },
    },

    // セル: 当該HumanUser × 当該月のEstimation工数
    cell: {
      entityType: "Estimation",
      cellValue: (estimations, rowChain, colChain) => {
        const asset = rowChain[0] as FlowEntity;
        const user  = rowChain[1] as FlowEntity | undefined;
        const month = colChain[0] as Date;
        if (!user) return "";
        const est = estimations.find(
          (e) =>
            (e.sg_asset as FlowEntity)?.id === asset.id &&
            (e.sg_user  as FlowEntity)?.id === user.id &&
            isSameMonth(e.sg_month as string, month)
        );
        return est ? (est.sg_hours as number) : "";
      },
      display: (value) => value !== "" ? `${value}h` : "",
    },

    // Asset行のContextMenu
    contextMenu: {
      items: [
        {
          label: "Assetを追加",
          action: () => {
            if (selectedProject) setFormMode({ type: "addAsset", project: selectedProject });
          },
        },
        {
          label: "Estimationを追加",
          action: ({ rowChain }) => {
            const asset = rowChain[0] as FlowEntity;
            setFormMode({ type: "addEstimation", asset });
          },
        },
        {
          label: "Assetを削除",
          action: ({ rowChain }) => {
            const asset = rowChain[0] as FlowEntity;
            if (asset?.id && confirm(`Asset "${asset.code}" を削除しますか?`)) {
              remove("Asset", asset.id);
            }
          },
        },
      ],
    },
  };

  // ---- フォーム設定の解決 ----
  const formConfig = useMemo(() => {
    if (!formMode) return null;
    if (formMode.type === "addEstimation") {
      return {
        title: "Estimationを追加",
        fields: estimationFields(formMode.asset, selectedProject),
        defaultValues: {
          sg_project: selectedProject?.id,
          sg_asset:   formMode.asset.id,
        },
      };
    }
    if (formMode.type === "editEstimation") {
      const est = formMode.estimation;
      return {
        title: "Estimationを編集",
        fields: estimationFields(
          state.Asset[(est.sg_asset as FlowEntity)?.id] ?? {} as FlowEntity,
          selectedProject
        ),
        defaultValues: {
          sg_project:    (est.sg_project as FlowEntity)?.id,
          sg_asset:      (est.sg_asset   as FlowEntity)?.id,
          sg_user:       (est.sg_user    as FlowEntity)?.id,
          sg_month:      est.sg_month,
          sg_man_months: Math.round(((est.sg_hours as number) / HOURS_PER_MONTH) * 100) / 100,
        },
      };
    }
    if (formMode.type === "addAsset") {
      return {
        title: "Assetを追加",
        fields: assetFields(formMode.project),
        defaultValues: { project: formMode.project.id },
      };
    }
    return null;
  }, [formMode, selectedProject, state, estimationFields, assetFields]);

  return (
    <Box>
      {/* Project選択 */}
      <Box sx={{ mb: 2, maxWidth: 320 }}>
        <FormControl fullWidth size="small">
          <InputLabel>Project</InputLabel>
          <Select
            value={selectedProjectId}
            label="Project"
            onChange={(e) => setSelectedProjectId(e.target.value as number | "")}
          >
            <MuiMenuItem value="">（全て）</MuiMenuItem>
            {projects.map((p) => (
              <MuiMenuItem key={p.id} value={p.id}>{p.name as string}</MuiMenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <FlexTable
        columns={columns as ColumnDef[]}
        rows={[rowUsers as RowDef, rowAssets as RowDef]}
        entities={allEntities}
      />

      {/* 汎用フォームダイアログ */}
      {formConfig && (
        <DynamicForm
          title={formConfig.title}
          fields={formConfig.fields}
          defaultValues={formConfig.defaultValues}
          open={!!formMode}
          onClose={() => setFormMode(null)}
          onSubmit={handleFormSubmit}
        />
      )}
    </Box>
  );
}
