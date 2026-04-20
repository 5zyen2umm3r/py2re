import React, { useRef, useState } from "react";
import "./SettingsPage.css";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import { useSettings, MinUnit, HighlightZone } from "../context/SettingsContext";

const MIN_UNIT_OPTIONS: MinUnit[] = [5, 10, 15, 30, 60];

export function SettingsPage(): JSX.Element {
  const { settings, updateTimeLogSettings, exportSettings, importSettings, clearAllSettings } = useSettings();
  const { timeLog } = settings;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  // --- TimeLog handlers ---

  function handleTimeStartChange(e: React.ChangeEvent<HTMLInputElement>) {
    updateTimeLogSettings({ timeStart: e.target.value });
  }

  function handleTimeEndChange(e: React.ChangeEvent<HTMLInputElement>) {
    updateTimeLogSettings({ timeEnd: e.target.value });
  }

  function handleMinUnitChange(value: MinUnit) {
    updateTimeLogSettings({ minUnit: value });
  }

  function handleZoneChange(index: number, field: keyof HighlightZone, value: string) {
    const zones = timeLog.highlightZones.map((z, i) =>
      i === index ? { ...z, [field]: value } : z
    );
    updateTimeLogSettings({ highlightZones: zones });
  }

  function handleZoneDelete(index: number) {
    const zones = timeLog.highlightZones.filter((_, i) => i !== index);
    updateTimeLogSettings({ highlightZones: zones });
  }

  function handleZoneAdd() {
    const zones = [...timeLog.highlightZones, { start: "09:00", end: "18:00" }];
    updateTimeLogSettings({ highlightZones: zones });
  }

  // --- Export ---

  function handleExport() {
    const json = exportSettings();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "settings.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Import ---

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        importSettings(json);
        setImportError(null);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : String(err));
      }
    };
    reader.readAsText(file);
    // reset so the same file can be re-selected
    e.target.value = "";
  }

  return (
    <Box sx={{ p: 3, maxWidth: 640 }}>
      <Typography variant="h5" gutterBottom>
        設定
      </Typography>

      {/* TimeLog settings group */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          TimeLog 設定
        </Typography>

        <Stack spacing={2}>
          {/* timeStart / timeEnd */}
          <Stack direction="row" spacing={2}>
            <TextField
              label="対象時間帯（開始）"
              type="time"
              value={timeLog.timeStart}
              onChange={handleTimeStartChange}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
              size="small"
            />
            <TextField
              label="対象時間帯（終了）"
              type="time"
              value={timeLog.timeEnd}
              onChange={handleTimeEndChange}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
              size="small"
            />
          </Stack>

          {/* minUnit */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="min-unit-label">最小表示単位</InputLabel>
            <Select
              labelId="min-unit-label"
              label="最小表示単位"
              value={timeLog.minUnit}
              onChange={(e) => handleMinUnitChange(e.target.value as MinUnit)}
            >
              {MIN_UNIT_OPTIONS.map((v) => (
                <MenuItem key={v} value={v}>
                  {v} 分
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* highlightZones */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              強調時間帯
            </Typography>
            <Stack spacing={1}>
              {timeLog.highlightZones.map((zone, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <TextField
                    label="開始"
                    type="time"
                    value={zone.start}
                    onChange={(e) => handleZoneChange(i, "start", e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 300 }}
                    size="small"
                  />
                  <TextField
                    label="終了"
                    type="time"
                    value={zone.end}
                    onChange={(e) => handleZoneChange(i, "end", e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 300 }}
                    size="small"
                  />
                  <IconButton
                    aria-label="削除"
                    size="small"
                    onClick={() => handleZoneDelete(i)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button
                startIcon={<AddIcon />}
                size="small"
                onClick={handleZoneAdd}
                sx={{ alignSelf: "flex-start" }}
              >
                追加
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>

      <Divider sx={{ mb: 2 }} />

      {/* Export / Import */}
      <Stack direction="row" spacing={2} alignItems="center">
        <Button variant="outlined" onClick={handleExport}>
          エクスポート
        </Button>
        <Button variant="outlined" onClick={handleImportClick}>
          インポート
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          aria-label="設定ファイルを選択"
          className="visually-hidden"
          onChange={handleFileChange}
        />
        <Button
          variant="outlined"
          color="warning"
          startIcon={<DeleteSweepIcon />}
          onClick={() => setClearDialogOpen(true)}
        >
          全設定をクリア
        </Button>
      </Stack>

      {importError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {importError}
        </Alert>
      )}

      <Divider sx={{ my: 3 }} />


      {/* 確認ダイアログ */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>全設定をクリアしますか？</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            TimeLog設定・スケジュールフィルタ・粒度設定がすべて初期値にリセットされます。この操作は元に戻せません。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>キャンセル</Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => { setClearDialogOpen(false); clearAllSettings(); }}
          >
            クリア
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
