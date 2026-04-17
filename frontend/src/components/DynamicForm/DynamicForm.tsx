/**
 * DynamicForm: フィールド定義ベースの汎用フォームダイアログ
 * react-hook-form + MUI + @mui/x-date-pickers
 */
// @ts-nocheck -- 依存パッケージ(react-hook-form, @mui/x-date-pickers, dayjs)はnpm install後に解消
import React from "react";
import { useForm, Controller } from "react-hook-form";
import type { Control } from "react-hook-form";import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField as MuiTextField, MenuItem, Typography, Stack,
  InputLabel, FormControl, Select, OutlinedInput, Chip, Box,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { DynamicFormProps, FieldDef, NumberField } from "./types";
import { useEntities } from "../../context/EntityContext";

function FieldRenderer({
  field,
  control,
}: {
  field: FieldDef;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
}) {
  // entity フィールド用にエンティティリストを取得
  const { getList } = useEntities();

  // readonly フラグが立っている場合はラベル+値の読み取り専用表示
  if (field.readonly) {
    // entity 型は labelField でラベルを解決して表示
    if (field.type === "entity") {
      const entityList = getList(field.entityType);
      const labelField = field.labelField ?? "name";
      return (
        <Controller
          name={field.name}
          control={control}
          render={({ field: f }) => {
            const entity = entityList.find((e) => e.id === f.value);
            const label = entity ? String(entity[labelField] ?? entity.id) : String(f.value ?? "—");
            return (
              <Stack spacing={0.5}>
                <Typography variant="caption" color="text.secondary">{field.label}</Typography>
                <Typography variant="body2">{label}</Typography>
              </Stack>
            );
          }}
        />
      );
    }
    // その他の型は値をそのまま文字列表示
    return (
      <Controller
        name={field.name}
        control={control}
        render={({ field: f }) => (
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">{field.label}</Typography>
            <Typography variant="body2">{String(f.value ?? "—")}</Typography>
          </Stack>
        )}
      />
    );
  }

  switch (field.type) {
    case "readonly":
      return (
        <Controller
          name={field.name}
          control={control}
          render={({ field: f }) => (
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">{field.label}</Typography>
              <Typography variant="body2">
                {field.render ? field.render(f.value) : String(f.value ?? "")}
              </Typography>
            </Stack>
          )}
        />
      );

    case "select":
      return (
        <Controller
          name={field.name}
          control={control}
          rules={{ required: field.required }}
          render={({ field: f, fieldState }) => (
            <MuiTextField
              {...f}
              select
              label={field.label}
              size="small"
              fullWidth
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
            >
              {field.options.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </MuiTextField>
          )}
        />
      );

    case "entity": {
      const entityList = getList(field.entityType);
      const labelField = field.labelField ?? "name";
      const filteredList = field.filter ? entityList.filter(field.filter) : entityList;
      const options = filteredList.map((e) => ({
        value: e.id,
        label: String(e[labelField] ?? e.id),
      }));
      return (
        <Controller
          name={field.name}
          control={control}
          rules={{ required: field.required }}
          render={({ field: f, fieldState }) => (
            <MuiTextField
              {...f}
              select
              label={field.label}
              size="small"
              fullWidth
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
            >
              {options.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </MuiTextField>
          )}
        />
      );
    }

    case "multi_entity": {
      const entityList = getList(field.entityType);
      const labelField = field.labelField ?? "name";
      const filteredList = field.filter ? entityList.filter(field.filter) : entityList;
      const optionMap = new Map(filteredList.map((e) => [e.id, String(e[labelField] ?? e.id)]));
      return (
        <Controller
          name={field.name}
          control={control}
          rules={{ required: field.required }}
          render={({ field: f, fieldState }) => {
            const selectedIds: number[] = Array.isArray(f.value) ? f.value : [];
            return (
              <FormControl size="small" fullWidth error={!!fieldState.error}>
                <InputLabel>{field.label}</InputLabel>
                <Select
                  multiple
                  value={selectedIds}
                  onChange={(e) => f.onChange(e.target.value)}
                  input={<OutlinedInput label={field.label} />}
                  renderValue={(selected) => (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {(selected as number[]).map((id) => (
                        <Chip key={id} label={optionMap.get(id) ?? id} size="small" />
                      ))}
                    </Box>
                  )}
                >
                  {filteredList.map((e) => (
                    <MenuItem key={e.id} value={e.id}>
                      {String(e[labelField] ?? e.id)}
                    </MenuItem>
                  ))}
                </Select>
                {fieldState.error && (
                  <Typography variant="caption" color="error">{fieldState.error.message}</Typography>
                )}
              </FormControl>
            );
          }}
        />
      );
    }

    case "date":
      return (
        <Controller
          name={field.name}
          control={control}
          rules={{ required: field.required }}
          render={({ field: f, fieldState }) => (
            <DatePicker
              label={field.label}
              value={f.value ? dayjs(f.value as string) : null}
              onChange={(val: Dayjs | null) => f.onChange(val ? val.format("YYYY-MM-DD") : null)}
              slotProps={{
                textField: {
                  size: "small",
                  fullWidth: true,
                  error: !!fieldState.error,
                  helperText: fieldState.error?.message,
                },
              }}
            />
          )}
        />
      );

    case "number": {
      const nf = field as NumberField;
      return (
        <Controller
          name={field.name}
          control={control}
          rules={{ required: field.required, min: nf.min, max: nf.max }}
          render={({ field: f, fieldState }) => {
            const displayVal = nf.toDisplay ? nf.toDisplay(f.value as number) : f.value;
            return (
              <MuiTextField
                label={field.label}
                type="number"
                size="small"
                fullWidth
                value={displayVal ?? ""}
                onChange={(e) => {
                  const raw = parseFloat(e.target.value);
                  f.onChange(nf.fromDisplay ? nf.fromDisplay(raw) : raw);
                }}
                inputProps={{ step: nf.step ?? 0.01, min: nf.min, max: nf.max }}
                error={!!fieldState.error}
                helperText={fieldState.error?.message ?? nf.helperText}
              />
            );
          }}
        />
      );
    }

    default:
      return (
        <Controller
          name={field.name}
          control={control}
          rules={{ required: field.required }}
          render={({ field: f, fieldState }) => (
            <MuiTextField
              {...f}
              label={field.label}
              size="small"
              fullWidth
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
            />
          )}
        />
      );
  }
}

export function DynamicForm({ title, fields, defaultValues, open, onClose, onSubmit }: DynamicFormProps) {
  const { control, handleSubmit, reset } = useForm({ defaultValues: defaultValues ?? {} });

  // defaultValuesが変わったらフォームをリセット
  React.useEffect(() => {
    if (open) reset(defaultValues ?? {});
  }, [open, defaultValues, reset]);

  const handleClose = () => { reset(); onClose(); };

  // entity / multi_entity フィールドの値（ID）を { type, id } 参照オブジェクトに変換してから onSubmit へ渡す
  const handleFormSubmit = (rawValues: Record<string, unknown>) => {
    const converted: Record<string, unknown> = { ...rawValues };
    for (const field of fields) {
      if (field.type === "entity") {
        const id = rawValues[field.name];
        if (id !== null && id !== undefined && id !== "") {
          converted[field.name] = { type: field.entityType, id };
        } else {
          converted[field.name] = undefined;
        }
      } else if (field.type === "multi_entity") {
        const ids = rawValues[field.name];
        if (Array.isArray(ids)) {
          converted[field.name] = ids.map((id) => ({ type: field.entityType, id }));
        } else {
          converted[field.name] = [];
        }
      }
    }
    onSubmit(converted);
    handleClose();
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              {fields.map((f) => (
                <FieldRenderer key={f.name} field={f} control={control} />
              ))}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>キャンセル</Button>
            <Button type="submit" variant="contained">保存</Button>
          </DialogActions>
        </form>
      </Dialog>
    </LocalizationProvider>
  );
}
