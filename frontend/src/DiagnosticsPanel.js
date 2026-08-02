import React, { useCallback, useEffect, useState } from "react";

/**
 * Internal health/diagnostics backdoor (reached via ?diagnostics=1) — see
 * docs/ERROR_HANDLING_STANDARD.md §6. Not for customers: a quick read of the
 * error/recovery/render telemetry so we can spot trends (one error code
 * spiking, a low recovery-success rate, a jump in render failures) before
 * they become a support conversation. Reuses the main console's password
 * (sessionStorage), same as AdvancedPanel.
 */
const DEFAULT_BACKEND_URL = "https://wildlandsbackend-production.up.railway.app";
const BACKEND = process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND_URL;
const C = { ink: "#2e2417", paper: "#f3ecd9", panel: "#fbf7ea", line: "#d9cca8", blue: "#2E6FB0", red: "#C0392B", orange: "#E08A2E", green: "#3F5A43", muted: "#7a6f57" };
const card = { border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, background: C.panel, marginTop: 14, maxWidth: 900 };
const statBox = { border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 14px", background: "#fff", minWidth: 140 };
const WINDOWS = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 24 * 7 },
  { label: "30d", hours: 24 * 30 },
];

function fmtSeconds(s) {
  if (s == null) return "—";
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}
function fmtPct(n) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export default function DiagnosticsPanel() {
  const [pw] = useState(() => sessionStorage.getItem("wl_pw") || "");
  const [hours, setHours] = useState(24);
  const [errors, setErrors] = useState(null);
  const [renders, setRenders] = useState(null);
  const [operations, setOperations] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const api = useCallback(async (path) => {
    const res = await fetch(`${BACKEND}${path}`, { headers: pw ? { Authorization: `Bearer ${pw}` } : {} });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) throw new Error((data && (data.message || data.error)) || `${res.status} ${res.statusText}`);
    return data;
  }, [pw]);

  const load = useCallback(() => {
    if (!pw) return;
    setBusy(true); setError("");
    Promise.all([
      api(`/api/diagnostics/errors?hours=${hours}`),
      api(`/api/diagnostics/renders?hours=${hours}`),
      api(`/api/diagnostics/operations?hours=${hours}`),
    ])
      .then(([e, r, o]) => { setErrors(e); setRenders(r); setOperations(o); })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, [pw, hours, api]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'Iowan Old Style','Palatino Linotype',Georgia,serif", padding: "28px 36px" }}>
      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Diagnostics</h1>
      <p style={{ color: C.muted, marginTop: 0, fontSize: 14, maxWidth: 900 }}>
        Backdoor panel (<code>?diagnostics=1</code>). Internal only — an on-demand read of the error-translation-layer telemetry, not a scheduled/emailed report. See docs/ERROR_HANDLING_STANDARD.md.
      </p>
      {!pw && <div style={{ ...card, borderColor: C.red, color: C.red }}>Not logged in. Open the main Operator Console first and enter the password, then return here.</div>}
      {pw && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
            {WINDOWS.map((w) => (
              <button
                key={w.label}
                onClick={() => setHours(w.hours)}
                style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: hours === w.hours ? C.blue : "#fff", color: hours === w.hours ? "#fff" : C.ink, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >
                {w.label}
              </button>
            ))}
            <button onClick={load} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent", cursor: "pointer", fontSize: 13 }}>↻ Refresh</button>
            {busy && <span style={{ color: C.orange, fontSize: 13 }}>⏳ loading…</span>}
          </div>
          {error && <div style={{ ...card, borderColor: C.red, color: C.red }}>⚠ {error}</div>}

          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Validation errors</div>
            {errors && (
              <>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={statBox}><div style={{ fontSize: 11, color: C.muted }}>Total errors</div><div style={{ fontSize: 20, fontWeight: 700 }}>{errors.totalErrors}</div></div>
                  <div style={statBox}><div style={{ fontSize: 11, color: C.muted }}>Recovery clicked</div><div style={{ fontSize: 20, fontWeight: 700 }}>{errors.recovery.clicked}</div></div>
                  <div style={statBox}><div style={{ fontSize: 11, color: C.muted }}>Recovery succeeded</div><div style={{ fontSize: 20, fontWeight: 700 }}>{errors.recovery.succeeded}</div></div>
                  <div style={statBox}><div style={{ fontSize: 11, color: C.muted }}>Recovery success rate</div><div style={{ fontSize: 20, fontWeight: 700, color: errors.recovery.successRate != null && errors.recovery.successRate < 0.5 ? C.red : C.green }}>{fmtPct(errors.recovery.successRate)}</div></div>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>"Succeeded" is the outcome of the very next action after a recovery button click — a simple heuristic, not a full session trace (see ERROR_HANDLING_STANDARD.md).</div>

                <div style={{ display: "flex", gap: 24, marginTop: 14, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Most common error codes</div>
                    {errors.topCodes.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>None in this window.</div>}
                    <table style={{ fontSize: 13, borderCollapse: "collapse" }}>
                      <tbody>
                        {errors.topCodes.map((r) => (
                          <tr key={r.errorCode}>
                            <td style={{ padding: "2px 10px 2px 0", fontFamily: "monospace" }}>{r.errorCode}</td>
                            <td style={{ padding: "2px 0", fontWeight: 700 }}>{r.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Most common paths (step proxy)</div>
                    {errors.topPaths.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>None in this window.</div>}
                    <table style={{ fontSize: 13, borderCollapse: "collapse" }}>
                      <tbody>
                        {errors.topPaths.map((r) => (
                          <tr key={r.path}>
                            <td style={{ padding: "2px 10px 2px 0", fontFamily: "monospace" }}>{r.path}</td>
                            <td style={{ padding: "2px 0", fontWeight: 700 }}>{r.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Renders</div>
            {renders && (
              <>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={statBox}><div style={{ fontSize: 11, color: C.muted }}>Total renders</div><div style={{ fontSize: 20, fontWeight: 700 }}>{renders.totalRenders}</div></div>
                  <div style={statBox}><div style={{ fontSize: 11, color: C.muted }}>Failed renders</div><div style={{ fontSize: 20, fontWeight: 700, color: renders.failedRenders > 0 ? C.red : C.ink }}>{renders.failedRenders}</div></div>
                  <div style={statBox}><div style={{ fontSize: 11, color: C.muted }}>Avg render time</div><div style={{ fontSize: 20, fontWeight: 700 }}>{fmtSeconds(renders.avgRenderSeconds)}</div></div>
                  <div style={statBox}><div style={{ fontSize: 11, color: C.muted }}>Avg approval time</div><div style={{ fontSize: 20, fontWeight: 700 }}>{fmtSeconds(renders.avgApprovalSeconds)}</div></div>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>Render time is an approximation (row created→updated), not a precisely instrumented duration — see render-diagnostics.repo.ts. Approval time is exact (decidedAt − created).</div>
              </>
            )}
          </div>

          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Operation timing</div>
            {operations && (
              <>
                {operations.operations.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>None in this window.</div>}
                {operations.operations.length > 0 && (
                  <table style={{ fontSize: 13, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: C.muted, fontSize: 11, textAlign: "left" }}>
                        <th style={{ padding: "2px 14px 4px 0" }}>Operation</th>
                        <th style={{ padding: "2px 14px 4px 0" }}>Count</th>
                        <th style={{ padding: "2px 14px 4px 0" }}>Avg duration</th>
                        <th style={{ padding: "2px 0 4px" }}>Success rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {operations.operations.map((r) => (
                        <tr key={r.operation}>
                          <td style={{ padding: "2px 14px 2px 0", fontFamily: "monospace" }}>{r.operation}</td>
                          <td style={{ padding: "2px 14px 2px 0", fontWeight: 700 }}>{r.count}</td>
                          <td style={{ padding: "2px 14px 2px 0", fontWeight: 700 }}>{r.avgDurationMs.toLocaleString()}ms</td>
                          <td style={{ padding: "2px 0", fontWeight: 700, color: r.successRate < 0.9 ? C.red : C.green }}>{fmtPct(r.successRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>Only Breakdown is instrumented today — pagination/render/review timing is follow-up work (see backend/src/lib/timing.ts).</div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
