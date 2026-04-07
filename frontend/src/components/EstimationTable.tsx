/**
 * 出力例: プロジェクト別・月次工数集計表
 *
 * 行1: HumanUser × 月次工数合計（160h超で赤文字）
 * 行2: Asset > Estimation（工数編集可、ContextMenu付き）
 */
import React, { useState, useCallback } from "react";
import {
  Box, FormControl, InputLabel, Select, MenuItem as MuiMenuItem,
  TextField, Typography,
} from "@mui/material";
import { FlexTable } from "./FlexTable/FlexTable";
import { ColumnDef, RowDef } from "./FlexTable/types";
import { useEntities } from "../context/EntityContext";
import { FlowEntity } from "../api/entities";

// 月次列: 2026/1 〜 2026/12
const MONTHS: Date[] = Array.from({ length: 12 }, (_, i) => new Date(2026, i, 1));

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isSameMonth(dateStr: string | undefined, month: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
}

export function EstimationTable() {
  const { state, patch, create, remove, getList } = useEntities();
  const [selectedProjectId, setSelectedProjectId] = useState<number | "">("");

  const projects = getList("Project");
  const selectedProject = selectedProjectId !== "" ? state.Project[selectedProjectId] : undefined;

  // エンティティリストをFlexTableに渡す形式に変換
  const allEntities = {
    HumanUser: getList("HumanUser"),
    Project: projects,
    Asset: getList("Asset"),
    Task: getList("Task"),
    Phase: getList("Phase"),
    Step: getList("Step"),
    Estimation: getList("Estimation"),
  };

  // ---- 列定義: 月次 ----
  const columns: ColumnDef<Date>[] = [
    {
      value: () => MONTHS,
      display: (month) => (
        <Typography variant="caption" noWrap>
          {month.getFullYear()}/{month.getMonth() + 1}
        </Typography>
      ),
    },
  ];

  // ---- 行1: HumanUser ----
  const userProjectFilter = selectedProject
    ? { "projects.id": selectedProject.id }
    : undefined;

  const rowUsers: RowDef<FlowEntity> = {
    entityType: "HumanUser",
    filter: userProjectFilter,
    value: (entity) => (entity ? [entity] : []),
    display: (user) => (user as FlowEntity)?.name as string ?? "",
    cell: {
      entityType: "Estimation",
      cellValue: (estimations, rowChain, colChain) => {
        const user = rowChain[0] as FlowEntity;
        const month = colChain[0] as Date;
        return estimations
          .filter(
            (e) =>
              (e.sg_user as FlowEntity)?.id === user?.id &&
              isSameMonth(e.sg_month as string, month) &&
              (!selectedProject || (e.sg_project as FlowEntity)?.id === selectedProject.id)
          )
          .reduce((sum, e) => sum + ((e.sg_hours as number) ?? 0), 0);
      },
      display: (value) => (value as number) > 0 ? `${value}h` : "",
      highlight: (_row, _col, value) =>
        (value as number) > 160 ? { color: "red", fontWeight: "bold" } : undefined,
    },
  };

  // ---- 行2: Asset > Estimation ----
  const assetProjectFilter = selectedProject
    ? { "project.id": selectedProject.id }
    : undefined;

  const handleAddEstimation = useCallback(
    ({ rowChain }: { rowChain: unknown[] }) => {
      const asset = rowChain[0] as FlowEntity;
      const hours = prompt("工数(h)を入力してください:");
      const month = prompt("対象月 (YYYY-MM-DD):");
      if (hours && month) {
        create("Estimation", {
          sg_asset: { type: "Asset", id: asset.id },
          sg_project: selectedProject ? { type: "Project", id: selectedProject.id } : undefined,
          sg_hours: parseFloat(hours),
          sg_month: month,
        });
      }
    },
    [create, selectedProject]
  );

  const handleDeleteEstimation = useCallback(
    ({ rowChain }: { rowChain: unknown[] }) => {
      const estimation = rowChain[1] as FlowEntity;
      if (estimation?.id && confirm(`Estimation ${estimation.id} を削除しますか?`)) {
        remove("Estimation", estimation.id);
      }
    },
    [remove]
  );

  const rowAssets: RowDef<FlowEntity> = {
    entityType: "Asset",
    filter: assetProjectFilter,
    value: (entity) => (entity ? [entity] : []),
    display: (asset) => (asset as FlowEntity)?.code as string ?? "",
    sub: {
      value: (asset) =>
        getList("Estimation").filter((e) => (e.sg_asset as FlowEntity)?.id === asset.id),
      display: (est) => `Est#${(est as FlowEntity).id}`,
    },
    cell: {
      entityType: "Estimation",
      cellValue: (_estimations, rowChain, colChain) => {
        const estimation = rowChain[1] as FlowEntity | undefined;
        const month = colChain[0] as Date;
        if (!estimation) return "";
        if (!isSameMonth(estimation.sg_month as string, month)) return "";
        return estimation.sg_hours ?? "";
      },
      display: (value) => (value !== "" ? `${value}h` : ""),
      onUpdate: (estimations, rowChain, colChain) => {
        const estimation = rowChain[1] as FlowEntity | undefined;
        if (!estimation?.id) return false;
        const newVal = prompt("工数(h):", String(estimation.sg_hours ?? ""));
        if (newVal === null) return false;
        patch("Estimation", estimation.id, { sg_hours: parseFloat(newVal) });
        return true;
      },
    },
    contextMenu: {
      items: [
        { label: "Estimationを追加", action: handleAddEstimation },
        { label: "このEstimationを削除", action: handleDeleteEstimation },
      ],
    },
  };

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
              <MuiMenuItem key={p.id} value={p.id}>
                {p.name as string}
              </MuiMenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <FlexTable
        columns={columns as ColumnDef[]}
        rows={[rowUsers as RowDef, rowAssets as RowDef]}
        entities={allEntities}
      />
    </Box>
  );
}
