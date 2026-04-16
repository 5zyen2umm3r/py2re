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
  Chip,
  Divider,
  Box,
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

interface EntryRowProps {
  entry: HistoryEntry;
  dimmed?: boolean;
}

function EntryRow({ entry, dimmed }: EntryRowProps) {
  return (
    <TableRow
      sx={{
        opacity: dimmed ? 0.45 : 1,
        backgroundColor: dimmed ? "action.hover" : undefined,
      }}
    >
      <TableCell>{getOperationType(entry)}</TableCell>
      <TableCell>{entry.type}</TableCell>
      <TableCell>{String(entry.id)}</TableCell>
      <TableCell>{getChangedFields(entry)}</TableCell>
      <TableCell>
        {dimmed ? (
          <Chip label="REDO 対象" size="small" variant="outlined" color="warning" />
        ) : (
          <Chip label="確定" size="small" variant="outlined" color="success" />
        )}
      </TableCell>
    </TableRow>
  );
}

export function HistoryPage(): JSX.Element {
  const { pastEntries, futureEntries } = useEntities();

  // past: 新しい順（上が最新）
  const pastFlat: HistoryEntry[] = pastEntries.flat().reverse();
  // future: REDO すると適用される順（先頭が次の REDO 対象）
  const futureFlat: HistoryEntry[] = futureEntries.flat();

  const hasAny = pastFlat.length > 0 || futureFlat.length > 0;

  if (!hasAny) {
    return <Typography sx={{ p: 2 }}>操作履歴はありません</Typography>;
  }

  return (
    <Box sx={{ p: 2 }}>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>操作種別</TableCell>
              <TableCell>エンティティタイプ</TableCell>
              <TableCell>ID</TableCell>
              <TableCell>変更フィールド</TableCell>
              <TableCell>状態</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {/* REDO 対象（薄く表示、上部に配置） */}
            {futureFlat.length > 0 && (
              <>
                {futureFlat.map((entry, idx) => (
                  <EntryRow key={`future-${idx}`} entry={entry} dimmed />
                ))}
                <TableRow>
                  <TableCell colSpan={5} sx={{ p: 0 }}>
                    <Divider sx={{ borderStyle: "dashed", borderColor: "warning.main" }} />
                  </TableCell>
                </TableRow>
              </>
            )}
            {/* 確定済み（past） */}
            {pastFlat.map((entry, idx) => (
              <EntryRow key={`past-${idx}`} entry={entry} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
