import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
} from "@mui/material";
import { useEntities, HistoryEntry } from "../context/EntityContext";

function getOperationType(entry: HistoryEntry): string {
  if (entry.before === undefined) return "作成";
  if (entry.after === undefined) return "削除";
  return "更新";
}

function getChangedFields(entry: HistoryEntry): string {
  if (entry.before === undefined || entry.after === undefined) return "";
  const after = entry.after as any;
  const before = entry.before as any;
  return Object.keys(after)
    .filter((k) => after[k] !== before[k])
    .join(", ");
}

export function HistoryPage(): JSX.Element {
  const { pastEntries } = useEntities();

  const flatEntries: HistoryEntry[] = pastEntries.flat().reverse();

  if (flatEntries.length === 0) {
    return (
      <Typography sx={{ p: 2 }}>操作履歴はありません</Typography>
    );
  }

  return (
    <TableContainer component={Paper} sx={{ p: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>操作種別</TableCell>
            <TableCell>エンティティタイプ</TableCell>
            <TableCell>ID</TableCell>
            <TableCell>変更フィールド</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {flatEntries.map((entry, idx) => (
            <TableRow key={idx}>
              <TableCell>{getOperationType(entry)}</TableCell>
              <TableCell>{entry.type}</TableCell>
              <TableCell>{String(entry.id)}</TableCell>
              <TableCell>{getChangedFields(entry)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
