import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route, NavLink } from "react-router-dom";
import {
  CssBaseline, AppBar, Toolbar, Typography, Button, Box, Tabs, Tab,
  Tooltip, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItem, ListItemText,
} from "@mui/material";
import { EntityProvider, useEntities, PendingDiffSummary } from "./context/EntityContext";
import { ScheduleFilterProvider } from "./context/ScheduleFilterContext";
import { SessionProvider, useSession } from "./context/SessionContext";
import { EstimationTable } from "./components/EstimationTable";
import { EntityBrowser } from "./pages/EntityBrowser";
import { TaskSchedule } from "./pages/TaskSchedule";
import { TimeLogPage } from "./pages/TimeLogPage";
import { initQtChannel } from "./api/fetch";

// ---- ナビゲーション用タブ（HashRouter のパスと対応） ----
const NAV_TABS = [
  { label: "工数表", path: "/" },
  { label: "エンティティ一覧", path: "/entities" },
  { label: "スケジュール", path: "/schedule" },
  { label: "タイムログ", path: "/timelog" },
];

function AppContent() {
  const { loadAll, undo, undoAll, redo, redoAll, canUndo, canRedo, pastCount, futureCount, pendingCount, commitAll, getPendingSummary } = useEntities();
  const { isAuthenticated, user, logout, sgLogin, loading: sessionLoading } = useSession();
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [summary, setSummary] = useState<PendingDiffSummary[]>([]);

  const handleCommitClick = () => {
    const s = getPendingSummary();
    setSummary(s);
    setCommitDialogOpen(true);
  };

  const handleCommitConfirm = async () => {
    setCommitDialogOpen(false);
    await commitAll();
  };

  const actionLabel = (action: string) => {
    if (action === "create") return "作成";
    if (action === "update") return "更新";
    if (action === "delete") return "削除";
    return action;
  };

  useEffect(() => {
    initQtChannel().then(() => loadAll());
  }, [loadAll]);

  // 現在のハッシュパスからアクティブタブを判定
  const currentPath = window.location.hash.replace("#", "") || "/";
  const activeTab = NAV_TABS.findIndex((t) => t.path === currentPath);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h6" sx={{ mr: 2 }}>FlowPT Cache</Typography>

          {/* ページナビゲーション */}
          <Tabs
            value={activeTab === -1 ? 0 : activeTab}
            textColor="inherit"
            indicatorColor="secondary"
            sx={{ flexGrow: 1 }}
          >
            {NAV_TABS.map((t) => (
              <Tab
                key={t.path}
                label={t.label}
                component={NavLink}
                to={t.path}
                sx={{ color: "inherit", opacity: 0.8, "&.active": { opacity: 1 } }}
              />
            ))}
          </Tabs>

          <Tooltip title={`全て元に戻す（${pastCount}件）`}>
            <span>
              <Button color="inherit" disabled={!canUndo} onClick={undoAll} sx={{ minWidth: 0, px: 1 }}>
                ↩↩
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={`元に戻す（残り${pastCount}件）`}>
            <span>
              <Button color="inherit" disabled={!canUndo} onClick={undo}>Undo</Button>
            </span>
          </Tooltip>
          <Tooltip title={`やり直す（残り${futureCount}件）`}>
            <span>
              <Button color="inherit" disabled={!canRedo} onClick={redo}>Redo</Button>
            </span>
          </Tooltip>
          <Tooltip title={`全てやり直す（${futureCount}件）`}>
            <span>
              <Button color="inherit" disabled={!canRedo} onClick={redoAll} sx={{ minWidth: 0, px: 1 }}>
                ↪↪
              </Button>
            </span>
          </Tooltip>
          <Button color="inherit" onClick={handleCommitClick} disabled={pendingCount === 0}>
            Commit {pendingCount > 0 ? `(${pendingCount})` : ""}
          </Button>

          {/* ログインユーザー表示 / ShotGrid ログインボタン */}
          {isAuthenticated && user ? (
            <Tooltip title="ログアウト">
              <Chip
                label={user.firstName ? `${user.firstName} ${user.lastName}`.trim() : user.username}
                onClick={logout}
                size="small"
                sx={{ color: "inherit", borderColor: "rgba(255,255,255,0.5)", cursor: "pointer" }}
                variant="outlined"
              />
            </Tooltip>
          ) : (
            <Tooltip title="ShotGrid の認証情報でログインします">
              <span>
                <Button
                  color="inherit"
                  variant="outlined"
                  size="small"
                  disabled={sessionLoading}
                  onClick={() => sgLogin().catch(() => {})}
                  sx={{ borderColor: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}
                >
                  SG ログイン
                </Button>
              </span>
            </Tooltip>
          )}
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: "hidden" }}>
        <Routes>
          <Route
            path="/"
            element={
              <Box sx={{ height: "100%", overflow: "auto", p: 2 }}>
                <EstimationTable />
              </Box>
            }
          />
          <Route
            path="/entities"
            element={<EntityBrowser />}
          />
          <Route
            path="/schedule"
            element={
              <Box sx={{ height: "100%", overflow: "hidden" }}>
                <TaskSchedule />
              </Box>
            }
          />
          <Route
            path="/timelog"
            element={
              <Box sx={{ height: "100%", overflow: "hidden" }}>
                <TimeLogPage />
              </Box>
            }
          />
        </Routes>
      </Box>

      {/* Commit 確認ダイアログ */}
      <Dialog open={commitDialogOpen} onClose={() => setCommitDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>変更をコミットしますか？</DialogTitle>
        <DialogContent>
          {summary.length === 0 ? (
            <Typography variant="body2">変更はありません。</Typography>
          ) : (
            <List dense>
              {summary.map((s, i) => (
                <ListItem key={i} disableGutters>
                  <ListItemText
                    primary={`[${actionLabel(s.action)}] ${s.type} (ID: ${s.id ?? "新規"})`}
                    secondary={s.fields.length > 0 ? `変更フィールド: ${s.fields.join(", ")}` : undefined}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommitDialogOpen(false)}>キャンセル</Button>
          <Button onClick={handleCommitConfirm} variant="contained" disabled={summary.length === 0}>
            コミット
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function App() {
  return (
    <HashRouter>
      <SessionProvider>
        <EntityProvider>
          <ScheduleFilterProvider>
            <CssBaseline />
            <AppContent />
          </ScheduleFilterProvider>
        </EntityProvider>
      </SessionProvider>
    </HashRouter>
  );
}
