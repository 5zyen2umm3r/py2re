import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route, NavLink } from "react-router-dom";
import {
  CssBaseline, AppBar, Toolbar, Typography, Button, Box,
  Tooltip, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItem, ListItemText, IconButton, Drawer, ListItemButton,
  CircularProgress, Snackbar, Alert,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import SyncIcon from "@mui/icons-material/Sync";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { EntityProvider, useEntities, PendingDiffSummary } from "./context/EntityContext";
import { ScheduleFilterProvider } from "./context/ScheduleFilterContext";
import { TimeLogFilterProvider } from "./context/TimeLogFilterContext";
import { SettingsProvider } from "./context/SettingsContext";
import { SessionProvider, useSession } from "./context/SessionContext";
import { EstimationTable } from "./pages/EstimationTable";
import { EntityBrowser } from "./pages/EntityBrowser";
import { TaskSchedule } from "./pages/TaskSchedule";
import { TimeLogPage } from "./pages/TimeLogPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { initQtChannel } from "./api/fetch";
import { entityApi } from "./api/entities";

const NAV_ITEMS = [
  { label: "工数表", path: "/" },
  { label: "スケジュール", path: "/schedule" },
  { label: "タイムログ", path: "/timelog" },
  { label: "エンティティ一覧", path: "/entities" },
  { label: "履歴", path: "/history" },
  { label: "設定", path: "/settings" },
];

function AppContent() {
  const { loadAll, undo, undoAll, redo, redoAll, canUndo, canRedo, pastCount, futureCount, pendingCount, commitAll, getPendingSummary } = useEntities();
  const { isAuthenticated, user, logout, sgLogin, loading: sessionLoading } = useSession();
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [summary, setSummary] = useState<PendingDiffSummary[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sgCommitting, setSgCommitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: "success" | "error" } | null>(null);

  const handleSgSync = async () => {
    setSyncing(true);
    try {
      await entityApi.sync("all");
      await loadAll();
      setSnackbar({ message: "FlowPT から同期しました", severity: "success" });
    } catch (e) {
      setSnackbar({ message: `同期エラー: ${e}`, severity: "error" });
    } finally {
      setSyncing(false);
    }
  };

  const handleSgCommit = async () => {
    setSgCommitting(true);
    try {
      // 全エンティティタイプに対して commit を実行
      const types = ["HumanUser", "Project", "Asset", "Task", "Phase", "Step", "Estimation", "TimeLog"] as const;
      await Promise.all(types.map((t) => entityApi.commit(t)));
      setSnackbar({ message: "FlowPT へコミットしました", severity: "success" });
    } catch (e) {
      setSnackbar({ message: `コミットエラー: ${e}`, severity: "error" });
    } finally {
      setSgCommitting(false);
    }
  };

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

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1 }}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setDrawerOpen(true)}
            sx={{ mr: 1 }}
            aria-label="メニューを開く"
          >
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" sx={{ mr: 2 }}>FlowPT Cache</Typography>

          <Box sx={{ flexGrow: 1 }} />

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
          <Tooltip title="FlowPT から全データを同期する">
            <span>
              <Button
                color="inherit"
                onClick={handleSgSync}
                disabled={syncing}
                startIcon={syncing ? <CircularProgress size={14} color="inherit" /> : <SyncIcon />}
                sx={{ whiteSpace: "nowrap" }}
              >
                SG 同期
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="ローカルの変更を FlowPT へコミットする">
            <span>
              <Button
                color="inherit"
                onClick={handleSgCommit}
                disabled={sgCommitting}
                startIcon={sgCommitting ? <CircularProgress size={14} color="inherit" /> : <CloudUploadIcon />}
                sx={{ whiteSpace: "nowrap" }}
              >
                SG コミット
              </Button>
            </span>
          </Tooltip>
          <Button color="inherit" onClick={handleCommitClick} disabled={pendingCount === 0}>
            Commit {pendingCount > 0 ? `(${pendingCount})` : ""}
          </Button>

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

      {/* Hamburger Drawer */}
      <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 220 }} role="presentation">
          <List>
            {NAV_ITEMS.map((item) => (
              <ListItemButton
                key={item.path}
                component={NavLink}
                to={item.path}
                onClick={() => setDrawerOpen(false)}
                sx={{
                  "&.active": { backgroundColor: "action.selected" },
                }}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>

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
          <Route
            path="/history"
            element={
              <Box sx={{ height: "100%", overflow: "auto", p: 2 }}>
                <HistoryPage />
              </Box>
            }
          />
          <Route
            path="/settings"
            element={
              <Box sx={{ height: "100%", overflow: "auto" }}>
                <SettingsPage />
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

      <Snackbar
        open={snackbar !== null}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbar?.severity} onClose={() => setSnackbar(null)} sx={{ width: "100%" }}>
          {snackbar?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default function App() {
  return (
    <HashRouter>
      <SessionProvider>
        <EntityProvider>
          <ScheduleFilterProvider>
            <TimeLogFilterProvider>
              <SettingsProvider>
                <CssBaseline />
                <AppContent />
              </SettingsProvider>
            </TimeLogFilterProvider>
          </ScheduleFilterProvider>
        </EntityProvider>
      </SessionProvider>
    </HashRouter>
  );
}
