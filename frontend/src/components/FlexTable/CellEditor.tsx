/**
 * CellEditor: FlexTableのインラインセル編集コンポーネント
 * FieldDef の型に応じた入力UIを表示し、確定/キャンセルを通知する。
 */
// @ts-nocheck -- 依存パッケージ(@mui/x-date-pickers, dayjs)はnpm install後に解消
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  TextField, Select, MenuItem, ClickAwayListener, Box,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { FieldDef, NumberField, EntityField } from "../../types/fieldDef";
import { useEntities } from "../../context/EntityContext";

interface CellEditorProps {
  fieldDef: FieldDef;
  initialValue: unknown;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}

export function CellEditor({ fieldDef, initialValue, onCommit, onCancel }: CellEditorProps) {
  const { getList } = useEntities();

  // 表示値に変換（NumberFieldのtoDisplay対応）
  const toDisplay = (fieldDef.type === "number" && (fieldDef as NumberField).toDisplay)
    ? (fieldDef as NumberField).toDisplay!
    : (v: unknown) => v;
  const fromDisplay = (fieldDef.type === "number" && (fieldDef as NumberField).fromDisplay)
    ? (fieldDef as NumberField).fromDisplay!
    : (v: unknown) => v;

  const [inputVal, setInputVal] = useState<unknown>(() => toDisplay(initialValue as number));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const commit = useCallback(() => {
    onCommit(fromDisplay(inputVal as number));
  }, [inputVal, onCommit, fromDisplay]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") onCancel();
  };

  if (fieldDef.type === "readonly") return null;

  if (fieldDef.type === "select") {
    return (
      <ClickAwayListener onClickAway={commit}>
        <Select
          value={inputVal ?? ""}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          size="small"
          autoFocus
          open
          onClose={commit}
          sx={{ minWidth: 120, fontSize: "inherit" }}
        >
          {fieldDef.options.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </Select>
      </ClickAwayListener>
    );
  }

  if (fieldDef.type === "entity") {
    const ef = fieldDef as EntityField;
    const options = getList(ef.entityType);
    const labelField = ef.labelField ?? "name";
    return (
      <ClickAwayListener onClickAway={commit}>
        <Select
          value={(inputVal as { id: number })?.id ?? inputVal ?? ""}
          onChange={(e) => {
            const found = options.find((o) => o.id === e.target.value);
            setInputVal(found ? { type: ef.entityType, id: found.id } : e.target.value);
          }}
          onKeyDown={handleKeyDown}
          size="small"
          autoFocus
          open
          onClose={commit}
          sx={{ minWidth: 120, fontSize: "inherit" }}
        >
          {options.map((opt) => (
            <MenuItem key={opt.id} value={opt.id}>{opt[labelField] as string}</MenuItem>
          ))}
        </Select>
      </ClickAwayListener>
    );
  }

  if (fieldDef.type === "date") {
    return (
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <ClickAwayListener onClickAway={commit}>
          <Box>
            <DatePicker
              value={inputVal ? dayjs(inputVal as string) : null}
              onChange={(val) => setInputVal(val ? val.format("YYYY-MM-DD") : null)}
              onAccept={() => commit()}
              slotProps={{
                textField: {
                  size: "small",
                  autoFocus: true,
                  onKeyDown: handleKeyDown,
                  sx: { width: 140, fontSize: "inherit" },
                },
              }}
            />
          </Box>
        </ClickAwayListener>
      </LocalizationProvider>
    );
  }

  // text / number
  const nf = fieldDef.type === "number" ? (fieldDef as NumberField) : null;
  return (
    <ClickAwayListener onClickAway={commit}>
      <TextField
        inputRef={inputRef}
        value={inputVal ?? ""}
        onChange={(e) => setInputVal(fieldDef.type === "number" ? parseFloat(e.target.value) : e.target.value)}
        onKeyDown={handleKeyDown}
        type={fieldDef.type === "number" ? "number" : "text"}
        size="small"
        variant="standard"
        inputProps={{
          step: nf?.step ?? 0.1,
          min: nf?.min,
          max: nf?.max,
          maxLength: fieldDef.type === "text" ? fieldDef.maxLength : undefined,
        }}
        sx={{ width: fieldDef.type === "number" ? 80 : 140, fontSize: "inherit" }}
      />
    </ClickAwayListener>
  );
}
