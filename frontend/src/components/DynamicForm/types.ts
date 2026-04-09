export type {
  FieldType,
  FieldDef,
  TextField,
  NumberField,
  SelectField,
  EntityField,
  DateField,
  ReadonlyField,
} from "../../types/fieldDef";
import { FieldDef } from "../../types/fieldDef";

export interface DynamicFormProps {
  title: string;
  fields: FieldDef[];
  defaultValues?: Record<string, unknown>;
  open: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}
