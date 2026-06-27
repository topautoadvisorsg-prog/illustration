/**
 * Wild Lands — Operator Production Console.  [build: cover-PDF export]
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
  // STRUCTURAL build step — re-running rebuilds FM/BM rows and discards their
  // renders. The panel marks it clearly and requires confirmation. Reviewing &
  // rendering the resulting pages happens in Step 7.
  { key: "matter", label: "6 · Build Front/Back Matter", purpose: "BUILD step: makes title, copyright, TOC, glossary, index. Review & render them in Step 7." },
  { key: "render", label: "7 · Render & Review", purpose: "The cover (one full wrap) plus every interior page: render, review and approve." },
  { key: "assemble", label: "8 · Build Book", purpose: "Assemble approved pages + cover into print-ready files (300+ DPI)." },
];

function statusColor(s) {
  const k = String(s || "").toUpperCase();
  if (k === "APPROVED" || k === "RENDERED") return C.green;
  if (k === "FAILED" || k === "REJECTED") return C.red;
  if (k === "RENDERING" || k === "QUEUED") return C.orange;
  return C.muted;
}

// Display-only Roman numeral for the Volume preview (volume is stored as a number).
function roman(n) {
  if (!Number.isFinite(n) || n <= 0) return "";
  const t = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "", rem = Math.floor(n);
  for (const [v, sym] of t) while (rem >= v) { out += sym; rem -= v; }
  return out;
}

export default function ProductionConsole({ onExitToLegacy }) {
  const [step, setStep] = useState("project");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null); // active project object
  const [form, setForm] = useState({ title: "", subtitle: "", coverDescription: "", author: "", series: "", volume: 1, trim: "7x10", backBlurb: "", backFeatures: "", backAuthorBio: "" });
  const [manuscript, setManuscript] = useState("");
  const [manuscriptName, setManuscriptName] = useState("");

  const [breakdown, setBreakdown] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [pages, setPages] = useState(null); // paginated page rows (zones + text)
  const [zoom, setZoom] = useState(null); // page being enlarged in the preview
  const [matter, setMatter] = useState(null);
  const [renders, setRenders] = useState(null); // { total, byStatus, bookReady, renders:[] }
  const [preview, setPreview] = useState(null); // active preview package
  const [showGuides, setShowGuides] = useState(true); // KDP-style trim/safe overlay on the page preview
  const [coverAR, setCoverAR] = useState(null); // full-wrap image aspect ratio (w/h), for spine fold lines
  const [cover, setCover] = useState(null);
  const [assembly, setAssembly] = useState(null);
  const [epubReport, setEpubReport] = useState(null); // Kindle EPUB build report (preview endpoint)
  const [status, setStatus] = useState({}); // real backend progress for the step checkmarks
  const [authed, setAuthed] = useState(false); // shared-password gate
  const [authReady, setAuthReady] = useState(false); // initial stored-password check done

  const api = useCallback(async (path, options = {}) => {
    const pw = sessionStorage.getItem("wl_pw") || "";
    const res = await fetch(`${BACKEND}${path}`, {
      ...options,
      headers: { ...(options.body != null ? { "Content-Type": "application/json" } : {}), ...(pw ? { Authorization: `Bearer ${pw}` } : {}), ...(options.headers || {}) },
    });
    if (res.status === 401) { sessionStorage.removeItem("wl_pw"); setAuthed(false); throw new Error("Login required."); }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) throw new Error((data && (data.message || data.error)) || `${res.status} ${res.statusText}`);
    return data;
  }, []);

  // Append the shared key as a query param so <img>/<iframe>/PDF loads (which
  // can't send an Authorization header) pass the gate too.
  const fileUrl = useCallback((p) => { const pw = sessionStorage.getItem("wl_pw") || ""; return `${BACKEND}/api/whole-page-render/file?path=${encodeURIComponent(p)}${pw ? `&k=${encodeURIComponent(pw)}` : ""}`; }, []);

  // Validate a candidate password against a protected endpoint (any non-401 = ok).
  const checkAuth = useCallback(async (candidate) => {
    try {
      const res = await fetch(`${BACKEND}/api/projects`, { headers: { Authorization: `Bearer ${candidate}` } });
      return res.status !== 401;
    } catch { return false; }
  }, []);

  const doLogin = useCallback(async (candidate) => {
    const ok = await checkAuth(candidate);
    if (!ok) throw new Error("Wrong password.");
    sessionStorage.setItem("wl_pw", candidate);
    setAuthed(true);
  }, [checkAuth]);

  // On load, accept a previously-entered password from this browser session.
  useEffect(() => {
    const stored = sessionStorage.getItem("wl_pw");
    if (!stored) { setAuthReady(true); return; }
    checkAuth(stored).then((ok) => {
      if (ok) setAuthed(true); else sessionStorage.removeItem("wl_pw");
      setAuthReady(true);
    });
  }, [checkAuth]);

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

  useEffect(() => { if (authed) loadProjects().catch(() => {}); }, [authed, loadProjects]);

  // Step checkmarks reflect the project's REAL state (not just what was clicked
  // this session): manifests => breakdown, CH pages => paginate, FM/BM pages =>
  // matter, book-ready renders => render. Loaded whenever the active project
  // changes, so opening a project shows an accurate, consistent progress trail.
  const loadStatus = useCallback(async (id) => {
    const [mans, pp, rd] = await Promise.all([
      api(`/api/projects/${id}/manifests`).catch(() => ({ manifests: [] })),
      api(`/api/projects/${id}/paginated-pages`).catch(() => ({ pages: [] })),
      api(`/api/whole-page-render/project/${id}`).catch(() => ({ bookReady: 0 })),
    ]);
    const ps = pp.pages || pp.paginatedPages || [];
    setStatus({
      breakdown: (mans.manifests || []).length > 0,
      paginate: ps.some((p) => String(p.pageKey || "").startsWith("CH")),
      matter: ps.some((p) => /^(FM_|BM_)/.test(p.pageKey || "")),
      render: (rd.bookReady || 0) > 0,
    });
    // Surface the existing chapter structure on revisit so the Breakdown step
    // shows what the book IS, not just a "Run breakdown" button.
    if ((mans.manifests || []).length > 0) setBreakdown(mans);
  }, [api]);

  useEffect(() => { if (project?.id) loadStatus(project.id).catch(() => {}); else setStatus({}); }, [project?.id, loadStatus]);

  // The full-wrap cover lives at a deterministic storage path. Probe it whenever
  // the active project changes so an already-generated cover shows in the card
  // without re-spending. If the image 404s (no cover yet), the <img> onError
  // clears it back to "No cover generated yet."
  useEffect(() => {
    if (project?.id) setCover({ imagePath: `${project.id}/cover/cover-wrap-art.png`, _probe: true, _cb: Date.now() });
    else setCover(null);
  }, [project?.id]);

  // Sync the Setup form with the OPEN project's real config. The project-list
  // endpoint omits `config`, so without this, visiting Setup on an existing book
  // shows stale defaults — and Save would overwrite the real title/author/trim.
  // Fetch the full project and populate the form from it whenever the active
  // project changes.
  useEffect(() => {
    if (!project?.id) return undefined;
    let cancelled = false;
    api(`/api/projects/${project.id}/config`).then((d) => {
      const cfg = d?.config;
      if (cancelled || !cfg) return;
      const w = cfg.trimSize?.widthIn, h = cfg.trimSize?.heightIn;
      const trim = w === 6 && h === 9 ? "6x9" : w === 8.5 && h === 11 ? "8.5x11" : "7x10";
      const authors = cfg.publishing?.authors;
      const bd = cfg.publishing?.bookDescription ?? {};
      setForm({
        title: cfg.publishing?.title ?? cfg.title ?? "",
        subtitle: cfg.publishing?.subtitle ?? cfg.subtitle ?? "",
        coverDescription: cfg.publishing?.coverDescription ?? "",
        author: (authors && authors.length ? authors.join(", ") : cfg.authorName) ?? "",
        series: cfg.publishing?.series?.name ?? "",
        volume: cfg.volume ?? cfg.publishing?.series?.volumeNumber ?? 1,
        trim,
        // Back-cover copy: blurb (paragraph), features (one per line), author note.
        backBlurb: bd.blurb ?? (bd.hooks?.length ? bd.hooks.join("\n") : ""),
        backFeatures: (bd.features ?? []).join("\n"),
        backAuthorBio: bd.authorBio ?? "",
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [project?.id, api]);

  function trimSize(t) {
    if (t === "6x9") return { widthIn: 6, heightIn: 9, bleedIn: 0.125 };
    if (t === "8.5x11") return { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 };
    return { widthIn: 7, heightIn: 10, bleedIn: 0.125 };
  }

  function cleanConfig() {
    // Minimal, clean config — the whole-page pipeline takes its visual DNA from
    // the locked Publishing Standard, so NO legacy style/palette blob is sent.
    // All book identity (title/subtitle/cover description/author/series/volume)
    // is data, set per book — nothing book- or series-specific is hardcoded.
    const vol = Math.max(1, parseInt(form.volume, 10) || 1);
    const series = (form.series || "").trim();
    const coverDescription = (form.coverDescription || "").trim();
    // Back cover — three distinct pieces (data-driven, optional). Features is a
    // newline-per-item textarea → array. Omit the whole block when all empty.
    const blurb = (form.backBlurb || "").trim();
    const features = (form.backFeatures || "").split("\n").map((f) => f.trim()).filter(Boolean);
    const authorBio = (form.backAuthorBio || "").trim();
    const bookDescription = blurb || features.length || authorBio
      ? { blurb: blurb || undefined, features: features.length ? features : undefined, authorBio: authorBio || undefined }
      : undefined;
    return {
      volume: vol,
      title: form.title,
      subtitle: form.subtitle,
      authorName: form.author,
      trimSize: trimSize(form.trim),
      publishing: {
        title: form.title,
        subtitle: form.subtitle,
        authors: form.author.split(",").map((a) => a.trim()).filter(Boolean),
        coverDescription: coverDescription || undefined,
        series: series ? { name: series, volumeNumber: vol } : undefined,
        bookDescription,
      },
    };
  }

  const createProject = () => run("Creating project", async () => {
    const d = await api("/api/projects", { method: "POST", body: JSON.stringify({ config: cleanConfig() }) });
    setProject(d.project); setProjects((c) => [d.project, ...c.filter((p) => p.id !== d.project.id)]);
    return { notice: `Created “${d.project.title}”.` };
  });

  const deleteProject = (p) => run("Deleting project", async () => {
    await api(`/api/projects/${p.id}`, { method: "DELETE" });
    setProjects((c) => c.filter((x) => x.id !== p.id));
    if (project?.id === p.id) setProject(null);
    return { notice: `Deleted “${p.title}”.` };
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
    // If the book was already broken down, the backend refuses a re-run. That's
    // fine for the operator — we just show the existing structure instead of
    // surfacing a developer-facing "rerun blocked" error.
    try {
      await api(`/api/projects/${project.id}/manifests`, { method: "POST" });
    } catch (e) {
      if (!/already has manifests|rerun is blocked|manifest versioning/i.test(String(e.message || e))) throw e;
    }
    const m = await api(`/api/projects/${project.id}/manifests`);
    setBreakdown(m);
    const chapters = (m.manifests || []).find((x) => x.kind === "BOOK")?.content?.chapters || [];
    const entries = (m.manifests || []).filter((x) => x.kind === "PAGE").length;
    return { notice: `Breakdown: ${chapters.length} chapter(s), ${entries} entr${entries === 1 ? "y" : "ies"}.` };
  });

  // Pull the planning preview: each page carries its layout zones + the text
  // that flows into the reading field, so the operator can SEE the pages (where
  // text goes, whether it fits and reads well) before any render spend.
  const loadPreview = useCallback(async () => {
    // pagination-preview reflects the REAL flow-engine pages the renderer will use:
    // opener + continuation pages, each with its own allotted Reading-Field text
    // measured against its own layout (chars vs capacity, FITS/TIGHT/OVERFLOW/
    // UNDERFILL). NOT the legacy text-fit-preview, which re-planned the un-split
    // per-entry manifests and reported false overflow. No render, no spend.
    const tf = await api(`/api/projects/${project.id}/pagination-preview`, { method: "POST", body: "{}" });
    const list = (tf.pages || []).map((p) => ({
      pageKey: p.pageKey,
      entryTitle: p.entryTitle,
      layoutTemplate: p.layoutTemplate,
      fitStatus: p.fit?.status,
      fit: p.fit,
      zones: p.allocation,
      blockers: p.blockers,
    }));
    setPages(list);
    return list;
  }, [api, project]);

  const doPaginate = (confirmOrphan = false) => run("Paginating", async () => {
    try {
      const d = await api(`/api/projects/${project.id}/paginate`, { method: "POST", body: JSON.stringify(confirmOrphan ? { confirmOrphanRenders: true } : {}) });
      setPagination(d);
      await loadPreview();
      return { notice: `Paginated: ${d.summary?.totalPages} pages (${d.summary?.openers} openers, ${d.summary?.continuations} continuations, ${d.summary?.compactions} compacted).` };
    } catch (e) {
      // Re-pagination is blocked when it would orphan paid page renders — show
      // the EXISTING page layouts instead of a raw error. The operator only
      // re-paginates (discarding those renders) after changing the manuscript.
      if (String(e.message || "").toUpperCase().includes("ORPHAN")) {
        const list = await loadPreview();
        return { notice: `Showing the current ${list.length} page layouts. Re-paginating would discard existing page renders — use “Re-paginate (discard renders)” only after a manuscript change.` };
      }
      throw e;
    }
  });

  const doMatter = () => run("Planning front & back matter", async () => {
    const d = await api(`/api/front-matter/${project.id}/plan`, { method: "POST", body: "{}" });
    setMatter(d);
    return { notice: `Front matter: ${d.frontPages?.length || 0} pages · Back matter: ${d.backPages?.length || 0} pages · Total book: ${d.totalBookPages}.` };
  });

  const loadRenders = useCallback(() => run("Loading page roster", async () => {
    // Merge the FULL page roster (every front/body/back page) with render
    // statuses, so pages that have not been rendered yet (body, reference) still
    // appear with a Render button — not just pages that already have a render.
    const [roster, rd] = await Promise.all([
      api(`/api/projects/${project.id}/paginated-pages`),
      api(`/api/whole-page-render/project/${project.id}`),
    ]);
    const rosterPages = roster.pages || roster.paginatedPages || [];
    const byPage = new Map();
    for (const r of rd.renders || []) { if (!byPage.has(r.pageId) || r.active) byPage.set(r.pageId, r); }
    const section = (k) => (k.startsWith("FM_") ? "Front" : k.startsWith("BM_") ? "Back" : "Body");
    // Render list follows the assembled-book order: front matter (title page first),
    // then body in reading order, then back matter (glossary/index) last. Sorting by
    // pageKey alone put "BM_" before "CH_" before "FM_" — glossary first, title last.
    const sectionRank = (k) => (k.startsWith("FM_") ? 0 : k.startsWith("BM_") ? 2 : 1);
    const merged = rosterPages
      .map((p) => { const r = byPage.get(p.id) || null; return { pageId: p.id, pageKey: p.pageKey, plannedPageNumber: p.plannedPageNumber ?? 0, spineOrder: p.spineOrder ?? 0, section: section(p.pageKey), entryTitle: p.entryTitle, status: r ? r.status : "NOT RENDERED", imagePath: r ? r.imagePath : null, renderId: r ? r.id : null, version: r ? r.version : 0, approvedForBook: r ? !!r.approvedForBook : false, printReady: r ? !!(r.printPdfPath && r.preflightPassed) : false }; })
      // Order by the canonical book sequence: front/back matter carry a spineOrder
      // (1..n within their section); body pages don't, so they fall back to the
      // planned page number. This matches the assembled book and avoids ties that
      // previously let an alphabetical pageKey tiebreaker mis-order back matter
      // (e.g. About-the-Series wedged between Index pages).
      .sort((a, b) => { const oa = a.spineOrder > 0 ? a.spineOrder : a.plannedPageNumber; const ob = b.spineOrder > 0 ? b.spineOrder : b.plannedPageNumber; return sectionRank(a.pageKey) - sectionRank(b.pageKey) || oa - ob || a.plannedPageNumber - b.plannedPageNumber || a.pageKey.localeCompare(b.pageKey); });
    setRenders({ ...rd, merged });
    const pending = merged.filter((m) => m.status === "NOT RENDERED").length;
    return { notice: `${merged.length} pages · ${rd.bookReady || 0} book-ready · ${pending} not rendered.` };
  }), [api, project, run]);

  const renderAll = (filter) => run("Rendering all pending pages (paid)", async () => {
    const pending = (renders?.merged || []).filter((m) => m.status === "NOT RENDERED" && filter(m));
    for (const m of pending) await api(`/api/whole-page-render/${m.pageId}`, { method: "POST", body: "{}" });
    await loadRenders();
    return { notice: `Rendered ${pending.length} page(s).` };
  });

  const previewPage = (pageId, imagePath) => run("Building no-spend preview", async () => {
    const d = await api(`/api/whole-page-render/page/${pageId}/preview-package`);
    // Carry the rendered image (if any) so the modal shows the actual page, not just
    // the text package — lets the operator SEE a rendered page (e.g. the index) large.
    setPreview({ ...d, _imagePath: imagePath || null, _cb: Date.now() });
    return { notice: `Preview ready for ${d.authority?.entryTitle || pageId} (no spend).` };
  });

  const renderPage = (pageId) => run("Rendering page (paid)", async () => {
    const d = await api(`/api/whole-page-render/${pageId}`, { method: "POST", body: "{}" });
    await loadRenders();
    return { notice: `Rendered v${d.version} (${d.status}).` };
  });

  // One operator action approves a page INTO the book: approve the render,
  // print-prep it, and select it for the book. The technical 3-step sequence is
  // hidden — the operator just decides "yes, this page belongs in the book".
  const approveForBook = (renderId) => run("Approving page for the book", async () => {
    await api(`/api/whole-page-render/${renderId}/approve`, { method: "POST", body: "{}" });
    await api(`/api/whole-page-render/${renderId}/print-prep`, { method: "POST", body: "{}" });
    await api(`/api/whole-page-render/${renderId}/select-for-book`, { method: "POST", body: "{}" }).catch(() => {});
    await loadRenders();
    return { notice: "Page approved and added to the book." };
  });

  const rejectRender = (renderId) => run("Rejecting page", async () => {
    await api(`/api/whole-page-render/${renderId}/reject`, { method: "POST", body: JSON.stringify({ reason: "operator rejected" }) });
    await loadRenders();
    return { notice: "Page rejected — render it again to try a new version." };
  });

  const genCover = () => run("Generating cover (paid)", async () => {
    const d = await api(`/api/projects/${project.id}/generate-cover-artwork`, { method: "POST", body: "{}" });
    setCover({ ...d, _cb: Date.now() });
    return { notice: "Cover artwork generated." };
  });

  const assemble = () => run("Assembling the finished book", async () => {
    const d = await api(`/api/whole-page-render/project/${project.id}/assemble`, { method: "POST", body: "{}" });
    if (d.blocked) { setAssembly(d); return { notice: d.coverStale ? "Export blocked — the cover is out of date for the current page count. Regenerate it in Step 7 · Render & Review (the Cover card at the top)." : "Assembly blocked — finish the pages listed below, then build again." }; }
    // A printer-complete export is interior PDF + the separate full-wrap cover PDF
    // (spine sized to the final page count). Produce both here so the operator
    // leaves this step with everything the printer needs.
    let coverPdfPath = null;
    try {
      const c = await api(`/api/projects/${project.id}/render-cover?format=json`, { method: "POST", body: "{}" });
      coverPdfPath = c.storedPath || null;
    } catch { /* cover PDF needs the cover artwork (Step 7 · Render & Review); interior is still valid without it */ }
    setAssembly({ ...d, coverPdfPath });
    return { notice: coverPdfPath ? `Book built: ${d.assembledPages} pages + print cover.` : `Interior built: ${d.assembledPages} pages. Generate the cover in Step 7 · Render & Review for a complete print package.` };
  });

  // Kindle build report (chapters/entries/words/cover) from the read-only preview
  // endpoint. No image spend; reads the existing structured text + cover.
  const loadEpubReport = () => run("Reading Kindle build report", async () => {
    const d = await api(`/api/projects/${project.id}/export/kindle-epub/preview`);
    setEpubReport(d);
    return { notice: `Kindle: ${d.stats?.entries ?? 0} entries · ${d.stats?.words ?? 0} words.` };
  });

  // Export the Kindle EPUB. The endpoint returns binary; the shared api() helper
  // parses text, so do a direct fetch + blob download (with the same auth header).
  const downloadEpub = () => run("Building Kindle EPUB", async () => {
    const pw = sessionStorage.getItem("wl_pw") || "";
    const res = await fetch(`${BACKEND}/api/projects/${project.id}/export/kindle-epub`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      body: "{}",
    });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const j = await res.json(); msg = j.message || j.error || msg; } catch { /* binary/no body */ }
      throw new Error(`Kindle export failed: ${msg}`);
    }
    const blob = await res.blob();
    const cd = res.headers.get("content-disposition") || "";
    const m = /filename="?([^"]+)"?/.exec(cd);
    const name = m ? m[1] : "book_KINDLE.epub";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    return { notice: `Kindle EPUB downloaded: ${name}` };
  });

  const doneFlags = useMemo(() => ({
    project: !!project,
    manuscript: !!project?.manuscriptPath,
    setup: !!project?.manuscriptPath,
    breakdown: !!status.breakdown || !!breakdown,
    paginate: !!status.paginate || !!pagination,
    matter: !!status.matter || !!matter,
    render: !!status.render || (renders?.bookReady || 0) > 0,
    cover: !!cover,
    assemble: !!assembly && !assembly.blocked,
  }), [project, status, breakdown, pagination, matter, renders, cover, assembly]);

  if (!authReady) return null; // brief: checking a stored password
  if (!authed) return <LoginScreen onLogin={doLogin} />;

  return (
    <div style={S.shell}>
      <aside style={S.side}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 2 }}>Wild Lands</div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>Operator Production Console</div>
        {STEPS.map((st) => (
          <div key={st.key} style={S.step(step === st.key, doneFlags[st.key])} onClick={() => setStep(st.key)}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={S.dot(doneFlags[st.key])}>{doneFlags[st.key] ? "✓" : ""}</span>
              <span>{st.label}</span>
            </div>
            {st.purpose && <div style={{ fontSize: 11, color: C.muted, marginLeft: 24, marginTop: 3, lineHeight: 1.3 }}>{st.purpose}</div>}
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
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <button style={{ ...(project?.id === p.id ? S.btn("ok") : S.ghost), margin: 0, flex: 1, textAlign: "left" }} onClick={() => { setProject(p); setNotice(`Opened “${p.title}”.`); }}>
                      {p.title} <span style={{ color: project?.id === p.id ? "#fff" : C.muted, fontSize: 11 }}>· {p.status}</span>
                    </button>
                    <button title={`Delete “${p.title}”`} style={{ ...S.ghost, margin: 0, color: C.red, borderColor: C.red, padding: "6px 10px", fontSize: 11 }}
                      onClick={() => { if (window.confirm(`Permanently delete “${p.title}” and ALL its pages, renders, and cover? This cannot be undone.`)) deleteProject(p).catch(() => {}); }}>✕</button>
                  </div>
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
          <Panel title="Book Setup" sub="The book's identity — title, subtitle/region, cover description, author, series, and volume. These print on the cover, title page, and series page. Visual style is locked by the Publishing Standard.">
            <Guard project={project} setStep={setStep} />
            {project && (
              <div style={S.card}>
                <LabeledInput label="Book title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
                <LabeledInput label="Subtitle / region" value={form.subtitle} onChange={(v) => setForm({ ...form, subtitle: v })} />
                <LabeledInput label="Cover description line" value={form.coverDescription} onChange={(v) => setForm({ ...form, coverDescription: v })} />
                <LabeledInput label="Author / pen name (comma-separate co-authors)" value={form.author} onChange={(v) => setForm({ ...form, author: v })} />
                <LabeledInput label="Series name" value={form.series} onChange={(v) => setForm({ ...form, series: v })} />
                <label style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 600 }}>Volume
                  <input type="number" min="1" step="1" style={S.input} value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} />
                  <span style={{ fontWeight: 400, color: C.muted, fontSize: 12 }}>{form.series && Number(form.volume) > 0 ? `Prints as: ${form.series.toUpperCase()} — VOLUME ${roman(Number(form.volume))}` : "Stored as a number; printed as a Roman numeral."}</span>
                </label>
                <label style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 600 }}>Trim size
                  <select style={S.input} value={form.trim} onChange={(e) => setForm({ ...form, trim: e.target.value })}>
                    <option value="7x10">Hardcover 7 × 10</option>
                    <option value="6x9">Paperback 6 × 9</option>
                    <option value="8.5x11">Large 8.5 × 11</option>
                  </select>
                </label>

                <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Back Cover</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2, marginBottom: 4 }}>
                    Three separate pieces the AI bakes onto the back of the full wrap. The front cover and spine come from the fields above. Leave blank to use a placeholder.
                  </div>
                  <LabeledTextarea label="Hook / main description" rows={5}
                    hint="The lead sales paragraph — what this volume is about."
                    value={form.backBlurb} onChange={(v) => setForm({ ...form, backBlurb: v })} />
                  <LabeledTextarea label="“Inside This Volume” features — one per line" rows={7}
                    hint="Major topics (e.g. Animals — identification and encounters). Each line becomes its own feature entry."
                    value={form.backFeatures} onChange={(v) => setForm({ ...form, backFeatures: v })} />
                  <LabeledTextarea label="Author bio / note" rows={4}
                    hint="Short author biography for the back cover."
                    value={form.backAuthorBio} onChange={(v) => setForm({ ...form, backAuthorBio: v })} />
                </div>

                <button style={S.btn()} onClick={() => saveSetup().then(() => setStep("breakdown")).catch(() => {})}>Save setup →</button>
              </div>
            )}
          </Panel>
        )}

        {step === "breakdown" && (
          <StepRun title="Breakdown" sub="Deterministically split the manuscript into chapters and entries (no AI, no spend)."
            project={project} setStep={setStep} actionLabel="Run breakdown" onRun={() => doBreakdown()} result={breakdown && (() => {
              const chapters = (breakdown.manifests || []).find((m) => m.kind === "BOOK")?.content?.chapters || [];
              const entries = (breakdown.manifests || []).filter((m) => m.kind === "PAGE").length;
              return (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 600 }}>{chapters.length} chapter{chapters.length === 1 ? "" : "s"} · {entries} entr{entries === 1 ? "y" : "ies"}</div>
                  <ul style={{ marginTop: 6 }}>{chapters.map((c) => (
                    <li key={c.chapterNumber}>{c.chapterTitle}{c.entryCount != null ? ` — ${c.entryCount} entr${c.entryCount === 1 ? "y" : "ies"}` : ""}</li>
                  ))}</ul>
                </div>
              );
            })()} />
        )}

        {step === "paginate" && (
          <Panel title="Paginate" sub="Flow the chapter body into pages with the body flow engine (no spend). Reference sections use the two-column reference model.">
            <Guard project={project} setStep={setStep} />
            {project && (
              <div style={S.card}>
                <button style={S.btn()} onClick={() => doPaginate(false).catch(() => {})}>Paginate body</button>
                <button style={S.ghost} onClick={() => run("Loading page layouts", loadPreview).catch(() => {})}>View page layouts</button>
                <button style={S.ghost} onClick={() => { if (window.confirm("Re-paginate? This DISCARDS existing page renders. Only do this after changing the manuscript.")) doPaginate(true).catch(() => {}); }}>Re-paginate (discard renders)</button>
                {pagination && (
                  <div style={{ marginTop: 10, fontSize: 14 }}>
                    <b>{pagination.summary?.totalPages} pages</b> — {pagination.summary?.openers} openers · {pagination.summary?.continuations} continuations · {pagination.summary?.compactions} compacted.
                  </div>
                )}
                {pages && pages.length > 0 && (
                  <>
                    <div style={{ marginTop: 8, color: C.muted, fontSize: 13 }}>
                      Planning preview — the text flowed into each layout (no illustration yet). Tinted blocks = where art will go. Check the <b>fit</b> chip and click any page to enlarge and confirm it reads well, <i>before</i> any render spend.
                    </div>
                    <div style={S.grid}>
                      {pages.map((p) => <PagePreview key={p.pageKey} page={p} trim={trimSize(form.trim)} onZoom={setZoom} />)}
                    </div>
                  </>
                )}
              </div>
            )}
          </Panel>
        )}

        {step === "matter" && (
          <Panel title="Build Front / Back Matter" sub="This BUILDS the structural pages — title, copyright, contents (TOC), glossary, index, sources, about. No render spend here.">
            <Guard project={project} setStep={setStep} />
            {project && (
              <>
                {/* REVIEW — the safe, non-destructive place to look at FM/BM. */}
                <div style={S.card}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Review front &amp; back matter</div>
                  <div style={{ color: C.muted, fontSize: 13 }}>
                    Once built, the title, copyright, contents, glossary, index and about pages are rendered and reviewed alongside the body in <b>Step 7 · Render &amp; Review</b>. That is the safe place to view and approve them — opening this step does nothing to them.
                  </div>
                  <button style={{ ...S.btn(), marginTop: 10 }} onClick={() => setStep("render")}>Go to Step 7 · Render &amp; Review →</button>
                  {matter && (
                    <div style={{ marginTop: 12, fontSize: 13 }}>
                      <div><b>Front:</b> {(matter.frontPages || []).map((p) => p.kind).join(", ")}</div>
                      <div style={{ marginTop: 6 }}><b>Back:</b> {(matter.backPages || []).map((p) => p.kind).join(", ")}</div>
                      {(matter.omitted || []).length > 0 && <div style={{ marginTop: 6, color: C.muted }}>Omitted: {matter.omitted.map((o) => o.page).join(", ")}</div>}
                    </div>
                  )}
                </div>
                {/* BUILD / REBUILD — structural + destructive, behind a confirm. */}
                <div style={{ ...S.card, borderColor: C.red }}>
                  <div style={{ fontWeight: 700, color: C.red }}>⚠ Build / Rebuild (structural — discards FM/BM renders)</div>
                  <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
                    This regenerates every front &amp; back-matter page from the manuscript + book setup. It <b>deletes and recreates those page rows</b>, so any front/back-matter pages you already rendered or approved are <b>discarded and must be re-rendered</b>. Body chapter pages are never affected. Use it for the first build, or after you change the manuscript or book setup.
                  </div>
                  <button
                    style={{ ...S.btn(), marginTop: 10, background: C.red, color: "#fff", borderColor: C.red }}
                    onClick={() => {
                      const ok = window.confirm(
                        "Build / rebuild front & back matter?\n\nThis DELETES and recreates all front/back-matter pages (title, copyright, contents, glossary, index, about). Any FM/BM renders you've already made will be DISCARDED and must be re-rendered. Body chapter pages are NOT affected.\n\nOK = rebuild   ·   Cancel = keep current pages."
                      );
                      if (ok) doMatter().catch(() => {});
                    }}
                  >
                    Build / Rebuild front &amp; back matter…
                  </button>
                </div>
              </>
            )}
          </Panel>
        )}

        {step === "render" && (
          <Panel title="Render & Review" sub="The cover sits at the top as one full wrap (back, spine, front), then every interior page (front matter, body, back matter) below. Preview is free; rendering costs spend.">
            <Guard project={project} setStep={setStep} />
            {project && (
              <>
                <button style={S.ghost} onClick={() => loadRenders().catch(() => {})}>↻ Load roster</button>
                {renders?.merged && (
                  <button style={{ ...S.btn("spend"), fontSize: 13 }} onClick={() => { if (window.confirm(`Render all ${renders.merged.filter((m) => m.status === "NOT RENDERED").length} not-yet-rendered page(s)? This costs spend.`)) renderAll(() => true).catch(() => {}); }}>Render all pending →</button>
                )}
                {/* COVER — ONE full-wrap file (back | spine | front). One generate action, at the top. */}
                <div style={{ ...S.card, marginTop: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Cover (full wrap: back | spine | front)</div>
                    <button style={{ ...S.btn("spend"), margin: 0, fontSize: 12 }} onClick={() => genCover().catch(() => {})}>{cover ? "Regenerate cover" : "Generate cover"}</button>
                  </div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>One continuous full-bleed image: back cover, spine, and front cover together{cover?.pageCount ? `; spine sized for ${cover.pageCount} interior pages` : ""}. It is a single file, so there is just one generate.</div>
                  {cover?.imagePath
                    ? (
                      <>
                        <a href={`${fileUrl(cover.imagePath)}&v=${cover._cb || 0}`} target="_blank" rel="noreferrer" title="Click to open the full-resolution cover in a new tab" style={{ position: "relative", display: "block", marginTop: 10, width: "100%", overflow: "hidden", border: `1px solid ${C.line}`, borderRadius: 8, background: "#000", cursor: "zoom-in" }}>
                          <img alt="Full wrap cover" src={`${fileUrl(cover.imagePath)}&v=${cover._cb || 0}`} decoding="async" onLoad={(e) => setCoverAR(e.target.naturalWidth && e.target.naturalHeight ? e.target.naturalWidth / e.target.naturalHeight : null)} onError={() => { if (cover._probe) setCover(null); }} style={{ width: "100%", display: "block" }} />
                          {/* QA overlay: outer text-safe box (green) + SPINE FOLD LINES (orange).
                              The spine is derived from the wrap image's real aspect ratio, so it is
                              correct for whatever spine width / page count the cover was built with —
                              no hardcoded constant. Review-only DOM lines, never baked into the export. */}
                          {showGuides && <div style={{ position: "absolute", top: "6.31%", bottom: "6.31%", left: "4.39%", right: "4.39%", border: "1.5px dashed #2f8a3f", pointerEvents: "none", boxSizing: "border-box" }} />}
                          {showGuides && (() => {
                            const td = trimSize(form.trim);
                            const fullH = td.heightIn + 2 * td.bleedIn;
                            const fullW = coverAR ? coverAR * fullH : null;
                            const spineIn = fullW ? fullW - 2 * td.widthIn - 2 * td.bleedIn : null;
                            if (!fullW || !spineIn || spineIn <= 0) return null;
                            const leftPct = ((td.bleedIn + td.widthIn) / fullW) * 100;
                            const rightPct = ((td.bleedIn + td.widthIn + spineIn) / fullW) * 100;
                            return (
                              <>
                                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${leftPct}%`, width: 0, borderLeft: "1.5px dashed #e08a2e", pointerEvents: "none" }} />
                                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${rightPct}%`, width: 0, borderLeft: "1.5px dashed #e08a2e", pointerEvents: "none" }} />
                              </>
                            );
                          })()}
                        </a>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted, marginTop: 6, cursor: "pointer" }}>
                          <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
                          Show guides — <span style={{ color: "#2f8a3f" }}>green = text-safe</span> · <span style={{ color: "#e08a2e" }}>orange = spine folds</span>{coverAR ? ` (spine ≈ ${(coverAR * (trimSize(form.trim).heightIn + 0.25) - 2 * trimSize(form.trim).widthIn - 0.25).toFixed(3)}in)` : ""}
                        </label>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Click the wrap to open it full-size and read every word. Back cover (left) · spine (center) · front cover (right).</div>
                        <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4, fontWeight: 700 }}>Front cover (print · 7×10)</div>
                            <a href={`${fileUrl(cover.imagePath)}&v=${cover._cb || 0}`} target="_blank" rel="noreferrer" title="Open full-size" style={{ display: "block", width: 300, aspectRatio: "7 / 10", overflow: "hidden", border: `1px solid ${C.line}`, borderRadius: 6, background: "#000", cursor: "zoom-in" }}>
                              <img alt="Print front cover" src={`${fileUrl(cover.imagePath)}&v=${cover._cb || 0}`} decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "100% 50%", display: "block" }} />
                            </a>
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4, fontWeight: 700 }}>Kindle eBook front cover <span style={{ ...S.pill(C.blue), fontSize: 9.5, padding: "1px 6px", verticalAlign: "middle" }}>EPUB</span></div>
                            <a href={`${fileUrl(cover.imagePath)}&v=${cover._cb || 0}`} target="_blank" rel="noreferrer" title="Open full-size — exactly the portrait front cover the Kindle EPUB embeds" style={{ display: "block", width: 300, aspectRatio: "1600 / 2560", overflow: "hidden", border: `1px solid ${C.line}`, borderRadius: 6, background: "#000", cursor: "zoom-in" }}>
                              <img alt="Kindle front cover" src={`${fileUrl(cover.imagePath)}&v=${cover._cb || 0}`} decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "93% 50%", display: "block" }} />
                            </a>
                            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4, maxWidth: 300 }}>Portrait 1600×2560 — exactly what the Kindle EPUB embeds (front panel auto-cropped from the wrap).</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4, fontWeight: 700 }}>Back cover + spine</div>
                            <a href={`${fileUrl(cover.imagePath)}&v=${cover._cb || 0}`} target="_blank" rel="noreferrer" title="Open full-size" style={{ display: "block", width: 460, aspectRatio: "13 / 10", overflow: "hidden", border: `1px solid ${C.line}`, borderRadius: 6, background: "#000", cursor: "zoom-in" }}>
                              <img alt="Back cover and spine" src={`${fileUrl(cover.imagePath)}&v=${cover._cb || 0}`} decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "0% 50%", display: "block" }} />
                            </a>
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4, fontWeight: 700 }}>Paperback wrap — fit check <span style={{ ...S.pill(C.orange), fontSize: 9.5, padding: "1px 6px", verticalAlign: "middle" }}>PAPERBACK</span></div>
                            <a href={`${BACKEND}/api/projects/${project.id}/cover/paperback-preview?k=${encodeURIComponent(sessionStorage.getItem("wl_pw") || "")}&v=${cover._cb || 0}`} target="_blank" rel="noreferrer" title="Open full-size — paperback wrap with bleed/trim/safe/spine/barcode guides" style={{ display: "block", width: 460, aspectRatio: "14.9 / 10.25", overflow: "hidden", border: `1px solid ${C.line}`, borderRadius: 6, background: "#fff", cursor: "zoom-in" }}>
                              <img alt="Paperback wrap with KDP guidelines" src={`${BACKEND}/api/projects/${project.id}/cover/paperback-preview?k=${encodeURIComponent(sessionStorage.getItem("wl_pw") || "")}&v=${cover._cb || 0}`} decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                            </a>
                            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4, maxWidth: 460 }}>Paperback wrap (7×10, Premium Color spine, from the live page count). Dotted guides: <b style={{ color: "#c0218a" }}>magenta=bleed</b> · <b style={{ color: "#0098a6" }}>teal=trim</b> · <b style={{ color: "#2f8a3f" }}>green=safe</b> · <b style={{ color: "#e08a2e" }}>orange=spine</b> · <b style={{ color: "#d7263d" }}>red=barcode</b>. (Hardcover is a separate, larger wrap.)</div>
                          </div>
                        </div>
                      </>
                    )
                    : <div style={{ marginTop: 10, color: C.muted, fontSize: 12 }}>No cover generated yet.</div>}
                </div>
                {renders?.merged && (
                  <>
                    <div style={{ marginTop: 8, fontSize: 13, color: C.muted }}>{renders.merged.length} pages · {renders.merged.filter((m) => m.status !== "NOT RENDERED").length} rendered · {renders.merged.filter((m) => m.approvedForBook).length} approved · {renders.merged.filter((m) => m.printReady).length} print-ready</div>
                    <div style={{ marginTop: 2, fontSize: 11, color: C.muted }}>“Approve for book” does it all in one click: approve + print-prep (page numbers / badges + preflight) + select for the book → the page becomes print-ready. A “needs print-prep” tag only appears if that print-prep step didn’t finish — click Approve for book again.</div>
                    <div style={S.grid}>
                      {renders.merged.map((m) => (
                        // content-visibility:auto keeps off-screen cards unpainted and their
                        // full-res page images undecoded, so a large book (hundreds of pages)
                        // stays responsive instead of stalling on accumulated image memory.
                        <div key={m.pageId} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, background: "#fff", contentVisibility: "auto", containIntrinsicSize: "180px 340px" }}>
                          {m.imagePath
                            ? <img alt={m.pageKey} src={`${fileUrl(m.imagePath)}&v=${m.version || 0}`} loading="lazy" decoding="async" onClick={() => previewPage(m.pageId, m.imagePath).catch(() => {})} title="Tap to preview" style={{ width: "100%", borderRadius: 4, display: "block", cursor: "pointer" }} />
                            : <div onClick={() => previewPage(m.pageId, null).catch(() => {})} title="Tap to preview" style={{ height: 110, background: "#f0ead6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 11, cursor: "pointer" }}>not rendered</div>}
                          <div style={{ fontSize: 11, marginTop: 6, fontWeight: 700, wordBreak: "break-all" }}>{m.pageKey}</div>
                          <div style={{ marginTop: 4, display: "flex", gap: 5, alignItems: "center" }}>
                            <span style={S.pill(statusColor(m.status))}>{m.status}</span>
                            <span style={{ fontSize: 10, color: C.muted }}>{m.section}</span>
                          </div>
                          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                            <button style={{ ...S.ghost, margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => previewPage(m.pageId, m.imagePath).catch(() => {})}>Preview</button>
                            <button style={{ ...S.btn("spend"), margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => renderPage(m.pageId).catch(() => {})}>Render</button>
                            {m.status === "RENDERED" && m.renderId && <button style={{ ...S.btn("ok"), margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => approveForBook(m.renderId).catch(() => {})}>Approve for book</button>}
                            {m.status === "RENDERED" && m.renderId && <button style={{ ...S.ghost, margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => rejectRender(m.renderId).catch(() => {})}>Reject</button>}
                            {m.approvedForBook && <span style={{ ...S.pill(C.green), alignSelf: "center" }}>✓ approved</span>}
                            {m.approvedForBook && (m.printReady
                              ? <span style={{ ...S.pill(C.green), alignSelf: "center" }}>✓ print-ready</span>
                              : <span style={{ ...S.pill("#b8860b"), alignSelf: "center" }} title="Approved but not yet print-prepped — run print-prep before Build Book">⚠ needs print-prep</span>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {/* KINDLE eBOOK — preview & export, in the review hub. Kindle reflows
                    (no fixed pages), so this shows the structure, the real text, and where
                    each entry's hero illustration will sit. Future hero illustrations are
                    rendered/reviewed alongside the page renders above — same place. */}
                <div style={{ ...S.card, marginTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Kindle eBook — preview &amp; export</div>
                    <span style={S.pill(C.blue)}>REFLOWABLE</span>
                  </div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>The Kindle edition reflows (no fixed pages). Preview the structure, the real text, and where each entry's hero illustration will sit — then export. Built from the same approved content; no spend.</div>
                  <button style={{ ...S.btn(), marginTop: 8 }} onClick={() => loadEpubReport().catch(() => {})}>{epubReport ? "Refresh Kindle preview" : "Preview Kindle edition →"}</button>
                  {epubReport && <KindlePreview report={epubReport} busy={busy} onExport={() => downloadEpub().catch(() => {})} />}
                </div>
                {preview && (
                  // Floating modal overlay — pops up centered over the page regardless
                  // of how far the operator has scrolled the (hundreds-long) page grid.
                  // Click the backdrop or Close to dismiss.
                  <div onClick={() => setPreview(null)} style={{ position: "fixed", inset: 0, background: "rgba(20,16,8,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 10 }}>
                    <div onClick={(e) => e.stopPropagation()} style={{ ...S.card, background: C.panel || "#faf6ec", maxWidth: 760, width: "100%", maxHeight: "94vh", overflow: "auto", margin: 0, padding: 14 }}>
                      <button style={{ ...S.ghost, float: "right", margin: 0 }} onClick={() => setPreview(null)}>Close ✕</button>
                      <b>{preview.authority?.entryTitle}</b> <span style={{ color: C.muted, fontSize: 13 }}>· {preview.authority?.layoutFamilyLabel}</span>
                      {preview._imagePath ? (
                        <div style={{ marginTop: 10 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, marginBottom: 6, cursor: "pointer" }}>
                            <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
                            QA overlay — <span style={{ color: "#cc2222" }}>red = trim (KDP cut)</span> · <span style={{ color: "#2f8a3f" }}>green = safe-content</span> · <span style={{ color: "#e08a2e" }}>amber = buffer (aim text inside)</span>
                          </label>
                          {/* Permanent QA overlay (review-only — these are DOM lines, never baked into
                              the render, so they can never appear in an export). The render is the
                              full-bleed 7x10 canvas (0.125in bleed), so the guides are fixed % insets
                              of the image: trim = bleed inset (0.125in), safe-content = 0.5in inside
                              trim (0.625in from edge), buffer = a further ~0.15in inside safe. */}
                          <div style={{ position: "relative", lineHeight: 0 }}>
                            <img alt={preview.authority?.entryTitle || "page"} src={`${fileUrl(preview._imagePath)}&v=${preview._cb || 0}`} onClick={() => setPreview(null)} title="Tap to close" style={{ width: "100%", maxWidth: "100%", border: `1px solid ${C.line}`, borderRadius: 8, display: "block", cursor: "zoom-out" }} />
                            {showGuides && (
                              <>
                                <div style={{ position: "absolute", top: "1.22%", bottom: "1.22%", left: "1.72%", right: "1.72%", border: "1.5px dashed #cc2222", pointerEvents: "none", boxSizing: "border-box" }} />
                                <div style={{ position: "absolute", top: "6.10%", bottom: "6.10%", left: "8.62%", right: "8.62%", border: "1.5px dashed #2f8a3f", pointerEvents: "none", boxSizing: "border-box" }} />
                                <div style={{ position: "absolute", top: "7.80%", bottom: "7.80%", left: "11.03%", right: "11.03%", border: "1px dotted #e08a2e", pointerEvents: "none", boxSizing: "border-box" }} />
                              </>
                            )}
                          </div>
                        </div>
                      ) : null}
                      <div style={{ marginTop: 12, color: C.muted, fontSize: 13 }}>What this page will contain — rendered word-for-word by the AI (no spend yet):</div>
                      <div style={{ marginTop: 6, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 6, padding: 14, maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap", fontFamily: "Georgia,'Times New Roman',serif", fontSize: 13.5, lineHeight: 1.5 }}>
                        {preview.authority?.sourceText || "(No body text — this page bakes only its title / heading.)"}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </Panel>
        )}

        {step === "assemble" && (
          <Panel title="Build Book" sub="Merge every book-ready (approved + print-prepped) page into the interior PDF in spine order, and produce the full-wrap cover PDF (spine sized to the final page count). Blocks if anything is missing or fails preflight.">
            <Guard project={project} setStep={setStep} />
            {project && (
              <div style={S.card}>
                <button style={S.btn()} onClick={() => assemble().catch(() => {})}>Build book →</button>
                {assembly && (
                  <div style={{ marginTop: 12 }}>
                    <span style={S.pill(assembly.blocked ? C.red : C.green)}>{assembly.blocked ? "NOT READY" : "ASSEMBLED"}</span>
                    {!assembly.blocked && (
                      <div style={{ marginTop: 10 }}>
                        <div><b>{assembly.assembledPages} pages</b> assembled in book order.</div>
                        <div style={{ marginTop: 8, marginBottom: 4, color: assembly.coverPdfPath ? C.muted : C.red, fontSize: 13 }}>
                          {assembly.coverPdfPath
                            ? "Print package ready: interior PDF + full-wrap cover PDF — both files below are what the printer needs."
                            : "Interior is ready, but there's no cover PDF yet. Generate the cover in Step 7 · Render & Review, then build again for the complete print package."}
                        </div>
                        {assembly.interiorPdfPath && (
                          <>
                            <a style={{ ...S.btn("ok"), textDecoration: "none", display: "inline-block", marginRight: 8 }} href={fileUrl(assembly.interiorPdfPath)} target="_blank" rel="noreferrer">Open / download interior PDF</a>
                            {assembly.coverPdfPath && <a style={{ ...S.btn("ok"), textDecoration: "none", display: "inline-block" }} href={fileUrl(assembly.coverPdfPath)} target="_blank" rel="noreferrer">Open / download cover PDF</a>}
                            <div style={{ marginTop: 8, color: C.muted, fontSize: 13 }}>Final book preview (scroll through every page before you export):</div>
                            <iframe title="book-preview" src={fileUrl(assembly.interiorPdfPath)} style={{ width: "100%", height: 520, border: `1px solid ${C.line}`, borderRadius: 8, marginTop: 6 }} />
                            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                              <div style={{ color: C.muted, fontSize: 13 }}><b>Paperback:</b> same interior PDF as the hardcover, paired with the paperback wrap (narrower spine) — no rebuild, no spend. Upload the shared interior + the paperback wrap to KDP.</div>
                              <div style={{ color: C.muted, fontSize: 13, marginTop: 6 }}><b>Kindle eBook:</b> preview &amp; export it in Step 7 · Render &amp; Review (alongside the page renders).</div>
                              <button style={{ ...S.btn(), marginTop: 6 }} onClick={() => setStep("render")}>Go to Render &amp; Review →</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {assembly.blocked && (
                      <div style={{ marginTop: 10 }}>
                        {assembly.coverStale && (
                          <div style={{ ...S.card, borderColor: C.red, marginTop: 0 }}>
                            <div style={{ color: C.red, fontWeight: 700 }}>⚠ Cover is out of date</div>
                            <div style={{ marginTop: 4 }}>
                              The interior page count changed{assembly.coverBuiltForPageCount != null ? ` (the cover spine was built for ${assembly.coverBuiltForPageCount} pages; the interior is now ${assembly.finalPageCount})` : ""} and the spine width may be incorrect. Regenerate the cover before exporting.
                            </div>
                            <button style={{ ...S.btn(), marginTop: 8 }} onClick={() => setStep("render")}>Go to the cover (Step 7 · Render &amp; Review) →</button>
                          </div>
                        )}
                        {((assembly.missing || []).length > 0 || (assembly.preflightFailures || []).length > 0 || (assembly.noPrintOutput || []).length > 0) && (
                          <>
                            <div style={{ color: C.red, fontWeight: 600, marginTop: assembly.coverStale ? 12 : 0 }}>Some pages aren't book-ready yet. Go back to step 7 and render + approve these, then assemble again:</div>
                            <ul style={{ marginTop: 6 }}>
                              {(assembly.missing || []).map((x, i) => <li key={`m${i}`}>{typeof x === "string" ? x : (x.pageKey || JSON.stringify(x))}</li>)}
                              {(assembly.preflightFailures || []).map((x, i) => <li key={`p${i}`} style={{ color: C.red }}>{(x.pageKey || x)} — preflight failed</li>)}
                              {(assembly.noPrintOutput || []).map((x, i) => <li key={`n${i}`} style={{ color: C.red }}>{(x.pageKey || x)} — not print-prepped</li>)}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Panel>
        )}
        {zoom && <ZoomModal page={zoom} trim={trimSize(form.trim)} onClose={() => setZoom(null)} />}
      </main>
    </div>
  );
}

/** A scaled planning preview of one page: layout zones with the text flowed in,
 *  illustration areas tinted (not rendered). Pure presentational. */
function PageLayout({ page, width }) {
  const z = page.zones || {};
  const trimH = (page.__h && page.__w) ? page.__h / page.__w : 1.4;
  const height = Math.round(width * trimH);
  const fill = Math.max(0, Math.min(1.2, page.fit?.fillRatio ?? 0));
  const over = (page.fit?.fillRatio ?? 0) > 1;
  // How many "text lines" the body actually occupies (capped to the page's
  // usable lines for the drawing). This makes the reading field LOOK like text
  // filling the layout — without needing the words, which the planner doesn't
  // expose until render.
  const usable = Math.max(1, page.fit?.usableLines || 14);
  const drawnLines = Math.min(usable, Math.max(1, Math.round((page.fit?.estimatedLines || 0))));
  const pos = (zone) => ({ position: "absolute", left: `${zone.xPct}%`, top: `${zone.yPct}%`, width: `${zone.widthPct}%`, height: `${zone.heightPct}%`, boxSizing: "border-box" });
  // EXACT blueprint legend the AI receives: strong blue = main illustration,
  // light blue = full-page background illustration, orange = supporting art /
  // ornaments, RED = every text zone (title + reading field). Black bars inside
  // the red zones simulate where the type lands.
  const artFill = (role) => role === "supporting-art" ? C.orange : role === "background-art" ? C.field : C.blue;
  const lineH = 100 / usable; // % of the reading zone height per text line
  return (
    <div style={{ position: "relative", width, height, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 5, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
      {(z.imagePriorityZones || []).map((zz, i) => <div key={`i${i}`} style={{ ...pos(zz), background: artFill(zz.role) }} />)}
      {(z.typographyZones || []).map((zz, i) => (
        <div key={`t${i}`} style={{ ...pos(zz), background: C.red, display: "flex", alignItems: "center", justifyContent: "center" }} title="heading (text)">
          <div style={{ height: `${Math.max(8, 100 / 3)}%`, width: "60%", background: "rgba(0,0,0,0.7)", borderRadius: 1 }} />
        </div>
      ))}
      {(z.textSafeZones || []).map((zz, i) => (
        <div key={`x${i}`} style={{ ...pos(zz), background: C.red, overflow: "hidden", padding: `${Math.max(2, width / 45)}px` }} title="reading field (text)">
          {Array.from({ length: drawnLines }).map((_, li) => (
            <div key={li} style={{ height: `${Math.max(1, lineH * 0.5)}%`, marginBottom: `${Math.max(1, lineH * 0.5)}%`, background: "rgba(0,0,0,0.72)", width: li === drawnLines - 1 ? "55%" : "100%", borderRadius: 1 }} />
          ))}
          {over && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 5, background: "#000" }} title="overflow" />}
        </div>
      ))}
      <div style={{ position: "absolute", left: 4, bottom: 3, fontSize: Math.max(8, width / 22), color: over ? C.red : C.ink, fontWeight: 700, background: "rgba(251,247,234,0.85)", padding: "0 3px", borderRadius: 3 }}>
        {Math.round(fill * 100)}% full
      </div>
    </div>
  );
}

function fitMeta(fit) {
  const f = String(fit || "").toUpperCase();
  if (f === "FITS") return { bg: C.green, text: "Fits — reads well" };
  if (f === "TIGHT") return { bg: C.orange, text: "Tight — near capacity" };
  if (f === "OVERFLOW") return { bg: C.red, text: "Overflow — text won't fit" };
  if (f === "UNDERFILL") return { bg: C.muted, text: "Under-filled — lots of space" };
  return { bg: C.muted, text: f || "—" };
}

function PagePreview({ page, trim, onZoom }) {
  const W = 168;
  const p = { ...page, __w: trim.widthIn, __h: trim.heightIn };
  const fm = fitMeta(page.fitStatus);
  return (
    <div style={{ width: W }}>
      <div onClick={() => onZoom(page)} title="Click to enlarge" style={{ cursor: "zoom-in" }}>
        <PageLayout page={p} width={W} />
      </div>
      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, wordBreak: "break-all" }}>{page.pageKey}</div>
      <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={S.pill(fm.bg)}>{page.fitStatus}</span>
        <span style={{ fontSize: 10, color: C.muted }}>{page.entryTitle || page.layoutTemplate}</span>
      </div>
    </div>
  );
}

function ZoomModal({ page, trim, onClose }) {
  const W = 460;
  const fm = fitMeta(page.fitStatus);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,16,8,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, borderRadius: 12, padding: 20, maxHeight: "92vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div><b>{page.pageKey}</b> · {page.layoutTemplate} · <span style={S.pill(fm.bg)}>{fm.text}</span></div>
          <button style={S.ghost} onClick={onClose}>Close ✕</button>
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
          <PageLayout page={{ ...page, __w: trim.widthIn, __h: trim.heightIn }} width={W} />
          <div style={{ fontSize: 13, minWidth: 200 }}>
            <div style={{ marginBottom: 8 }}><b>{page.entryTitle}</b></div>
            {page.fit && (
              <table style={{ fontSize: 13, borderCollapse: "collapse" }}><tbody>
                <tr><td style={{ color: C.muted, paddingRight: 10 }}>Text</td><td><b>{page.fit.charCount}</b> chars · {page.fit.estimatedLines} lines</td></tr>
                <tr><td style={{ color: C.muted, paddingRight: 10 }}>Capacity</td><td>{page.fit.capacityChars} chars · {page.fit.usableLines} lines</td></tr>
                <tr><td style={{ color: C.muted, paddingRight: 10 }}>Fill</td><td><b>{Math.round((page.fit.fillRatio || 0) * 100)}%</b></td></tr>
                <tr><td style={{ color: C.muted, paddingRight: 10 }}>Pages</td><td>{page.fit.estimatedRenderedPages}</td></tr>
              </tbody></table>
            )}
            {(page.blockers || []).length > 0 && <div style={{ marginTop: 8, color: C.red }}>Blockers: {page.blockers.join(", ")}</div>}
            <div style={{ marginTop: 10, color: C.muted, fontSize: 12 }}>The exact words appear in step 7 (Render Pages → Preview), which shows the verbatim prompt before any spend.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try { await onLogin(pw.trim()); } catch (e2) { setErr(e2.message || "Login failed."); } finally { setBusy(false); }
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0ead6", padding: 20 }}>
      <form onSubmit={submit} style={{ ...S.card, maxWidth: 360, width: "100%", textAlign: "center", margin: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 19 }}>Wild Lands</div>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 4, marginBottom: 16 }}>Operator Production Console — enter the access password.</div>
        <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" style={{ ...S.input, textAlign: "center" }} />
        {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
        <button type="submit" disabled={busy || !pw.trim()} style={{ ...S.btn(), marginTop: 14, width: "100%", opacity: busy || !pw.trim() ? 0.6 : 1 }}>{busy ? "Checking…" : "Enter"}</button>
      </form>
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
function Stat({ label, value }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", background: "#fff" }}>
      <div style={{ fontSize: 11.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{value ?? "—"}</div>
    </div>
  );
}

// Colour + label for a chapter's section kind in the preview structure tree.
const KIND_META = {
  TITLE: { label: "Title page", color: C.muted },
  COPYRIGHT: { label: "Copyright", color: C.muted },
  INTRODUCTION: { label: "Introduction", color: C.blue },
  BODY: { label: "Chapter", color: C.green },
  GLOSSARY: { label: "Glossary", color: C.orange },
  ABOUT: { label: "About", color: C.orange },
};

/**
 * In-console Kindle preview: read the EPUB structure + actual reflowable text +
 * image placement BEFORE export. Mirrors the print preview mindset — preview
 * first, export second, upload third. `report` is the preview-endpoint model.
 */
function KindlePreview({ report, onExport, busy }) {
  const chapters = report.chapters || [];
  // <img> can't send the Authorization header, so the hero-serving route is
  // reached with the shared-password query param (?k=…) the gate also accepts.
  const pw = sessionStorage.getItem("wl_pw") || "";
  const heroUrl = (src) => `${BACKEND}${src}${pw ? `?k=${encodeURIComponent(pw)}` : ""}`;
  const [ci, setCi] = useState(0);
  const [ei, setEi] = useState(chapters[0]?.entries ? 0 : null);
  const chapter = chapters[ci] || null;
  const entries = chapter?.entries || null;
  const entry = entries && ei != null ? entries[ei] : null;
  const ip = report.imagePlan || {};
  const st = report.stats || {};

  const select = (i, j) => { setCi(i); setEi(j); };

  // Section grouping for the structure tree (Front matter / Contents / Back matter).
  const groupOf = (kind) => (kind === "BODY" ? "Contents" : ["GLOSSARY", "ABOUT"].includes(kind) ? "Back matter" : "Front matter");
  let prevGroup = null;
  const rows = chapters.map((c, i) => { const g = groupOf(c.kind); const showHeader = g !== prevGroup; prevGroup = g; return { c, i, g, showHeader }; });

  // Flat reading order for linear prev/next (each non-body chapter + each body entry).
  const flat = [];
  chapters.forEach((c, i) => {
    if (c.entries && c.entries.length) c.entries.forEach((_, j) => flat.push({ ci: i, ei: j }));
    else flat.push({ ci: i, ei: null });
  });
  const curIdx = flat.findIndex((f) => f.ci === ci && f.ei === ei);
  const go = (delta) => { const n = curIdx + delta; if (n >= 0 && n < flat.length) select(flat[n].ci, flat[n].ei); };

  return (
    <div style={{ ...S.card, marginTop: 12 }}>
      <div style={{ marginBottom: 8 }}>
        <b>{report.meta?.title}</b>{report.meta?.series ? ` — ${report.meta.series}` : ""}
        <span style={{ ...S.pill(C.muted), marginLeft: 8 }}>PREVIEW</span>
      </div>

      {/* Build report */}
      <div style={S.grid}>
        <Stat label="Chapters" value={st.chapters} />
        <Stat label="Entries" value={st.entries} />
        <Stat label="Words" value={(st.words ?? 0).toLocaleString()} />
        <Stat label="Cover" value={ip.coverIncluded ? "Included" : "None"} />
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
        {ip.heroMode === "ON" ? (
          <>Images: cover {ip.coverIncluded ? "included" : "not found"} · <b>{st.heroesEmbedded ?? 0} hero illustrations embedded</b> (one before each entry title{ip.entriesAwaitingHero ? `; ${ip.entriesAwaitingHero} entr${ip.entriesAwaitingHero === 1 ? "y" : "ies"} still without one` : ", full coverage"}).</>
        ) : (
          <>Images: cover {ip.coverIncluded ? "included" : "not found"} · interior entry images <b>not included in v1</b>{" "}({st.omittedImages ?? 0} future hero illustrations, one per entry, would appear {String(ip.plannedHeroPlacement || "BEFORE_ENTRY_TITLE").replace(/_/g, " ").toLowerCase()}).</>
        )}
      </div>
      {Array.isArray(st.skipped) && st.skipped.length > 0 && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Omitted (not meaningful in reflow): {st.skipped.join(", ")}</div>
      )}
      {Array.isArray(st.warnings) && st.warnings.length > 0 && (
        <div style={{ ...S.card, borderColor: C.orange, marginTop: 8 }}>
          <b style={{ color: C.orange }}>⚠ {st.warnings.length} warning(s)</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{st.warnings.slice(0, 8).map((w, i) => <li key={i} style={{ fontSize: 13 }}>{w}</li>)}</ul>
        </div>
      )}

      {/* Structure + reading panes */}
      <div style={{ display: "flex", gap: 12, marginTop: 14, alignItems: "flex-start" }}>
        {/* left: structure tree */}
        <div style={{ flex: "0 0 260px", maxHeight: 460, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, background: "#fff", padding: 8 }}>
          {rows.map(({ c, i, g, showHeader }) => {
            const km = KIND_META[c.kind] || { label: c.kind, color: C.muted };
            const activeChapter = i === ci && ei == null;
            return (
              <div key={i}>
                {showHeader && <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: "8px 8px 4px" }}>{g}</div>}
                <div onClick={() => select(i, c.entries ? 0 : null)} style={{ padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: activeChapter ? C.blue : "transparent", color: activeChapter ? "#fff" : C.ink, fontSize: 13.5, fontWeight: 600 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 8, background: km.color, marginRight: 8 }} />
                  {c.title}
                </div>
                {c.entries && i === ci && (
                  <div style={{ marginLeft: 14, borderLeft: `1px solid ${C.line}`, paddingLeft: 6, marginBottom: 4 }}>
                    {c.entries.map((e, j) => {
                      const activeEntry = i === ci && ei === j;
                      return (
                        <div key={j} onClick={() => select(i, j)} style={{ padding: "4px 8px", borderRadius: 6, cursor: "pointer", background: activeEntry ? C.field : "transparent", fontSize: 12.5 }}>
                          {e.title}{e.heroIncluded ? <span style={{ color: C.muted }}> · 🖼</span> : <span style={{ color: C.muted }}> · no image</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* right: reading pane — the ACTUAL text that goes into the EPUB */}
        <div style={{ flex: 1, maxHeight: 460, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, background: "#fff", padding: "14px 18px" }}>
          {/* linear navigation — step through the book in reading order */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${C.line}` }}>
            <button style={{ ...S.ghost, margin: 0, opacity: curIdx <= 0 ? 0.4 : 1 }} disabled={curIdx <= 0} onClick={() => go(-1)}>← Prev</button>
            <span style={{ fontSize: 12, color: C.muted }}>{curIdx >= 0 ? `${curIdx + 1} of ${flat.length}` : ""}</span>
            <button style={{ ...S.ghost, margin: 0, opacity: curIdx >= flat.length - 1 ? 0.4 : 1 }} disabled={curIdx >= flat.length - 1} onClick={() => go(1)}>Next →</button>
          </div>
          {/* Hero shown exactly as the reader sees it: full column width (matches the
              EPUB's img.hero max-width:100%). No caption/box — those were preview-only. */}
          {entry && entry.heroSrc ? (
            <img src={heroUrl(entry.heroSrc)} alt={entry.heroAlt || entry.title} style={{ display: "block", width: "100%", height: "auto", marginBottom: 12 }} />
          ) : entry ? (
            <div style={{ border: `1px dashed ${C.line}`, borderRadius: 8, padding: "8px 10px", marginBottom: 12, color: C.muted, fontSize: 12.5, background: C.panel }}>
              🖼 Hero illustration slot — appears <b>before the title</b>. (No image mapped for this entry yet.)
            </div>
          ) : chapter?.kind === "TITLE" && ip.coverIncluded ? (
            <div style={{ border: `1px dashed ${C.line}`, borderRadius: 8, padding: "8px 10px", marginBottom: 12, color: C.muted, fontSize: 12.5, background: C.panel }}>
              🖼 Cover image is included and precedes the title page.
            </div>
          ) : null}
          {entry ? (
            <>
              <h2 style={{ margin: "0 0 2px" }}>{entry.title}</h2>
              {entry.scientificName && <p style={{ fontStyle: "italic", color: C.muted, marginTop: 0 }}>{entry.scientificName}</p>}
              <div style={{ lineHeight: 1.55, fontSize: 15 }} dangerouslySetInnerHTML={{ __html: entry.bodyHtml || "" }} />
            </>
          ) : (
            <>
              <h2 style={{ margin: "0 0 8px" }}>{chapter?.title}</h2>
              <div style={{ lineHeight: 1.55, fontSize: 15 }} dangerouslySetInnerHTML={{ __html: (chapter?.content || "<p style='color:#7a6f57'>(no readable text on this page)</p>").replace(/src="\/api\/([^"]*)"/g, `src="${BACKEND}/api/$1${pw ? `?k=${encodeURIComponent(pw)}` : ""}"`) }} />
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
        <button style={S.btn("ok")} disabled={!!busy} onClick={onExport}>Export Kindle EPUB ↓</button>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>
          Next, once it looks right above: <b>1.</b> Export downloads the <code>.epub</code>. <b>2.</b> Open it in Amazon Kindle Previewer (final validation). <b>3.</b> In KDP, add a <b>Kindle eBook</b> edition to this same title and upload the <code>.epub</code> + the cover. The print book is unaffected.
        </div>
      </div>
    </div>
  );
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
function LabeledTextarea({ label, value, onChange, rows = 4, hint }) {
  return (
    <label style={{ display: "block", marginTop: 10, fontSize: 13, fontWeight: 600 }}>{label}
      <textarea style={{ ...S.input, minHeight: rows * 22, fontFamily: "inherit", resize: "vertical" }} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <span style={{ display: "block", fontWeight: 400, color: C.muted, fontSize: 12, marginTop: -2 }}>{hint}</span> : null}
    </label>
  );
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
