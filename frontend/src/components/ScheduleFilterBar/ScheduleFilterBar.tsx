/**
 * ScheduleFilterBar
 * EstimationTable・TaskSchedule 共通のフィルタバーコンポーネント。
 * Project → Sub Project → Phase の階層フィルタ + 対象期間を提供する。
 */
import React from "react";
import { Box, TextField } from "@mui/material";
import { Autocomplete } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { useScheduleFilter } from "../../context/ScheduleFilterContext";
import { useEntities } from "../../context/EntityContext";
import { FlowEntity } from "../../api/entities";

export function ScheduleFilterBar(): JSX.Element {
  const {
    selectedProjectIds, selectedSubProjectIds, selectedPhaseIds,
    rangeStart, rangeEnd,
    setSelectedProjects, setSelectedSubProjects, setSelectedPhases,
    setRangeStart, setRangeEnd,
  } = useScheduleFilter();
  const { getList } = useEntities();

  const projects = getList("Project");
  const allSubProjects = getList("SubProject");
  const allPhases = getList("Phase");

  const selectedProjects = projects.filter((p) => selectedProjectIds.includes(p.id as number));

  // Sub Project: 選択中の Project に紐づくもの
  const subProjectOptions = selectedProjectIds.length > 0
    ? allSubProjects.filter((sp) =>
        selectedProjectIds.includes((sp.project as { id: number } | undefined)?.id as number)
      )
    : allSubProjects;
  const selectedSubProjects = subProjectOptions.filter((sp) =>
    selectedSubProjectIds.includes(sp.id as number)
  );

  // Phase: 選択中の Sub Project に紐づくもの（Sub Project 未選択なら Project で絞る）
  const phaseOptions = selectedSubProjectIds.length > 0
    ? allPhases.filter((ph) =>
        selectedSubProjectIds.includes((ph.sg_sub_project as { id: number } | undefined)?.id as number)
      )
    : selectedProjectIds.length > 0
      ? allPhases.filter((ph) =>
          selectedProjectIds.includes((ph.project as { id: number } | undefined)?.id as number)
        )
      : allPhases;
  const selectedPhases = phaseOptions.filter((ph) =>
    selectedPhaseIds.includes(ph.id as number)
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ pt: 1, pb: 1, px: 1, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        {/* Project */}
        <Autocomplete
          multiple
          size="small"
          sx={{ minWidth: 200 }}
          options={projects}
          getOptionLabel={(option: FlowEntity) => (option.name as string) ?? ""}
          value={selectedProjects}
          onChange={(_e, val) => setSelectedProjects(val)}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => <TextField {...params} label="Project" />}
        />

        {/* Sub Project */}
        <Autocomplete
          multiple
          size="small"
          sx={{ minWidth: 200 }}
          options={subProjectOptions}
          getOptionLabel={(option: FlowEntity) => (option.code as string) ?? (option.name as string) ?? ""}
          value={selectedSubProjects}
          onChange={(_e, val) => setSelectedSubProjects(val)}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => <TextField {...params} label="Sub Project" />}
        />

        {/* Phase */}
        <Autocomplete
          multiple
          size="small"
          sx={{ minWidth: 200 }}
          options={phaseOptions}
          getOptionLabel={(option: FlowEntity) => (option.code as string) ?? ""}
          value={selectedPhases}
          onChange={(_e, val) => setSelectedPhases(val)}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => <TextField {...params} label="Phase" />}
        />

        {/* 対象期間 */}
        <DatePicker
          label="対象期間 開始"
          views={["year", "month"]}
          value={rangeStart ? dayjs(rangeStart) : null}
          onChange={(val) => setRangeStart(val ? val.format("YYYY-MM-DD") : null)}
          slotProps={{ textField: { size: "small" } }}
        />
        <DatePicker
          label="対象期間 終了"
          views={["year", "month"]}
          value={rangeEnd ? dayjs(rangeEnd) : null}
          onChange={(val) => setRangeEnd(val ? val.format("YYYY-MM-DD") : null)}
          slotProps={{ textField: { size: "small" } }}
        />
      </Box>
    </LocalizationProvider>
  );
}
