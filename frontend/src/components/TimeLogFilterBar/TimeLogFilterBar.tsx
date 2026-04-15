/**
 * TimeLogFilterBar
 * TimeLogPage 専用の週単位フィルタバーコンポーネント。
 * 週開始日選択・週末表示切替・ユーザ選択（スタッフのみ）を提供する。
 */
import React from "react";
import { Box, FormControlLabel, Switch, TextField } from "@mui/material";
import { Autocomplete } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { useTimeLogFilter, getWeekStart } from "../../context/TimeLogFilterContext";
import { useSession } from "../../context/SessionContext";
import { useEntities } from "../../context/EntityContext";
import { FlowEntity } from "../../api/entities";

export function TimeLogFilterBar(): JSX.Element {
  const { weekStart, showWeekends, setWeekStart, setShowWeekends, selectedUserId, setSelectedUserId } =
    useTimeLogFilter();
  const { user } = useSession();
  const { getList } = useEntities();

  const users = getList("HumanUser");
  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ mb: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <DatePicker
          label="週開始日"
          value={weekStart ? dayjs(weekStart) : null}
          onChange={(val) => {
            if (val) {
              const dateStr = val.format("YYYY-MM-DD");
              setWeekStart(getWeekStart(dateStr));
            }
          }}
          slotProps={{ textField: { size: "small" } }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={showWeekends}
              onChange={(e) => setShowWeekends(e.target.checked)}
              size="small"
            />
          }
          label="週末を表示"
        />
        {user?.isStaff === true && (
          <Autocomplete
            size="small"
            sx={{ minWidth: 200 }}
            options={users}
            getOptionLabel={(option: FlowEntity) => (option.name as string) ?? String(option.id)}
            value={selectedUser}
            onChange={(_event, newValue: FlowEntity | null) => {
              setSelectedUserId(newValue ? (newValue.id as number) : null);
            }}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => (
              <TextField {...params} label="ユーザ" />
            )}
          />
        )}
      </Box>
    </LocalizationProvider>
  );
}
