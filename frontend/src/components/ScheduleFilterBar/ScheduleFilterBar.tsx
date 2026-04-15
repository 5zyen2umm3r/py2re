/**
 * ScheduleFilterBar
 * EstimationTable・TaskSchedule 共通のフィルタバーコンポーネント。
 * プロジェクト複数選択・対象期間開始・終了を提供する。
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
  const { selectedProjectIds, rangeStart, rangeEnd, setSelectedProjects, setRangeStart, setRangeEnd } =
    useScheduleFilter();
  const { getList } = useEntities();

  const projects = getList("Project");
  const selectedProjects = projects.filter((p) => selectedProjectIds.includes(p.id as number));

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ mb: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <Autocomplete
          multiple
          size="small"
          sx={{ minWidth: 240 }}
          options={projects}
          getOptionLabel={(option: FlowEntity) => (option.name as string) ?? ""}
          value={selectedProjects}
          onChange={(_event, newValue: FlowEntity[]) => {
            setSelectedProjects(newValue);
          }}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          renderInput={(params) => (
            <TextField {...params} label="Project" />
          )}
        />
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
