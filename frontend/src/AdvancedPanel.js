import React, { useCallback, useEffect, useState } from "react";

/**
 * Advanced / dev backdoor (reached via ?legacy=1). Replaces the retired 7k-line
 * "Publishing Platform" (App.js) — keeps ONLY genuinely-needed advanced tools,
 * not the over-built Intelligence/duplicate-pipeline UI. Today: the no-spend
 * Pipeline Check (supervisor). Reuses the main console's password (sessionStorage).
 */
const DEFAULT_BACKEND_URL = "https://wildlandsbackend-production.up.railway.app";
const BACKEND = process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND_URL;
const C = { ink: "#2e2417", paper: "#f3ecd9", panel: "#fbf7ea", line: "#d9cca8", blue: "#2E6FB0", red: "#C0392B", orange: "#E08A2E", muted: "#7a6f57" };
const card = { border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, background: C.panel, marginTop: 14, maxWidth: 900 };

export default function AdvancedPanel() {
  const [pw] = useState(() => sessionStorage.getItem("wl_pw") || "");
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const api = useCallback(async (path, options = {}) => {
    const res = await fetch(`${BACKEND}${path}`, {
      ...options,
      headers: { ...(options.body != null ? { "Content-Type": "application/json" } : {}), ...(pw ? { Authorization: `Bearer ${pw}` } : {}), ...(options.headers || {}) },
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) throw new Error((data && (data.message || data.error)) || `${res.status} ${res.statusText}`);
    return data;
  }, [pw]);

  useEffect(() => {
    if (!pw) return;
    api("/api/projects")
      .then((d) => { const list = Array.isArray(d) ? d : (d.projects || []); setProjects(list); if (list[0]) setProjectId(list[0].id); })
      .catch((e) => setError(e.message));
  }, [pw, api]);

  const runCheck = async () => {
    if (!projectId) return;
    setBusy("Running pipeline check (no spend)…"); setError(""); setReport(null);
    try { setReport(await api(`/api/projects/${projectId}/run-pipeline`, { method: "POST", body: JSON.stringify({ mode: "no-spend" }) })); }
    catch (e) { setError(e.message); }
    finally { setBusy(""); }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'Iowan Old Style','Palatino Linotype',Georgia,serif", padding: "28px 36px" }}>
      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Advanced / dev tools</h1>
      <p style={{ color: C.muted, marginTop: 0, fontSize: 14, maxWidth: 900 }}>
        Backdoor panel (<code>?legacy=1</code>). Only genuinely-needed advanced tools live here — the retired "Publishing Platform" UI (duplicate pipeline + Publishing Intelligence) was removed. Use the main Operator Console for normal work.
      </p>
      {!pw && <div style={{ ...card, borderColor: C.red, color: C.red }}>Not logged in. Open the main Operator Console first and enter the password, then return here.</div>}
      {pw && (
        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Pipeline Check (no spend)</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Runs the no-spend supervisor and reports the verdict, why, next action, and budget for a project.</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", fontSize: 14 }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title || p.id}</option>)}
            </select>
            <button onClick={() => runCheck()} disabled={!!busy || !projectId} style={{ padding: "9px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#fff", background: C.blue, opacity: busy || !projectId ? 0.6 : 1 }}>Run Pipeline Check →</button>
          </div>
          {busy && <div style={{ marginTop: 10, color: C.orange }}>⏳ {busy}</div>}
          {error && <div style={{ marginTop: 10, color: C.red }}>⚠ {error}</div>}
          {report && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#fff", padding: 12, borderRadius: 8, border: `1px solid ${C.line}`, marginTop: 10, maxHeight: 480, overflow: "auto" }}>{JSON.stringify(report, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}
