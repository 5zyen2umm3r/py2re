import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route, NavLink } from "react-router-dom";
import {
  CssBaseline, AppBar, Toolbar, Typography, Button, Box,
  Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItem, ListItemText, IconButton, Drawer, ListItemButton,
  CircularProgress, Snackbar, Alert, Menu, MenuItem, Divider, Avatar,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import SyncIcon from "@mui/icons-material/Sync";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import { EntityProvider, useEntities, PendingDiffSummary } from "./context/EntityContext";
import { ScheduleFilterProvider } from "./context/ScheduleFilterContext";
import { TimeLogFilterProvider } from "./context/TimeLogFilterContext";
import { SettingsProvider } from "./context/SettingsContext";
import { SessionProvider, useSession } from "./context/SessionContext";
import { EstimationTable } from "./pages/EstimationTable";
import { EntityBrowser } from "./pages/EntityBrowser";
import { TaskSchedule } from "./pages/TaskSchedule";
import { GanttPage } from "./pages/GanttPage";
import { TimeLogPage } from "./pages/TimeLogPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { initQtChannel } from "./api/fetch";
import { entityApi } from "./api/entities";

const NAV_ITEMS = [
  { label: "工数表", path: "/" },
  { label: "スケジュール", path: "/schedule" },
  { label: "ガントチャート", path: "/gantt" },
  { label: "タイムログ", path: "/timelog" },
  { label: "エンティティ一覧", path: "/entities" },
  { label: "履歴", path: "/history" },
  { label: "設定", path: "/settings" },
];

function AppContent() {
  const { loadAll, undo, undoAll, redo, redoAll, canUndo, canRedo, pastCount, futureCount, pendingCount, commitAll, clearAll, getPendingSummary } = useEntities();
  const { isAuthenticated, user, logout, sgLogin, loading: sessionLoading } = useSession();
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [summary, setSummary] = useState<PendingDiffSummary[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sgCommitting, setSgCommitting] = useState(false);
  const [accountMenuAnchor, setAccountMenuAnchor] = useState<null | HTMLElement>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: "success" | "error" } | null>(null);

  const handleSgSync = async () => {
    setAccountMenuAnchor(null);
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
    setAccountMenuAnchor(null);
    setSgCommitting(true);
    try {
      await entityApi.commit();
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

  const handleClearConfirm = () => {
    setClearDialogOpen(false);
    clearAll();
    setSnackbar({ message: "ローカル編集をすべてクリアしました", severity: "success" });
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

  const displayName = user
    ? (user.firstName ? `${user.firstName} ${user.lastName}`.trim() : user.username)
    : null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1 }}>
          <IconButton color="inherit" edge="start" onClick={() => setDrawerOpen(true)} sx={{ mr: 1 }}>
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" sx={{ mr: 2 }}>FlowPT Cache</Typography>

          <Box sx={{ flexGrow: 1 }} />

          {/* Undo / Redo */}
          <Tooltip title={`全て元に戻す（${pastCount}件）`}>
            <span>
              <Button color="inherit" disabled={!canUndo} onClick={undoAll} sx={{ minWidth: 0, px: 1 }}>↩↩</Button>
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
              <Button color="inherit" disabled={!canRedo} onClick={redoAll} sx={{ minWidth: 0, px: 1 }}>↪↪</Button>
            </span>
          </Tooltip>

          {/* ローカル Commit */}
          <Button color="inherit" onClick={handleCommitClick} disabled={pendingCount === 0}>
            Commit {pendingCount > 0 ? `(${pendingCount})` : ""}
          </Button>

          {/* アカウントメニュー */}
          <Tooltip title={isAuthenticated ? displayName ?? "アカウント" : "アカウント"}>
            <IconButton
              color="inherit"
              onClick={(e) => setAccountMenuAnchor(e.currentTarget)}
              sx={{ ml: 0.5 }}
            >
              {isAuthenticated
                ? <Avatar sx={{ width: 28, height: 28, fontSize: "0.8rem", bgcolor: "rgba(255,255,255,0.25)" }}>
                    {displayName?.[0]?.toUpperCase() ?? "U"}
                  </Avatar>
                : <AccountCircleIcon />
              }
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={accountMenuAnchor}
            open={Boolean(accountMenuAnchor)}
            onClose={() => setAccountMenuAnchor(null)}
            transformOrigin={{ horizontal: "right", vertical: "top" }}
            anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
          >
            {/* ユーザー情報 */}
            {isAuthenticated && displayName && (
              <MenuItem disabled sx={{ opacity: "1 !important" }}>
                <Typography variant="body2" color="text.secondary">{displayName}</Typography>
              </MenuItem>
            )}
            {isAuthenticated && <Divider />}

            {/* SG 同期 */}
            <MenuItem onClick={handleSgSync} disabled={syncing}>
              {syncing
                ? <CircularProgress size={16} sx={{ mr: 1.5 }} />
                : <SyncIcon fontSize="small" sx={{ mr: 1.5 }} />
              }
              SG 同期
            </MenuItem>

            {/* SG コミット */}
            <MenuItem onClick={handleSgCommit} disabled={sgCommitting}>
              {sgCommitting
                ? <CircularProgress size={16} sx={{ mr: 1.5 }} />
                : <CloudUploadIcon fontSize="small" sx={{ mr: 1.5 }} />
              }
              SG コミット
            </MenuItem>

            <Divider />

            {/* ローカル編集クリア */}
            <MenuItem onClick={() => { setAccountMenuAnchor(null); setClearDialogOpen(true); }}>
              <DeleteSweepIcon fontSize="small" sx={{ mr: 1.5, color: "warning.main" }} />
              <Typography color="warning.main">ローカル編集をクリア</Typography>
            </MenuItem>

            <Divider />

            {/* SG ログイン / ログアウト */}
            {isAuthenticated ? (
              <MenuItem onClick={() => { setAccountMenuAnchor(null); logout(); }}>
                <LogoutIcon fontSize="small" sx={{ mr: 1.5 }} />
                ログアウト
              </MenuItem>
            ) : (
              <MenuItem
                onClick={() => { setAccountMenuAnchor(null); sgLogin().catch(() => {}); }}
                disabled={sessionLoading}
              >
                <LoginIcon fontSize="small" sx={{ mr: 1.5 }} />
                SG ログイン
              </MenuItem>
            )}
          </Menu>
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
              <Box sx={{ height: "100%", overflow: "hidden" }}>
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
            path="/gantt"
            element={
              <Box sx={{ height: "100%", overflow: "hidden" }}>
                <GanttPage />
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

      {/* ローカル編集クリア確認ダイアログ */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>ローカル編集をクリアしますか？</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            undo/redo 履歴・未コミット差分・LocalStorage に保存されたすべての編集情報を削除します。この操作は元に戻せません。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>キャンセル</Button>
          <Button onClick={handleClearConfirm} variant="contained" color="warning">
            クリア
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
