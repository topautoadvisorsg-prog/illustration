import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import AdvancedPanel from "@/AdvancedPanel";
import DiagnosticsPanel from "@/DiagnosticsPanel";
import ProductionConsole from "@/ProductionConsole";

/**
 * The operator sees ONE publishing system: the Production Console, which drives
 * the validated whole-page AI pipeline. The retired "Publishing Platform" UI
 * (App.js — duplicate pipeline + over-built Publishing Intelligence center) has
 * been DELETED. The `?legacy=1` URL param now opens a lean Advanced/dev panel
 * (AdvancedPanel) holding only genuinely-needed tools (e.g. the no-spend Pipeline
 * Check), never the old over-built workbench. `?diagnostics=1` opens the
 * internal health/telemetry backdoor (DiagnosticsPanel) — same idea, not a
 * customer-facing surface, see docs/ERROR_HANDLING_STANDARD.md §6.
 */
function Root() {
  const [legacy, setLegacy] = useState(
    () => new URLSearchParams(window.location.search).get("legacy") === "1",
  );
  const [diagnostics, setDiagnostics] = useState(
    () => new URLSearchParams(window.location.search).get("diagnostics") === "1",
  );
  if (legacy) {
    return (
      <div>
        <button
          onClick={() => setLegacy(false)}
          style={{ position: "fixed", top: 8, right: 8, zIndex: 9999, padding: "6px 12px", borderRadius: 8, border: "1px solid #d9cca8", background: "#fbf7ea", cursor: "pointer", fontSize: 12 }}
        >
          ← Back to Operator Console
        </button>
        <AdvancedPanel />
      </div>
    );
  }
  if (diagnostics) {
    return (
      <div>
        <button
          onClick={() => setDiagnostics(false)}
          style={{ position: "fixed", top: 8, right: 8, zIndex: 9999, padding: "6px 12px", borderRadius: 8, border: "1px solid #d9cca8", background: "#fbf7ea", cursor: "pointer", fontSize: 12 }}
        >
          ← Back to Operator Console
        </button>
        <DiagnosticsPanel />
      </div>
    );
  }
  // No onExitToLegacy → the Console renders no "Legacy tools" button.
  return <ProductionConsole />;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
