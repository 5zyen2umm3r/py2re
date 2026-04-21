/**
 * EntityBrowser: EntityContextにキャッシュされたエンティティを閲覧・編集するページ。
 * EntityTypeごとにタブで切り替え、各エンティティのフィールドをテーブル表示する。
 * 追加・編集・削除をサポートする。
 */
import React, { useMemo, useState, useCallback } from "react";
import {
  Box, Tab, Tabs, Typography, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TableSortLabel, TablePagination, Paper, Chip, Tooltip,
  IconButton, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { useEntities } from "../context/EntityContext";
import { EntityType, FlowEntity } from "../api/entities";
import { DynamicForm } from "../components/DynamicForm/DynamicForm";
import { FieldDef } from "../components/DynamicForm/types";
import { useDynamicForm } from "../components/DynamicForm/useDynamicForm";
import { TypedFields } from "./fields";

const ENTITY_TYPES: EntityType[] = [
  "HumanUser", "Project", "SubProject", "Phase", "Asset", "Task", "Step", "Estimation", "Category"
];

// ---- フィールド値の表示ヘルパー ----

function renderValue(val: unknown): React.ReactNode {
  if (val === null || val === undefined) return <Typography variant="caption" color="text.disabled">—</Typography>;
  if (typeof val === "boolean") return <Chip label={String(val)} size="small" variant="outlined" />;
  if (typeof val === "object") {
    if ("id" in (val as object)) {
      const ref = val as { type?: string; id: number; name?: string; code?: string };
      const label = ref.name ?? ref.code ?? `#${ref.id}`;
      return (
        <Tooltip title={`${ref.type ?? ""}:${ref.id}`}>
          <Chip label={label} size="small" color="primary" variant="outlined" />
        </Tooltip>
      );
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return <Typography variant="caption" color="text.disabled">[]</Typography>;
      return (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {(val as unknown[]).slice(0, 5).map((v, i) => (
            <React.Fragment key={i}>{renderValue(v)}</React.Fragment>
          ))}
          {val.length > 5 && <Chip label={`+${val.length - 5}`} size="small" />}
        </Box>
      );
    }
    return <Typography variant="caption">{JSON.stringify(val)}</Typography>;
  }
  return String(val);
}

// ---- カラム収集 ----

function collectColumns(entities: FlowEntity[]): string[] {
  const keys = new Set<string>();
  for (const e of entities.slice(0, 50)) {
    Object.keys(e).forEach((k) => keys.add(k));
  }
  const sorted = [...keys].filter((k) => k !== "id").sort();
  return ["id", ...sorted];
}

// ---- ソートロジック ----

type Order = "asc" | "desc";

function sortEntities(entities: FlowEntity[], col: string, order: Order): FlowEntity[] {
  return [...entities].sort((a, b) => {
    const av = a[col];
    const bv = b[col];
    const aStr = av === null || av === undefined ? "" : typeof av === "object" ? JSON.stringify(av) : String(av);
    const bStr = bv === null || bv === undefined ? "" : typeof bv === "object" ? JSON.stringify(bv) : String(bv);
    const cmp = aStr.localeCompare(bStr, undefined, { numeric: true });
    return order === "asc" ? cmp : -cmp;
  });
}

// ---- フィールド定義の動的生成 ----
// エンティティのフィールドから DynamicForm 用の FieldDef を生成する

function buildFieldDefs(columns: string[], entity?: FlowEntity): FieldDef[] {
  return columns
    .filter((col) => col !== "id" && col !== "type")
    .map((col): FieldDef => {
      const val = entity?.[col];
      // 日付フィールドの推定
      if (col.endsWith("_date") || col === "sg_month") {
        return { name: col, label: col, type: "date" };
      }
      // 数値フィールドの推定
      if (typeof val === "number" || col.endsWith("_hours") || col.endsWith("_months")) {
        return { name: col, label: col, type: "number", step: 0.01 };
      }
      // オブジェクト参照（エンティティ参照）はテキストで表示
      if (val !== null && val !== undefined && typeof val === "object" && !Array.isArray(val)) {
        return { name: col, label: col, type: "text" };
      }
      return { name: col, label: col, type: "text" };
    });
}

// ---- エンティティテーブル ----

function EntityTable({ entityType }: { entityType: EntityType }) {
  const { getList, patch, create, remove } = useEntities();
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("id");
  const [sortOrder, setSortOrder] = useState<Order>("asc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [editTarget, setEditTarget] = useState<FlowEntity | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FlowEntity | null>(null);
  const {formProps, openForm} = useDynamicForm();

  const allEntities = getList(entityType);

  const filtered = useMemo(() => {
    if (!search.trim()) return allEntities;
    const q = search.toLowerCase();
    return allEntities.filter((e) =>
      Object.values(e).some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [allEntities, search]);

  const sorted = useMemo(
    () => sortEntities(filtered, sortCol, sortOrder),
    [filtered, sortCol, sortOrder]
  );

  const paged = useMemo(
    () => sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [sorted, page, rowsPerPage]
  );

  const columns = useMemo(() => collectColumns(allEntities), [allEntities]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortOrder("asc");
    }
    setPage(0);
  };

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    remove(entityType, deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, entityType, remove]);

  const handleAdd = useCallback(() => {
      openForm({
        title: `${entityType}を追加`,
        fields: TypedFields[entityType] || buildFieldDefs(columns, allEntities[0]),
        onSubmit: (values) => create(entityType, values),
      });
  }, [columns, allEntities]);

  const handleEdit = useCallback((entity: FlowEntity) => {
      openForm({
        title: `${entityType}を編集`,
        fields: TypedFields[entityType] || buildFieldDefs(columns, entity),
        onSubmit: (values) => patch(entityType, entity.id, values),
      });
  }, [columns]);
  
  const entityLabel = (e: FlowEntity) =>
    String(e["name"] ?? e["code"] ?? e["content"] ?? e.id);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", gap: 1 }}>
      {/* ツールバー */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <TextField
          size="small"
          placeholder="検索..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ width: 280 }}
        />
        <Typography variant="caption" color="text.secondary">
          {filtered.length} / {allEntities.length} 件
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleAdd}
        >
          追加
        </Button>
      </Box>

      {/* テーブル */}
      <TableContainer component={Paper} sx={{ flex: 1, overflow: "auto" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 80, fontWeight: "bold" }}>操作</TableCell>
              {columns.map((col) => (
                <TableCell key={col} sx={{ whiteSpace: "nowrap", fontWeight: "bold" }}>
                  <TableSortLabel
                    active={sortCol === col}
                    direction={sortCol === col ? sortOrder : "asc"}
                    onClick={() => handleSort(col)}
                  >
                    {col}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 1} align="center">
                  <Typography color="text.secondary" variant="caption">
                    {allEntities.length === 0 ? "データなし（未同期の可能性があります）" : "検索結果なし"}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {paged.map((entity) => (
              <TableRow key={entity.id} hover>
                {/* 操作ボタン */}
                <TableCell sx={{ whiteSpace: "nowrap", p: 0.5 }}>
                  <Tooltip title="編集">
                    <IconButton size="small" onClick={() => handleEdit(entity)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="削除">
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(entity)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
                {columns.map((col) => (
                  <TableCell key={col} sx={{ maxWidth: 240, overflow: "hidden" }}>
                    {renderValue(entity[col])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ページネーション */}
      <TablePagination
        component="div"
        count={filtered.length}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 25, 50, 100]}
        labelRowsPerPage="表示件数:"
        sx={{ flexShrink: 0 }}
      />

      {/* 編集フォーム */}
      {/* 追加フォーム */}
      <DynamicForm {...formProps}/>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>削除の確認</DialogTitle>
        <DialogContent>
          <Typography>
            {entityType} 「{deleteTarget ? entityLabel(deleteTarget) : ""}」を削除しますか？
          </Typography>
          <Typography variant="caption" color="text.secondary">
            この操作は Commit するまで元に戻せます（Undo 可能）。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>キャンセル</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">削除</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ---- ページ本体 ----

export function EntityBrowser() {
  const [tab, setTab] = useState<EntityType>("Project");

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v as EntityType)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: "divider", flexShrink: 0 }}
      >
        {ENTITY_TYPES.map((t) => (
          <Tab key={t} label={t} value={t} />
        ))}
      </Tabs>

      <Box sx={{ flex: 1, overflow: "hidden", p: 2 }}>
        <EntityTable entityType={tab} />
      </Box>
    </Box>
  );
}
