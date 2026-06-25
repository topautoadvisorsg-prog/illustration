import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import ProductionConsole from "@/ProductionConsole";

/**
 * The operator sees ONE publishing system: the Production Console, which drives
 * the validated whole-page AI pipeline. The legacy "Publishing Platform"
 * workbench (App.js) is NOT shown by default and has NO visible entry point — it
 * stays reachable only as a deliberate backdoor via the `?legacy=1` URL param
 * (advanced/dev use), pending its post-launch teardown. This keeps a first-time
 * operator from wandering into the redundant, broken legacy UI.
 */
function Root() {
  const [legacy, setLegacy] = useState(
    () => new URLSearchParams(window.location.search).get("legacy") === "1",
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
        <App />
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
