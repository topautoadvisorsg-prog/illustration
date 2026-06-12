/**
 * Wild Lands — Operator Production Console.
 *
 * The single operator path. Drives the VALIDATED whole-page AI publishing
 * pipeline end to end — NOT the legacy Paged.js / clean-art workflow:
 *
 *   Project → Manuscript → Book Setup → Breakdown → Paginate →
 *   Front & Back Matter → Render Pages (whole-page AI) → Cover →
 *   Assemble & Export.
 *
 * Every step calls the current production API. No "image must contain zero
 * readable text" assumptions — the AI bakes each finished page.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_BACKEND_URL = "https://wildlandsbackend-production.up.railway.app";
const BACKEND = process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND_URL;

// ── tiny styling system (self-contained; no dependency on the legacy design kit)
const C = {
  ink: "#2e2417",
  paper: "#f3ecd9",
  panel: "#fbf7ea",
  line: "#d9cca8",
  blue: "#2E6FB0",
  field: "#9DBBD6",
  red: "#C0392B",
  orange: "#E08A2E",
  green: "#3F5A43",
  muted: "#7a6f57",
};
const S = {
  shell: { display: "flex", minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'Iowan Old Style','Palatino Linotype',Georgia,serif" },
  side: { width: 280, borderRight: `1px solid ${C.line}`, padding: "20px 16px", background: C.panel, position: "sticky", top: 0, height: "100vh", overflowY: "auto", boxSizing: "border-box" },
  main: { flex: 1, padding: "28px 36px", maxWidth: 1100 },
  step: (active, done) => ({ display: "flex", gap: 10, alignItems: "center", padding: "9px 11px", marginBottom: 4, borderRadius: 8, cursor: "pointer", background: active ? C.blue : "transparent", color: active ? "#fff" : C.ink, opacity: done || active ? 1 : 0.82, fontSize: 14 }),
  dot: (done) => ({ width: 18, height: 18, borderRadius: 9, flex: "0 0 auto", background: done ? C.green : "transparent", border: `2px solid ${done ? C.green : C.line}`, color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }),
  btn: (kind = "primary") => ({ padding: "9px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, marginRight: 8, marginTop: 6, color: "#fff", background: kind === "primary" ? C.blue : kind === "spend" ? C.red : kind === "ok" ? C.green : C.muted }),
  ghost: { padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent", cursor: "pointer", fontSize: 13, marginRight: 8, marginTop: 6, color: C.ink },
  input: { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", fontSize: 14, boxSizing: "border-box", marginTop: 4, fontFamily: "inherit" },
  card: { border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, background: C.panel, marginTop: 14 },
  h1: { fontSize: 26, margin: "0 0 4px" },
  sub: { color: C.muted, margin: "0 0 18px", fontSize: 15 },
  pill: (bg) => ({ display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: 11.5, fontWeight: 700, color: "#fff", background: bg }),
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginTop: 14 },
};

const STEPS = [
  { key: "project", label: "1 · Project", purpose: "Create or open a book project." },
  { key: "manuscript", label: "2 · Manuscript", purpose: "Upload the master manuscript." },
  { key: "setup", label: "3 · Book Setup", purpose: "Title, author, edition, trim." },
  { key: "breakdown", label: "4 · Breakdown", purpose: "Split into chapters & entries." },
  { key: "paginate", label: "5 · Paginate", purpose: "Flow the body into pages." },
  { key: "matter", label: "6 · Front & Back Matter", purpose: "Title, copyright, TOC, glossary, index." },
  { key: "render", label: "7 · Render Pages", purpose: "Whole-page AI render + review." },
  { key: "cover", label: "8 · Cover", purpose: "Generate the full-wrap cover." },
  { key: "assemble", label: "9 · Assemble & Export", purpose: "Build the interior PDF." },
];

function statusColor(s) {
  const k = String(s || "").toUpperCase();
  if (k === "APPROVED" || k === "RENDERED") return C.green;
  if (k === "FAILED" || k === "REJECTED") return C.red;
  if (k === "RENDERING" || k === "QUEUED") return C.orange;
  return C.muted;
}

export default function ProductionConsole({ onExitToLegacy }) {
  const [step, setStep] = useState("project");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null); // active project object
  const [form, setForm] = useState({ title: "The Wildlands Field Guide", subtitle: "New England Volume", author: "The Wildlands", trim: "7x10" });
  const [manuscript, setManuscript] = useState("");
  const [manuscriptName, setManuscriptName] = useState("");

  const [breakdown, setBreakdown] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [matter, setMatter] = useState(null);
  const [renders, setRenders] = useState(null); // { total, byStatus, bookReady, renders:[] }
  const [preview, setPreview] = useState(null); // active preview package
  const [cover, setCover] = useState(null);
  const [assembly, setAssembly] = useState(null);

  const api = useCallback(async (path, options = {}) => {
    const res = await fetch(`${BACKEND}${path}`, {
      ...options,
      headers: { ...(options.body != null ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) throw new Error((data && (data.message || data.error)) || `${res.status} ${res.statusText}`);
    return data;
  }, []);

  const fileUrl = useCallback((p) => `${BACKEND}/api/whole-page-render/file?path=${encodeURIComponent(p)}`, []);

  const run = useCallback(async (label, fn) => {
    setBusy(label); setError(""); setNotice("");
    try { const r = await fn(); if (r && r.notice) setNotice(r.notice); return r; }
    catch (e) { setError(e.message || String(e)); throw e; }
    finally { setBusy(""); }
  }, []);

  const loadProjects = useCallback(() => run("Loading projects", async () => {
    const d = await api("/api/projects");
    const list = Array.isArray(d) ? d : d.projects || [];
    setProjects(list);
    return { notice: `${list.length} project(s).` };
  }), [api, run]);

  useEffect(() => { loadProjects().catch(() => {}); }, [loadProjects]);

  function trimSize(t) {
    if (t === "6x9") return { widthIn: 6, heightIn: 9, bleedIn: 0.125 };
    if (t === "8.5x11") return { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 };
    return { widthIn: 7, heightIn: 10, bleedIn: 0.125 };
  }

  function cleanConfig() {
    // Minimal, clean config — the whole-page pipeline takes its visual DNA from
    // the locked Publishing Standard, so NO legacy style/palette blob is sent.
    return {
      title: form.title,
      subtitle: form.subtitle,
      authorName: form.author,
      trimSize: trimSize(form.trim),
      publishing: {
        title: form.title,
        subtitle: form.subtitle,
        authors: form.author.split(",").map((a) => a.trim()).filter(Boolean),
      },
    };
  }

  const createProject = () => run("Creating project", async () => {
    const d = await api("/api/projects", { method: "POST", body: JSON.stringify({ config: cleanConfig() }) });
    setProject(d.project); setProjects((c) => [d.project, ...c.filter((p) => p.id !== d.project.id)]);
    return { notice: `Created “${d.project.title}”.` };
  });

  const saveSetup = () => run("Saving setup", async () => {
    if (!project) throw new Error("Open a project first.");
    const d = await api(`/api/projects/${project.id}/config`, { method: "PATCH", body: JSON.stringify({ config: cleanConfig() }) });
    setProject(d.project);
    return { notice: "Book setup saved." };
  });

  const upload = () => run("Uploading manuscript", async () => {
    if (!project) throw new Error("Open a project first.");
    if (!manuscript.trim()) throw new Error("Paste or drop your manuscript text first.");
    const d = await api(`/api/projects/${project.id}/manuscript`, { method: "POST", body: JSON.stringify({ filename: manuscriptName || "manuscript.md", markdown: manuscript }) });
    return { notice: `Manuscript stored: ${d.manuscript?.totalChapters ?? "?"} chapters, ${d.manuscript?.totalEntries ?? "?"} entries.` };
  });

  const doBreakdown = () => run("Running breakdown", async () => {
    const d = await api(`/api/projects/${project.id}/manifests`, { method: "POST" });
    setBreakdown(d);
    const ch = (d.manifests || []).find((m) => m.type === "BOOK")?.content?.chapters?.length;
    return { notice: `Breakdown complete${ch ? ` — ${ch} chapters` : ""}.` };
  });

  const doPaginate = () => run("Paginating", async () => {
    const d = await api(`/api/projects/${project.id}/paginate`, { method: "POST", body: "{}" });
    setPagination(d);
    return { notice: `Paginated: ${d.summary?.totalPages} pages (${d.summary?.openers} openers, ${d.summary?.continuations} continuations, ${d.summary?.compactions} compacted).` };
  });

  const doMatter = () => run("Planning front & back matter", async () => {
    const d = await api(`/api/front-matter/${project.id}/plan`, { method: "POST", body: "{}" });
    setMatter(d);
    return { notice: `Front matter: ${d.frontPages?.length || 0} pages · Back matter: ${d.backPages?.length || 0} pages · Total book: ${d.totalBookPages}.` };
  });

  const loadRenders = useCallback(() => run("Loading page roster", async () => {
    const d = await api(`/api/whole-page-render/project/${project.id}`);
    setRenders(d);
    return { notice: `${d.total} render rows · ${d.bookReady} book-ready.` };
  }), [api, project, run]);

  const previewPage = (pageId) => run("Building no-spend preview", async () => {
    const d = await api(`/api/whole-page-render/page/${pageId}/preview-package`);
    setPreview(d);
    return { notice: `Preview ready for ${d.authority?.entryTitle || pageId} (no spend).` };
  });

  const renderPage = (pageId) => run("Rendering page (paid)", async () => {
    const d = await api(`/api/whole-page-render/${pageId}`, { method: "POST", body: "{}" });
    await loadRenders();
    return { notice: `Rendered v${d.version} (${d.status}).` };
  });

  const renderAction = (renderId, action, label) => run(label, async () => {
    await api(`/api/whole-page-render/${renderId}/${action}`, { method: "POST", body: "{}" });
    await loadRenders();
    return { notice: `${label} done.` };
  });

  const genCover = () => run("Generating cover (paid)", async () => {
    const d = await api(`/api/projects/${project.id}/generate-cover-artwork`, { method: "POST", body: "{}" });
    setCover(d);
    return { notice: "Cover artwork generated." };
  });

  const assemble = () => run("Assembling interior PDF", async () => {
    const d = await api(`/api/whole-page-render/project/${project.id}/assemble`, { method: "POST", body: "{}" });
    setAssembly(d);
    return { notice: d.blocked ? "Assembly blocked — see validation report." : `Interior assembled: ${d.assembledPages} pages.` };
  });

  const doneFlags = useMemo(() => ({
    project: !!project,
    manuscript: !!project?.manuscriptPath,
    setup: !!project,
    breakdown: !!breakdown,
    paginate: !!pagination,
    matter: !!matter,
    render: (renders?.bookReady || 0) > 0,
    cover: !!cover,
    assemble: !!assembly && !assembly.blocked,
  }), [project, breakdown, pagination, matter, renders, cover, assembly]);

  return (
    <div style={S.shell}>
      <aside style={S.side}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 2 }}>Wild Lands</div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>Operator Production Console</div>
        {STEPS.map((st) => (
          <div key={st.key} style={S.step(step === st.key, doneFlags[st.key])} onClick={() => setStep(st.key)}>
            <span style={S.dot(doneFlags[st.key])}>{doneFlags[st.key] ? "✓" : ""}</span>
            <span>{st.label}</span>
          </div>
        ))}
        <div style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontSize: 12, color: C.muted }}>
          {project ? <>Active: <b style={{ color: C.ink }}>{project.title}</b></> : "No project open"}
        </div>
        {onExitToLegacy && (
          <button style={{ ...S.ghost, marginTop: 14, fontSize: 11 }} onClick={onExitToLegacy}>Legacy tools ↗</button>
        )}
      </aside>

      <main style={S.main}>
        {busy && <div style={{ ...S.pill(C.orange), marginBottom: 10 }}>⏳ {busy}…</div>}
        {error && <div style={{ ...S.card, borderColor: C.red, color: C.red, marginTop: 0 }}>⚠ {error}</div>}
        {notice && !error && <div style={{ ...S.card, borderColor: C.green, marginTop: 0 }}>{notice}</div>}

        {step === "project" && (
          <Panel title="Project" sub="Open an existing book or create a new one.">
            <div style={S.card}>
              <b>Open existing</b>
              <div style={{ marginTop: 8 }}>
                {projects.length === 0 && <span style={{ color: C.muted }}>No projects yet.</span>}
                {projects.map((p) => (
                  <button key={p.id} style={project?.id === p.id ? S.btn("ok") : S.ghost} onClick={() => { setProject(p); setNotice(`Opened “${p.title}”.`); }}>
                    {p.title} <span style={{ color: project?.id === p.id ? "#fff" : C.muted, fontSize: 11 }}>· {p.status}</span>
                  </button>
                ))}
              </div>
              <button style={S.ghost} onClick={() => loadProjects().catch(() => {})}>↻ Refresh</button>
            </div>
            <div style={S.card}>
              <b>Create new</b>
              <LabeledInput label="Book title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
              <LabeledInput label="Subtitle" value={form.subtitle} onChange={(v) => setForm({ ...form, subtitle: v })} />
              <LabeledInput label="Author / pen name" value={form.author} onChange={(v) => setForm({ ...form, author: v })} />
              <button style={S.btn()} onClick={() => createProject().then(() => setStep("manuscript")).catch(() => {})}>Create project →</button>
            </div>
          </Panel>
        )}

        {step === "manuscript" && (
          <Panel title="Manuscript" sub="Paste or drop the master manuscript (Markdown). This is the source of truth for breakdown, pagination, and the glossary.">
            <Guard project={project} setStep={setStep} />
            {project && (
              <div style={S.card}>
                <DropZone onText={(t, n) => { setManuscript(t); setManuscriptName(n); }} />
                <textarea style={{ ...S.input, minHeight: 200, fontFamily: "monospace", fontSize: 12 }} value={manuscript} placeholder="# Chapter 1 …" onChange={(e) => setManuscript(e.target.value)} />
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{manuscript.length.toLocaleString()} chars{manuscriptName ? ` · ${manuscriptName}` : ""}</div>
                <button style={S.btn()} onClick={() => upload().then(() => setStep("setup")).catch(() => {})}>Upload manuscript →</button>
              </div>
            )}
          </Panel>
        )}

        {step === "setup" && (
          <Panel title="Book Setup" sub="The essentials the production pipeline needs. Visual style is locked by the Wild Lands Publishing Standard — there is nothing to configure there.">
            <Guard project={project} setStep={setStep} />
            {project && (
              <div style={S.card}>
                <LabeledInput label="Book title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
                <LabeledInput label="Subtitle" value={form.subtitle} onChange={(v) => setForm({ ...form, subtitle: v })} />
                <LabeledInput label="Author / pen name (comma-separate co-authors)" value={form.author} onChange={(v) => setForm({ ...form, author: v })} />
                <label style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 600 }}>Trim size
                  <select style={S.input} value={form.trim} onChange={(e) => setForm({ ...form, trim: e.target.value })}>
                    <option value="7x10">Hardcover 7 × 10</option>
                    <option value="6x9">Paperback 6 × 9</option>
                    <option value="8.5x11">Large 8.5 × 11</option>
                  </select>
                </label>
                <button style={S.btn()} onClick={() => saveSetup().then(() => setStep("breakdown")).catch(() => {})}>Save setup →</button>
              </div>
            )}
          </Panel>
        )}

        {step === "breakdown" && (
          <StepRun title="Breakdown" sub="Deterministically split the manuscript into chapters and entries (no AI, no spend)."
            project={project} setStep={setStep} actionLabel="Run breakdown" onRun={() => doBreakdown()} result={breakdown && (
              <ul style={{ marginTop: 10 }}>{((breakdown.manifests || []).find((m) => m.type === "BOOK")?.content?.chapters || []).map((c) => (
                <li key={c.chapterNumber}>{c.chapterNumber}. {c.chapterTitle}</li>
              ))}</ul>
            )} />
        )}

        {step === "paginate" && (
          <StepRun title="Paginate" sub="Flow the chapter body into pages with the body flow engine (no spend). Reference sections use the two-column reference model."
            project={project} setStep={setStep} actionLabel="Paginate body" onRun={() => doPaginate()} result={pagination && (
              <Json data={pagination.summary} />
            )} />
        )}

        {step === "matter" && (
          <StepRun title="Front & Back Matter" sub="Generate title, copyright, contents (TOC from real page numbers), glossary, index, sources, about-author. Reference sections are AI-rendered; others composed deterministically. No spend here."
            project={project} setStep={setStep} actionLabel="Generate front & back matter" onRun={() => doMatter()} result={matter && (
              <div>
                <div><b>Front:</b> {(matter.frontPages || []).map((p) => p.kind).join(", ")}</div>
                <div style={{ marginTop: 6 }}><b>Back:</b> {(matter.backPages || []).map((p) => p.kind).join(", ")}</div>
                {(matter.omitted || []).length > 0 && <div style={{ marginTop: 6, color: C.muted }}>Omitted: {matter.omitted.map((o) => o.page).join(", ")}</div>}
              </div>
            )} />
        )}

        {step === "render" && (
          <Panel title="Render Pages" sub="Each page is rendered as one finished, text-baked image by the whole-page AI pipeline. Preview is free; rendering costs spend.">
            <Guard project={project} setStep={setStep} />
            {project && (
              <>
                <button style={S.ghost} onClick={() => loadRenders().catch(() => {})}>↻ Load roster</button>
                {renders && (
                  <>
                    <div style={{ marginTop: 8 }}>
                      {Object.entries(renders.byStatus || {}).map(([k, v]) => <span key={k} style={{ ...S.pill(statusColor(k)), marginRight: 6 }}>{k}: {v}</span>)}
                    </div>
                    <div style={S.grid}>
                      {(renders.renders || []).map((r) => {
                        const key = (r.imagePath || "").match(/([^/]+)\.png$/)?.[1] || r.pageId.slice(0, 8);
                        return (
                          <div key={r.id} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, background: "#fff" }}>
                            {r.imagePath ? <img alt={key} src={fileUrl(r.imagePath)} style={{ width: "100%", borderRadius: 4, display: "block" }} /> : <div style={{ height: 90, background: C.field, borderRadius: 4 }} />}
                            <div style={{ fontSize: 11, marginTop: 6, fontWeight: 700, wordBreak: "break-all" }}>{key}</div>
                            <div style={{ ...S.pill(statusColor(r.status)), marginTop: 4 }}>{r.status}</div>
                            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                              <button style={{ ...S.ghost, margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => previewPage(r.pageId).catch(() => {})}>Preview</button>
                              <button style={{ ...S.btn("spend"), margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => renderPage(r.pageId).catch(() => {})}>Render</button>
                              {r.status === "RENDERED" && <button style={{ ...S.btn("ok"), margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => renderAction(r.id, "approve", "Approve").catch(() => {})}>Approve</button>}
                              {r.status === "APPROVED" && <button style={{ ...S.btn("ok"), margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => renderAction(r.id, "print-prep", "Print-prep").catch(() => {})}>Print-prep</button>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                {preview && (
                  <div style={S.card}>
                    <b>Preview — {preview.authority?.entryTitle} ({preview.authority?.layoutFamilyLabel})</b>
                    {preview.input?.blueprintImage?.dataUri && <img alt="blueprint" src={preview.input.blueprintImage.dataUri} style={{ width: 220, border: `1px solid ${C.line}`, borderRadius: 6, display: "block", marginTop: 8 }} />}
                    <details style={{ marginTop: 8 }}><summary>Full prompt</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "#fff", padding: 10, borderRadius: 6, maxHeight: 320, overflow: "auto" }}>{preview.input?.prompt}</pre></details>
                  </div>
                )}
              </>
            )}
          </Panel>
        )}

        {step === "cover" && (
          <Panel title="Cover" sub="The cover is a SEPARATE full-wrap file (back + spine + front), not an interior page. It gets its own dedicated prompt.">
            <Guard project={project} setStep={setStep} />
            {project && (
              <div style={S.card}>
                <button style={S.btn("spend")} onClick={() => genCover().catch(() => {})}>Generate cover artwork →</button>
                {cover && <Json data={cover} />}
              </div>
            )}
          </Panel>
        )}

        {step === "assemble" && (
          <Panel title="Assemble & Export" sub="Merge every book-ready (approved + print-prepped) page into the interior PDF in spine order. Assembly blocks if anything is missing or fails preflight.">
            <Guard project={project} setStep={setStep} />
            {project && (
              <div style={S.card}>
                <button style={S.btn()} onClick={() => assemble().catch(() => {})}>Assemble interior PDF →</button>
                {assembly && (
                  <div style={{ marginTop: 10 }}>
                    <span style={S.pill(assembly.blocked ? C.red : C.green)}>{assembly.blocked ? "BLOCKED" : "ASSEMBLED"}</span>
                    {assembly.interiorPdfPath && <a style={{ ...S.btn("ok"), textDecoration: "none", display: "inline-block" }} href={fileUrl(assembly.interiorPdfPath)} target="_blank" rel="noreferrer">Download interior PDF</a>}
                    {assembly.blocked && <Json data={{ missing: assembly.missing, preflightFailures: assembly.preflightFailures, noPrintOutput: assembly.noPrintOutput }} />}
                  </div>
                )}
              </div>
            )}
          </Panel>
        )}
      </main>
    </div>
  );
}

function Panel({ title, sub, children }) {
  return (<div><h1 style={S.h1}>{title}</h1><p style={S.sub}>{sub}</p>{children}</div>);
}
function Guard({ project, setStep }) {
  if (project) return null;
  return <div style={{ ...S.card, borderColor: C.orange }}>Open or create a project first. <button style={S.ghost} onClick={() => setStep("project")}>Go to Project</button></div>;
}
function StepRun({ title, sub, project, setStep, actionLabel, onRun, result }) {
  return (
    <Panel title={title} sub={sub}>
      <Guard project={project} setStep={setStep} />
      {project && <div style={S.card}><button style={S.btn()} onClick={() => onRun().catch(() => {})}>{actionLabel}</button>{result}</div>}
    </Panel>
  );
}
function LabeledInput({ label, value, onChange }) {
  return (<label style={{ display: "block", marginTop: 10, fontSize: 13, fontWeight: 600 }}>{label}<input style={S.input} value={value} onChange={(e) => onChange(e.target.value)} /></label>);
}
function Json({ data }) {
  return <pre style={{ whiteSpace: "pre-wrap", fontSize: 11.5, background: "#fff", padding: 10, borderRadius: 6, marginTop: 10, maxHeight: 300, overflow: "auto", border: `1px solid ${C.line}` }}>{JSON.stringify(data, null, 2)}</pre>;
}
function DropZone({ onText }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) f.text().then((t) => onText(t, f.name)); }}
      style={{ border: `2px dashed ${over ? C.blue : C.line}`, borderRadius: 8, padding: 14, textAlign: "center", color: C.muted, marginBottom: 8, background: over ? "#eef4fb" : "transparent" }}
    >
      Drop a .md / .txt file here, or paste below.
    </div>
  );
}
