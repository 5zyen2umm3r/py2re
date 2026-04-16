/**
 * プロジェクト別・月次工数集計表
 *
 * 行1: HumanUser × 月次工数合計（160h超で赤文字）
 * 行2: Asset（折りたたみ）
 *   副行: Assetに紐づくEstimationにアサインされているHumanUser
 *     セル: 当該HumanUser × 当該月のEstimation工数
 */
import React, { useCallback, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { FlexTable } from "../components/FlexTable/FlexTable";
import { ColumnDef, RowDef } from "../components/FlexTable/types";
import { DynamicForm } from "../components/DynamicForm/DynamicForm";
import { useDynamicForm } from "../components/DynamicForm/useDynamicForm";
import { FieldDef } from "../components/DynamicForm/types";
import { useEntities } from "../context/EntityContext";
import { useScheduleFilter } from "../context/ScheduleFilterContext";
import { FlowEntity } from "../api/entities";
import { ScheduleFilterBar } from "../components/ScheduleFilterBar/ScheduleFilterBar";
import { buildAssetFilter } from "../utils/assetFilter";

// ---- 月次列 ----
const ALL_MONTHS: Date[] = Array.from({ length: 12 }, (_, i) => new Date(2026, i, 1));

function isSameMonth(dateStr: string | undefined, month: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
}

// 1人月 = 160h
const HOURS_PER_MONTH = 160;

export function EstimationTable() {
  const { state, patch, create, remove, getList, getAll } = useEntities();
  const { selectedProjectIds, selectedSubProjectIds, selectedPhaseIds, rangeStart, rangeEnd } = useScheduleFilter();
  const { formProps, openForm } = useDynamicForm();

  const allPhases = getList("Phase");

  const assetFilter = useMemo(
    () => buildAssetFilter(selectedProjectIds, selectedSubProjectIds, selectedPhaseIds, allPhases),
    [selectedProjectIds, selectedSubProjectIds, selectedPhaseIds, allPhases],
  );

  // 対象期間フィルタで月次列を絞り込む
  const MONTHS = useMemo(() => {
    return ALL_MONTHS.filter((m) => {
      if (rangeStart) {
        const rs = new Date(rangeStart);
        if (m < new Date(rs.getFullYear(), rs.getMonth(), 1)) return false;
      }
      if (rangeEnd) {
        const re = new Date(rangeEnd);
        if (m > new Date(re.getFullYear(), re.getMonth(), 1)) return false;
      }
      return true;
    });
  }, [rangeStart, rangeEnd]);

  const allEntities = useMemo(() => getAll(), [getAll]);

  // ---- フォームフィールド定義ヘルパー ----

  const projectUserOptions = useMemo(() =>
    getList("HumanUser").map((u) => ({ value: u.id, label: u.name as string })),
    [state]
  );

  const estimationFields = useCallback((): FieldDef[] => [
    { name: "project",  label: "Project", type: "entity", entityType: "Project", readonly: true },
    { name: "sg_asset", label: "Asset",   type: "entity", entityType: "Asset",   readonly: true },
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
    label: "ユーザ集計",
    entityType: "HumanUser",
    filter: selectedProjectIds.length > 0
      ? (u) => Array.isArray(u['projects'])
          ? (u['projects'] as { id: number }[]).some((p) => selectedProjectIds.includes(p.id))
          : false
      : undefined,
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
            (selectedProjectIds.length === 0 || selectedProjectIds.includes((e.project as FlowEntity)?.id as number))
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
    label: "工数見積",
    entityType: "Asset",
    filter: assetFilter,
    value: (entity) => entity ? [entity] : [],
    display: (asset) => (asset as FlowEntity)?.code as string ?? "",

    // 副行: Assetに紐づくEstimationにアサインされているHumanUser（重複排除）
    sub: {
      value: (asset: FlowEntity) => {
        const estimations = getList("Estimation").filter(
          (e) => (e.sg_asset as FlowEntity)?.id === asset.id
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
                  (selectedProjectIds.length === 0 || selectedProjectIds.includes((e.project as FlowEntity)?.id as number))
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
              const est = getList("Estimation").find(
                (e) =>
                  (e.sg_asset as FlowEntity)?.id === asset.id &&
                  (e.sg_user  as FlowEntity)?.id === user.id
              );
              if (!est) return;
              openForm({
                title: "Estimationを編集",
                fields: estimationFields(),
                defaultValues: {
                  project:      (est.project   as FlowEntity)?.id,
                  sg_asset:     (est.sg_asset   as FlowEntity)?.id,
                  sg_user:      (est.sg_user    as FlowEntity)?.id,
                  sg_month:     est.sg_month,
                  sg_man_months: Math.round(((est.sg_hours as number) / HOURS_PER_MONTH) * 100) / 100,
                },
                onSubmit: (values) => {
                  patch("Estimation", est.id, {
                    sg_user:  values.sg_user,
                    sg_month: values.sg_month,
                    sg_hours: values.sg_man_months as number,
                  });
                },
              });
            },
          },
        ],
      },

      // 副行のセル定義（HumanUser行にのみ適用）
      cell: {
        entityType: "Estimation",
        cellValue: (estimations, rowChain, colChain) => {
          const [asset, user] = rowChain as FlowEntity[];
          const month = colChain[0] as Date;
          if (!user) return null;
          return estimations.find(
            (e) =>
              (e.sg_asset as FlowEntity)?.id === asset.id &&
              (e.sg_user  as FlowEntity)?.id === user.id &&
              isSameMonth(e.sg_month as string, month)
          ) ?? null;
        },
        display: (est) => est ? `${(est as FlowEntity).sg_hours || 0}h` : "",
        editField: {
          name: "sg_hours",
          label: "工数（人月）",
          type: "number" as const,
          min: 0,
          step: 0.1,
          helperText: `1人月 = ${HOURS_PER_MONTH}h`,
          toDisplay: (h: number) => Math.round((h / HOURS_PER_MONTH) * 100) / 100,
          fromDisplay: (mm: number) => mm * HOURS_PER_MONTH,
        },
        onUpdate: (rowChain, colChain, currentValue, inputValue) => {
          if (currentValue) {
            const est = currentValue as FlowEntity;
            patch("Estimation", est.id, { sg_hours: inputValue as number });
          } else {
            const [asset, user] = rowChain as FlowEntity[];
            const month = colChain[0] as Date;
            create("Estimation", {
              sg_asset:   { type: "Asset", id: asset.id },
              project: asset.project,
              sg_user:    { type: "HumanUser", id: user.id },
              sg_month:   month,
              sg_hours:   inputValue,
            });
          }
          return true;
        },
      },
    },

    // Asset行のContextMenu
    contextMenu: {
      items: [
        {
          label: "Assetを追加",
          action: ({rowChain}) => {
            const refAsset = rowChain.length > 0 ? rowChain[0] as FlowEntity : null;
            const projectId = 
              refAsset ? (refAsset.project as FlowEntity)?.id :
              selectedProjectIds.length > 0 ? selectedProjectIds[0] :
              null;
            const phaseId =
              refAsset ? (refAsset.sg_phase as FlowEntity)?.id :
              selectedPhaseIds.length > 0 ? selectedPhaseIds[0] :
              null;
            openForm({
              title: "Assetを追加",
              fields: [
                { name: "project", label: "Project", type: "entity", entityType: "Project", required: true },
                { name: "sg_phase", label: "Phase", type: "entity", entityType: "Phase", labelField: "code", required: true },
                { name: "code",    label: "Asset名", type: "text", required: true },
                {
                  name: "sg_asset_type", label: "アセットタイプ", type: "select", required: false,
                  options: ["Character", "Prop", "Vehicle", "Environment",
                     "FX"].map((v) => ({ value: v, label: v })),
                },
              ],
              defaultValues: { project: projectId, sg_phase: phaseId },
              onSubmit: (values) => {
                create("Asset", values);
              },
            });
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
        {
          label: "Estimationを追加",
          action: ({ rowChain }) => {
            const asset = rowChain[0] as FlowEntity;
            const assetProject = asset.project
              ? state.Project[(asset.project as { id: number }).id]
              : undefined;
            openForm({
              title: "Estimationを追加",
              fields: estimationFields(),
              defaultValues: {
                project:  assetProject?.id,
                sg_asset: asset.id,
              },
              onSubmit: (values) => {
                create("Estimation", {
                  ...values,
                  sg_hours: values.sg_man_months as number,
                  sg_man_months: undefined,
                });
              },
            });
          },
        },
      ],
    },
  };

  return (
    <Box>
      <ScheduleFilterBar />

      <FlexTable
        columns={columns as ColumnDef[]}
        rows={[rowUsers as RowDef, rowAssets as RowDef]}
        entities={allEntities}
      />

      <DynamicForm {...formProps} />
    </Box>
  );
}
