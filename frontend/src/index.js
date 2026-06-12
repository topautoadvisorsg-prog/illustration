import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import ProductionConsole from "@/ProductionConsole";

/**
 * The operator sees ONE publishing system: the Production Console, which drives
 * the validated whole-page AI pipeline. The legacy layered/Paged.js workbench
 * remains reachable only as an internal "Legacy tools" view, never the default
 * operator path.
 */
function Root() {
  const [legacy, setLegacy] = useState(false);
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
  return <ProductionConsole onExitToLegacy={() => setLegacy(true)} />;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
