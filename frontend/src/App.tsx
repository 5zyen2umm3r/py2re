import React, { useEffect } from "react";
import { HashRouter, Routes, Route, NavLink } from "react-router-dom";
import {
  CssBaseline, AppBar, Toolbar, Typography, Button, Box, Tabs, Tab,
  Tooltip,
} from "@mui/material";
import { EntityProvider, useEntities } from "./context/EntityContext";
import { ScheduleFilterProvider } from "./context/ScheduleFilterContext";
import { EstimationTable } from "./components/EstimationTable";
import { EntityBrowser } from "./pages/EntityBrowser";
import { TaskSchedule } from "./pages/TaskSchedule";
import { initQtChannel } from "./api/fetch";

// ---- ナビゲーション用タブ（HashRouter のパスと対応） ----
const NAV_TABS = [
  { label: "工数表", path: "/" },
  { label: "エンティティ一覧", path: "/entities" },
  { label: "スケジュール", path: "/schedule" },
];

function AppContent() {
  const { loadAll, undo, undoAll, redo, redoAll, canUndo, canRedo, pastCount, futureCount, commit } = useEntities();

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
          <Button color="inherit" onClick={() => commit("Estimation")}>Commit</Button>
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
        </Routes>
      </Box>
    </Box>
  );
}

export default function App() {
  return (
    <HashRouter>
      <EntityProvider>
        <ScheduleFilterProvider>
          <CssBaseline />
          <AppContent />
        </ScheduleFilterProvider>
      </EntityProvider>
    </HashRouter>
  );
}
