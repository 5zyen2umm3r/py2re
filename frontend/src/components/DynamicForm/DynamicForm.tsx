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
      const options = entityList.map((e) => ({
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

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <form onSubmit={handleSubmit((v) => { onSubmit(v); handleClose(); })}>
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
