import React, { useEffect } from "react";
import { CssBaseline, AppBar, Toolbar, Typography, Button, Box } from "@mui/material";
import { EntityProvider, useEntities } from "./context/EntityContext";
import { EstimationTable } from "./components/EstimationTable";
import { initQtChannel } from "./api/fetch";

function AppContent() {
  const { loadAll, undo, redo, canUndo, canRedo, commit } = useEntities();

  useEffect(() => {
    initQtChannel().then(() => loadAll());
  }, [loadAll]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>FlowPT Cache</Typography>
          <Button color="inherit" disabled={!canUndo} onClick={undo}>Undo</Button>
          <Button color="inherit" disabled={!canRedo} onClick={redo}>Redo</Button>
          <Button color="inherit" onClick={() => commit("Estimation")}>Commit</Button>
        </Toolbar>
      </AppBar>
      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        <EstimationTable />
      </Box>
    </Box>
  );
}

export default function App() {
  return (
    <EntityProvider>
      <CssBaseline />
      <AppContent />
    </EntityProvider>
  );
}
