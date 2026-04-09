/**
 * EntityBrowser: EntityContextにキャッシュされたエンティティを閲覧するページ。
 * EntityTypeごとにタブで切り替え、各エンティティのフィールドをテーブル表示する。
 */
import React, { useMemo, useState } from "react";
import {
  Box, Tab, Tabs, Typography, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TableSortLabel, Paper, Chip, Tooltip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useEntities } from "../context/EntityContext";
import { EntityType, FlowEntity } from "../api/entities";

const ENTITY_TYPES: EntityType[] = [
  "Project", "HumanUser", "Asset", "Task", "Phase", "Step", "Estimation",
];

// ---- フィールド値の表示ヘルパー ----

function renderValue(val: unknown): React.ReactNode {
  if (val === null || val === undefined) return <Typography variant="caption" color="text.disabled">—</Typography>;
  if (typeof val === "boolean") return <Chip label={String(val)} size="small" variant="outlined" />;
  if (typeof val === "object") {
    // エンティティ参照 { type, id, name? }
    if ("id" in (val as object)) {
      const ref = val as { type?: string; id: number; name?: string; code?: string };
      const label = ref.name ?? ref.code ?? `#${ref.id}`;
      return (
        <Tooltip title={`${ref.type ?? ""}:${ref.id}`}>
          <Chip label={label} size="small" color="primary" variant="outlined" />
        </Tooltip>
      );
    }
    // 配列（複数参照など）
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

// ---- カラム収集: 表示中エンティティ全体からキーを収集 ----

function collectColumns(entities: FlowEntity[]): string[] {
  const keys = new Set<string>();
  for (const e of entities.slice(0, 50)) {  // 先頭50件からキーを収集
    Object.keys(e).forEach((k) => keys.add(k));
  }
  // id を先頭に固定
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

// ---- エンティティテーブル ----

function EntityTable({ entityType }: { entityType: EntityType }) {
  const { getList } = useEntities();
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("id");
  const [sortOrder, setSortOrder] = useState<Order>("asc");

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

  const columns = useMemo(() => collectColumns(allEntities), [allEntities]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortOrder("asc");
    }
  };

  if (allEntities.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">データなし（未同期の可能性があります）</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", gap: 1 }}>
      {/* 検索バー */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <TextField
          size="small"
          placeholder="検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
      </Box>

      {/* テーブル */}
      <TableContainer component={Paper} sx={{ flex: 1, overflow: "auto" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
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
            {sorted.map((entity) => (
              <TableRow key={entity.id} hover>
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
