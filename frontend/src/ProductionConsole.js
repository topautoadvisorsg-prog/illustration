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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_BACKEND_URL = "https://wildlandsbackend-production.up.railway.app";
const BACKEND = process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND_URL;
const MOBILE_QUERY = "(max-width: 760px)";

// The "no error" shape for errorState — see its declaration in ProductionConsole for why
// the translated-error fields live in one object instead of five parallel useState calls.
const EMPTY_ERROR_STATE = { message: "", fields: [], action: null, code: "", correlationId: "" };

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

/** Kept in step with DEFAULT_ACCURACY_NOTE in @wildlands/shared. */
const DEFAULT_ACCURACY_NOTE =
  "Medical accuracy: Health information in this book was researched and cross-checked against guidance " +
  "from established pediatric and medical organizations and physician-reviewed sources.";

const EMPTY_SETUP_FORM = { title: "", subtitle: "", coverDescription: "", coverArtDirection: "", author: "", series: "", volume: 1, trim: "7x10", bodyPt: 11, lineHeight: 1.4, headingFont: "Cormorant Garamond", bodyFont: "EB Garamond", productionProfileId: "wildlands-field-guide", typesetLayoutStandardId: "", backBlurb: "", backFeatures: "", backAuthorBio: "", accuracyNoteEnabled: false, accuracyNoteText: DEFAULT_ACCURACY_NOTE, accuracyReviewerName: "", accuracyReviewerCredentials: "" };

// The faces the renderer can actually produce. Free text here would silently
// fall back to a generic at print time, so Setup offers only families the
// pipeline ships. Display faces first, then the text faces.
const HEADING_FONTS = ["Oswald", "Archivo", "Montserrat", "Cormorant Garamond", "EB Garamond"];
const BODY_FONTS = ["EB Garamond", "Cormorant Garamond", "Lora", "Archivo"];

// What kind of book this is. Drives the production track (AI whole-page vs
// deterministic typeset), the illustration policy, and which layout standard
// the interior is rendered against. Mirrors the backend production-profile
// registry; ids must match it exactly.
// `track` mirrors the production profile's bodyRenderTrack. The two tracks share
// the first four steps and diverge after Paginate, and several steps are simply
// not part of one of them. Without this the console showed every operator every
// step, which is how a typeset book ended up being told to go approve page
// renders that its track never produces.
const BOOK_TYPES = [
  { id: "wildlands-field-guide", label: "Illustrated Field Guide (AI whole-page)", track: "rendered-pages" },
  { id: "bw-educational-nonfiction", label: "Educational Nonfiction — B&W Digest (typeset)", track: "typeset" },
];
const trackOf = (profileId) =>
  BOOK_TYPES.find((b) => b.id === profileId)?.track ?? "rendered-pages";
const EMPTY_NEW_FORM = { title: "", subtitle: "", author: "" };

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

// COPYRIGHT_PAGE, DISCLAIMER, and DEDICATION are typeset deterministically at
// Build time (Step 6) — never sent to the AI illustrator — so they already
// show APPROVED the moment a fresh project reaches Step 7, with no operator
// action taken. Everything else (including Glossary/Index/Resources, which
// LOOK like reference pages too) goes through real AI rendering and needs
// the normal render/approve flow. Matches plan-front-matter.ts's `aiRendered`
// / reference-section split — see the "no manual approval" note below.
const DETERMINISTIC_FRONT_MATTER_TYPES = new Set(["COPYRIGHT_PAGE", "DISCLAIMER", "DEDICATION"]);
function isDeterministicPage(pageKey) {
  const type = String(pageKey || "").replace(/^(FM|BM)_\d+_/, "");
  return DETERMINISTIC_FRONT_MATTER_TYPES.has(type);
}

const FRONT_BACK_MATTER_LABELS = {
  INTRODUCTION: "Introduction",
  GLOSSARY: "Glossary",
  INDEX: "Index",
  ABOUT_AUTHOR: "About the Author",
  ABOUT_SERIES: "About the Series",
  RESOURCES: "Resources",
  BACK_COVER_COPY: "Back Cover Copy",
};

const MANUSCRIPT_TEMPLATE = `# CHAPTER 1: KNOW YOUR REGION

Optional chapter introduction text. It's stored but not turned into its own page — only "###" entries below become pages.

### First Entry Title

Body text for this entry. Every chapter needs at least one "###" entry like this before Breakdown can run.

### Second Entry Title

More body text — one page per entry.

# CHAPTER 2: SECOND CHAPTER TITLE

### Another Entry Title

Body text for this chapter's entry.

# GLOSSARY

**Term.** Definition of the term.

**Another Term.** Definition of the term.
`;

// Coarse client-side echo of the server's assertUsableManuscriptOutline rule
// (backend/src/pipeline/stage-1-ingestion/parse-manuscript-outline.ts) — a
// real chapter with zero entries still won't be caught until Breakdown (that
// needs the actual outline parser), but the two structural basics — "is
// there a chapter heading at all," "is there an entry heading anywhere" —
// are cheap to approximate instantly, catching the same mistake before a
// round trip to the server.
function manuscriptStructureHint(text) {
  if (!text || !text.trim()) return null;
  const hasChapterHeading = /^#(?!#)[ \t]*\S/m.test(text);
  if (!hasChapterHeading) return "No chapter heading detected yet — add \"# CHAPTER 1: TITLE\" before uploading.";
  const hasEntryHeading = /^###(?!#)[ \t]*\S/m.test(text);
  if (!hasEntryHeading) return "No entry headings detected yet — add \"### Entry Title\" inside a chapter before uploading.";
  return null;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    setMatches(media.matches);
    if (typeof media.addEventListener === "function") media.addEventListener("change", onChange);
    else media.addListener(onChange);
    return () => {
      if (typeof media.removeEventListener === "function") media.removeEventListener("change", onChange);
      else media.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

function shortStepLabel(label) {
  return String(label || "").replace(/^\d+\s*[^A-Za-z0-9]+\s*/, "").replace("Build Front/Back Matter", "Matter").replace("Render & Review", "Review").replace("Build Book", "Export");
}

// Backend field paths are dot-joined and nested (e.g. "config.authorName");
// match on the last segment so a form doesn't need to know the exact nesting.
function fieldError(fields, key) {
  const hit = (fields || []).find((f) => f.path === key || f.path.endsWith(`.${key}`));
  return hit ? hit.message : undefined;
}

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
  // Everything the centralized error-translation layer (docs/ERROR_HANDLING_STANDARD.md)
  // gives us about the current error, as one unit — message, per-field
  // highlights, the recovery action, the support-facing code, and the
  // telemetry correlation id all change together (every write site sets all
  // five at once; there's no case where just one changes independently), so
  // they live in one state object instead of five parallel useState calls.
  const [errorState, setErrorState] = useState(EMPTY_ERROR_STATE);
  const [notice, setNotice] = useState("");
  // Set when the operator clicks a recovery action's button; cleared by the
  // very next run() outcome (success -> "recovery succeeded" telemetry,
  // failure -> silently dropped, no explicit "failed" event). This is a
  // simple "did the NEXT action work" heuristic, not a full session trace.
  const pendingRecoveryRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null); // active project object
  // Step 3 · Book Setup form — mirrors the OPEN project's saved config.
  const [form, setForm] = useState(EMPTY_SETUP_FORM);
  // Step 1 · Create-new form — deliberately SEPARATE state. When these shared a
  // single `form`, opening a book auto-filled "Create new" with that book's
  // title/author (see the config-sync effect below), so the only visible way to
  // start a fresh book looked like a pre-filled duplicate of the current one.
  const [newForm, setNewForm] = useState(EMPTY_NEW_FORM);
  const [manuscript, setManuscript] = useState("");
  const [manuscriptName, setManuscriptName] = useState("");
  /**
   * WHERE the textarea's current content came from. This is a provenance
   * control, not a UI nicety.
   *
   *   "empty"    — nothing loaded.
   *   "file"     — the operator dropped/selected a local source file THIS
   *                session. Genuine source bytes. Eligible to become canonical.
   *   "typed"    — the operator typed or pasted into an empty box. Also genuine
   *                source bytes they supplied. Eligible.
   *   "restored" — the PLATFORM loaded the stored SANITIZED WORKING COPY. These
   *                are derivative bytes. NOT eligible to become canonical, and
   *                sticky: editing restored text keeps it derivative, because
   *                the emoji/mojibake the sanitizer already removed cannot be
   *                recovered by editing what is left.
   */
  const [manuscriptOrigin, setManuscriptOrigin] = useState("empty");
  /** Only a real source file (or fresh paste) may replace the canonical artifact. */
  const canUploadCanonical = manuscriptOrigin === "file" || manuscriptOrigin === "typed";

  const [breakdown, setBreakdown] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [pages, setPages] = useState(null); // paginated page rows (zones + text)
  // Review ROUTING — who reviews each page. Held in its own state, and painted
  // in its own colour channel (blue), so it can never be read as an approval
  // verdict. GREEN/YELLOW/RED continue to mean approved / needs review / flagged.
  const [routing, setRouting] = useState(null);
  const [routeFilter, setRouteFilter] = useState("ALL");
  // Forensic review workflow: routing + verdict are separate dimensions and are
  // held separately here so the UI can never collapse them into one colour.
  const [board, setBoard] = useState(null);
  const [picked, setPicked] = useState([]);
  const [promptCopied, setPromptCopied] = useState(false);
  const [exportNote, setExportNote] = useState(null);
  const [zoom, setZoom] = useState(null); // page being enlarged in the preview
  const [matter, setMatter] = useState(null);
  const [renders, setRenders] = useState(null); // { total, byStatus, bookReady, renders:[] }
  const [preview, setPreview] = useState(null); // active preview package
  const [showGuides, setShowGuides] = useState(true); // KDP-style trim/safe overlay on the page preview
  const [coverAR, setCoverAR] = useState(null); // full-wrap image aspect ratio (w/h), for spine fold lines
  const [cover, setCover] = useState(null);
  const [coverVersions, setCoverVersions] = useState(null); // { currentAssetPath, versions[], current }
  const [preflight, setPreflight] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [assembly, setAssembly] = useState(null);
  const [delivery, setDelivery] = useState(null); // delivery check of the finished PDFs
  const [epubReport, setEpubReport] = useState(null); // Kindle EPUB build report (preview endpoint)
  const [status, setStatus] = useState({}); // real backend progress for the step checkmarks
  const [reviewResults, setReviewResults] = useState({}); // renderId -> { pass, issues, model } from AI text review
  const [promptReviewResults, setPromptReviewResults] = useState({}); // pageId -> { pass, issues, model } from pre-flight prompt review (no spend)
  const [authed, setAuthed] = useState(false); // shared-password gate
  const [authReady, setAuthReady] = useState(false); // initial stored-password check done
  const isMobile = useMediaQuery(MOBILE_QUERY);

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
    if (!res.ok) {
      // Backend's centralized error handler sends { message, fields, action,
      // errorCode, correlationId } — never raw JSON/schema paths. Attach
      // these to the thrown Error so callers can highlight the specific
      // input, offer the suggested action, give the operator something
      // reportable (errorCode), and tie a recovery-click/success telemetry
      // event back to this specific occurrence (correlationId).
      const err = new Error((data && (data.message || data.error)) || `${res.status} ${res.statusText}`);
      if (data && Array.isArray(data.fields)) err.fields = data.fields;
      if (data && data.action) err.action = data.action;
      if (data && data.errorCode) err.errorCode = data.errorCode;
      if (data && data.correlationId) err.correlationId = data.correlationId;
      throw err;
    }
    return data;
  }, []);

  // Append the shared key as a query param so <img>/<iframe>/PDF loads (which
  // can't send an Authorization header) pass the gate too.
  const fileUrl = useCallback((p) => { const pw = sessionStorage.getItem("wl_pw") || ""; return `${BACKEND}/api/whole-page-render/file?path=${encodeURIComponent(p)}${pw ? `&k=${encodeURIComponent(pw)}` : ""}`; }, []);
  // The blueprint is served by the preflight endpoint itself, so the operator is
  // always looking at the reference image for the CURRENT spec rather than a
  // stored copy that may predate the last Book Setup change.
  const blueprintUrl = useCallback((projectId, cb) => { const pw = sessionStorage.getItem("wl_pw") || ""; return `${BACKEND}/api/projects/${projectId}/cover/preflight?format=blueprint&v=${cb}${pw ? `&k=${encodeURIComponent(pw)}` : ""}`; }, []);

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
    setBusy(label); setErrorState(EMPTY_ERROR_STATE); setNotice("");
    try {
      const r = await fn();
      if (r && r.notice) setNotice(r.notice);
      // "Did the next action after a recovery click actually work" — the
      // measurement docs/ERROR_HANDLING_STANDARD.md's recovery-success
      // telemetry is built on. Only the FIRST outcome after a click counts,
      // success or not, so it never gets credited to a later unrelated action.
      if (pendingRecoveryRef.current) {
        const cid = pendingRecoveryRef.current;
        pendingRecoveryRef.current = null;
        api("/api/diagnostics/recovery-event", { method: "POST", body: JSON.stringify({ correlationId: cid, kind: "succeeded" }) }).catch(() => {});
      }
      return r;
    }
    catch (e) {
      setErrorState({
        message: e.message || String(e),
        fields: Array.isArray(e.fields) ? e.fields : [],
        action: e.action || null,
        code: e.errorCode || "",
        correlationId: e.correlationId || "",
      });
      pendingRecoveryRef.current = null;
      throw e;
    }
    finally { setBusy(""); }
  }, [api]);

  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const loadProjects = useCallback(() => run("Loading projects", async () => {
    const d = await api("/api/projects");
    const list = Array.isArray(d) ? d : d.projects || [];
    setProjects(list);
    setProjectsLoaded(true);
    return { notice: `${list.length} project(s).` };
  }), [api, run]);

  useEffect(() => { if (authed) loadProjects().catch(() => setProjectsLoaded(true)); }, [authed, loadProjects]);

  // Restore the operator's place after a browser reload — without this, an
  // accidental refresh mid-session (long render sessions especially) sends
  // them all the way back to the Project screen with no memory of which book
  // or step they were on. Runs once, right after the project list has loaded
  // for the first time (even if it's empty); a real project switch afterward
  // is a deliberate operator action, not something to auto-restore over.
  // `placeSettledRef` is shared with the persist effect below so it never
  // writes/clears localStorage before this restore attempt has happened —
  // otherwise the initial `project === null` render would wipe the saved
  // value before it's ever read (only reproduces under StrictMode's dev-only
  // double-effect-invocation, but the guard is correct either way).
  const placeSettledRef = useRef(false);
  useEffect(() => {
    if (placeSettledRef.current || project || !projectsLoaded) return;
    placeSettledRef.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem("wl_last_place") || "null");
      if (saved && saved.projectId) {
        const found = projects.find((p) => p.id === saved.projectId);
        if (found) {
          setProject(found);
          if (saved.step) setStep(saved.step);
        }
      }
    } catch { /* corrupt/old localStorage value — ignore, start fresh */ }
  }, [projectsLoaded, projects, project]);

  // Persist the active project + step on every change so the restore above
  // has somewhere to read from.
  useEffect(() => {
    if (!placeSettledRef.current) return;
    if (project?.id) localStorage.setItem("wl_last_place", JSON.stringify({ projectId: project.id, step }));
    else localStorage.removeItem("wl_last_place");
  }, [project?.id, step]);

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

  // Show the cover that is ACTUALLY current, not a guessed filename.
  //
  // This used to hard-code `cover/cover-wrap-art.png`. Once covers became
  // versioned, that path is only ever version 1 — so approving or uploading a
  // new wrap left Step 7 showing the OLD cover, which is precisely the kind of
  // stale-artifact confusion the version history exists to end. Ask the backend
  // which asset is current and render that. The old probe stays as the fallback
  // for projects that predate versioning.
  const loadCoverVersions = useCallback(async (projectId) => {
    const d = await api(`/api/projects/${projectId}/cover-artwork`);
    setCoverVersions(d);
    if (d?.currentAssetPath) setCover({ imagePath: d.currentAssetPath, _probe: true, _cb: Date.now() });
    else setCover(null);
    return d;
  }, [api]);

  useEffect(() => {
    if (!project?.id) { setCover(null); setCoverVersions(null); return; }
    loadCoverVersions(project.id).catch(() => {
      setCover({ imagePath: `${project.id}/cover/cover-wrap-art.png`, _probe: true, _cb: Date.now() });
    });
  }, [project?.id, loadCoverVersions]);

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
      const trim =
        w === 5.5 && h === 8.5 ? "5.5x8.5"
        : w === 6 && h === 9 ? "6x9"
        : w === 8.5 && h === 11 ? "8.5x11"
        : "7x10";
      const authors = cfg.publishing?.authors;
      const bd = cfg.publishing?.bookDescription ?? {};
      setForm({
        title: cfg.publishing?.title ?? cfg.title ?? "",
        subtitle: cfg.publishing?.subtitle ?? cfg.subtitle ?? "",
        coverDescription: cfg.publishing?.coverDescription ?? "",
        coverArtDirection: cfg.publishing?.coverArtDirection ?? "",
        accuracyNoteEnabled: Boolean(cfg.publishing?.accuracyNote?.enabled),
        accuracyNoteText: cfg.publishing?.accuracyNote?.text ?? DEFAULT_ACCURACY_NOTE,
        accuracyReviewerName: cfg.publishing?.accuracyNote?.reviewerName ?? "",
        accuracyReviewerCredentials: cfg.publishing?.accuracyNote?.reviewerCredentials ?? "",
        paperStock: cfg.paperStock ?? "white",
        author: (authors && authors.length ? authors.join(", ") : cfg.authorName) ?? "",
        series: cfg.publishing?.series?.name ?? "",
        volume: cfg.volume ?? cfg.publishing?.series?.volumeNumber ?? 1,
        trim,
        // Body typography is a per-book decision (a digest guide is not set like
        // a large-format field guide), so Setup owns it rather than the renderer.
        bodyPt: cfg.typography?.bodyPt ?? 11,
        lineHeight: cfg.typography?.lineHeight ?? 1.4,
        headingFont: cfg.typography?.headingFont ?? "Cormorant Garamond",
        bodyFont: cfg.typography?.bodyFont ?? "EB Garamond",
        productionProfileId: cfg.productionProfileId ?? "wildlands-field-guide",
        // Read-only: written by the backend on the first typeset and then owned
        // by the project, so improving the standard cannot move an approved book.
        typesetLayoutStandardId: cfg.typesetLayoutStandardId ?? "",
        // Back-cover copy: blurb (paragraph), features (one per line), author note.
        backBlurb: bd.blurb ?? (bd.hooks?.length ? bd.hooks.join("\n") : ""),
        backFeatures: (bd.features ?? []).join("\n"),
        backAuthorBio: bd.authorBio ?? "",
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [project?.id, api]);

  // Restore the previously uploaded manuscript into Step 2's textarea whenever
  // the active project changes — without this, navigating back after a
  // successful upload (e.g. because Breakdown failed) shows an empty textarea
  // and looks like the uploaded text was lost.
  //
  // PROVENANCE: what comes back here is the SANITIZED WORKING COPY, not the
  // operator's source bytes. Restored text is therefore marked `restored` and is
  // NOT eligible to become a new canonical source — re-uploading it would
  // launder a derivative into the canonical slot and make the provenance panel
  // confidently display the wrong frozen hash. See manuscriptOrigin.
  useEffect(() => {
    if (!project?.id) { setManuscript(""); setManuscriptName(""); setManuscriptOrigin("empty"); return undefined; }
    let cancelled = false;
    api(`/api/projects/${project.id}/manuscript`).then((d) => {
      if (cancelled || !d) return;
      setManuscript(d.manuscript || "");
      setManuscriptName((d.relativePath || "").split("/").pop() || "");
      setManuscriptOrigin(d.manuscript ? "restored" : "empty");
    }).catch(() => { if (!cancelled) { setManuscript(""); setManuscriptName(""); setManuscriptOrigin("empty"); } });
    return () => { cancelled = true; };
  }, [project?.id, api]);

  // Bleed belongs to the TRIM, not to a global constant. A text interior has
  // nothing running to the edge, so it prints with zero bleed; an illustrated
  // page bleeds 0.125. Hardcoding 0.125 for every trim (the old behaviour) gave
  // the digest preset the wrong canvas.
  function trimSize(t) {
    if (t === "5.5x8.5") return { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 };
    if (t === "6x9") return { widthIn: 6, heightIn: 9, bleedIn: 0.125 };
    if (t === "8.5x11") return { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 };
    return { widthIn: 7, heightIn: 10, bleedIn: 0.125 };
  }

  // `src` defaults to the Step 3 Setup form. Step 1's Create-new passes its own
  // (title/subtitle/author only) so a brand-new book never inherits the values
  // of whichever project happens to be open.
  function cleanConfig(src) {
    const f = src || form;
    // Minimal, clean config — the whole-page pipeline takes its visual DNA from
    // the locked Publishing Standard, so NO legacy style/palette blob is sent.
    // All book identity (title/subtitle/cover description/author/series/volume)
    // is data, set per book — nothing book- or series-specific is hardcoded.
    const vol = Math.max(1, parseInt(f.volume, 10) || 1);
    const series = (f.series || "").trim();
    const coverDescription = (f.coverDescription || "").trim();
    const coverArtDirection = (f.coverArtDirection || "").trim();
    // Back cover — three distinct pieces (data-driven, optional). Features is a
    // newline-per-item textarea → array. Omit the whole block when all empty.
    const blurb = (f.backBlurb || "").trim();
    const features = (f.backFeatures || "").split("\n").map((x) => x.trim()).filter(Boolean);
    const authorBio = (f.backAuthorBio || "").trim();
    const bookDescription = blurb || features.length || authorBio
      ? { blurb: blurb || undefined, features: features.length ? features : undefined, authorBio: authorBio || undefined }
      : undefined;
    return {
      volume: vol,
      // What kind of book this is. Not sent as part of `typography` — it selects
      // the production profile, which in turn names the layout standard.
      productionProfileId: f.productionProfileId || "wildlands-field-guide",
      title: f.title,
      subtitle: f.subtitle,
      authorName: f.author,
      trimSize: trimSize(f.trim),
      paperStock: f.paperStock || "white",
      // The four values Setup owns: body size, leading, and the two font roles.
      // The API deep-merges, so per-role type sizes keep their stored values
      // instead of being reset to a schema default.
      typography: {
        bodyPt: Number(f.bodyPt) || 11,
        lineHeight: Number(f.lineHeight) || 1.4,
        headingFont: f.headingFont || "Cormorant Garamond",
        bodyFont: f.bodyFont || "EB Garamond",
      },
      publishing: {
        title: f.title,
        subtitle: f.subtitle,
        authors: f.author.split(",").map((a) => a.trim()).filter(Boolean),
        coverDescription: coverDescription || undefined,
        coverArtDirection: coverArtDirection || undefined,
        series: series ? { name: series, volumeNumber: vol } : undefined,
        bookDescription,
        // Reviewer fields are only sent when a name is actually given, so an
        // empty box never becomes an empty claim on the copyright page.
        accuracyNote: {
          enabled: Boolean(f.accuracyNoteEnabled),
          text: (f.accuracyNoteText || "").trim() || DEFAULT_ACCURACY_NOTE,
          reviewerName: (f.accuracyReviewerName || "").trim() || undefined,
          reviewerCredentials: (f.accuracyReviewerCredentials || "").trim() || undefined,
        },
      },
    };
  }

  const createProject = () => run("Creating project", async () => {
    // Progressive validation: catch the two required-field mistakes locally,
    // in ~0ms, using the exact same {fields, errorCode} shape the backend's
    // centralized error layer sends — so the UI renders identically whether
    // the check ran here or on the server. Saves a round trip on the most
    // common mistake instead of waiting on a network error to say the same
    // thing. See docs/ERROR_HANDLING_STANDARD.md.
    const fieldErrors = [];
    if (!newForm.title.trim()) fieldErrors.push({ path: "title", label: "Title", message: "Title is required.", errorCode: "WL-1001" });
    if (!newForm.author.trim()) fieldErrors.push({ path: "authorName", label: "Author / pen name", message: "Author / pen name is required.", errorCode: "WL-1002" });
    if (fieldErrors.length > 0) {
      const err = new Error(fieldErrors.length === 1 ? fieldErrors[0].message : "Please fix the highlighted fields.");
      err.fields = fieldErrors;
      err.errorCode = fieldErrors.length === 1 ? fieldErrors[0].errorCode : "WL-1000";
      throw err;
    }
    const d = await api("/api/projects", { method: "POST", body: JSON.stringify({ config: cleanConfig({ ...newForm, trim: "7x10", volume: 1 }) }) });
    setProject(d.project); setProjects((c) => [d.project, ...c.filter((p) => p.id !== d.project.id)]);
    setNewForm(EMPTY_NEW_FORM);
    return { notice: `Created “${d.project.title}”.` };
  });

  // Close the open book without deleting anything: clears the active project,
  // the Setup form and the manuscript buffer, drops the saved place so a reload
  // doesn't silently re-open it, and returns to Step 1.
  const closeProject = () => {
    setProject(null);
    setForm(EMPTY_SETUP_FORM);
    setManuscript(""); setManuscriptName("");
    setBreakdown(null); setPagination(null); setPages(null);
    setErrorState(EMPTY_ERROR_STATE);
    localStorage.removeItem("wl_last_place");
    setStep("project");
    setNotice("Project closed. Create a new book or open another below.");
  };

  const deleteProject = (p) => run("Deleting project", async () => {
    await api(`/api/projects/${p.id}`, { method: "DELETE" });
    setProjects((c) => c.filter((x) => x.id !== p.id));
    if (project?.id === p.id) setProject(null);
    return { notice: `Deleted “${p.title}”.` };
  });

  // Optional publishing fields this form OWNS. The API now merges rather than
  // replaces (so a save can never delete config the form doesn't render), which
  // means clearing a field has to be said out loud: if the operator blanks one
  // of these, send an explicit unset for it. Anything NOT in this list is not
  // this form's to delete.
  const setupOwnedOptionalPaths = () => {
    const paths = [];
    if (!(form.coverDescription || "").trim()) paths.push("publishing.coverDescription");
    if (!(form.coverArtDirection || "").trim()) paths.push("publishing.coverArtDirection");
    if (!(form.series || "").trim()) paths.push("publishing.series");
    if (
      !(form.backBlurb || "").trim() &&
      !(form.backFeatures || "").trim() &&
      !(form.backAuthorBio || "").trim()
    ) {
      paths.push("publishing.bookDescription");
    }
    return paths;
  };

  const saveSetup = () => run("Saving setup", async () => {
    if (!project) throw new Error("Open a project first.");
    const d = await api(`/api/projects/${project.id}/config`, {
      method: "PATCH",
      body: JSON.stringify({ config: cleanConfig(), unset: setupOwnedOptionalPaths() }),
    });
    setProject(d.project);
    return { notice: "Book setup saved." };
  });

  const upload = () => run("Uploading manuscript", async () => {
    if (!project) throw new Error("Open a project first.");
    if (!manuscript.trim()) throw new Error("Paste or drop your manuscript text first.");
    // Provenance gate. The button is already disabled in this state; this is the
    // second line of defence so the check cannot be lost to a UI regression.
    // (The backend enforces the same invariant independently — see the upload
    // route's WORKING_COPY_NOT_A_SOURCE guard.)
    if (!canUploadCanonical) {
      throw new Error(
        "This is the stored working copy the platform restored, not a source file. Drop the original manuscript file to replace the canonical source.",
      );
    }
    const d = await api(`/api/projects/${project.id}/manuscript`, { method: "POST", body: JSON.stringify({ filename: manuscriptName || "manuscript.md", markdown: manuscript }) });
    // Keep the project row fresh so the provenance panel below reflects THIS upload.
    setProject((p) => (p ? { ...p, ...d.project } : d.project));
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
    // Review routing rides along from the persisted measurement, merged by
    // pageKey. Failure here must never break the planning preview, so it
    // degrades to "no routing shown" rather than throwing.
    const routed = await api(`/api/projects/${project.id}/paginated-pages`).catch(() => ({ pages: [], routing: null }));
    const rmap = new Map((routed.pages || []).map((r) => [r.pageKey, r]));
    const list = (tf.pages || []).map((p) => {
      const r = rmap.get(p.pageKey) || {};
      return {
        pageKey: p.pageKey,
        entryTitle: p.entryTitle,
        layoutTemplate: p.layoutTemplate,
        fitStatus: p.fit?.status,
        fit: p.fit,
        zones: p.allocation,
        blockers: p.blockers,
        readableWords: r.readableWords ?? null,
        textBlocks: r.textBlocks ?? null,
        reviewRoute: r.reviewRoute ?? null,
        reviewRouteLabel: r.reviewRouteLabel ?? null,
        reviewRouteReason: r.reviewRouteReason ?? null,
        manualCheckRequired: !!r.manualCheckRequired,
        reviewRouteOverridden: !!r.reviewRouteOverridden,
      };
    });
    setRouting(routed.routing || null);
    setPages(list);
    return list;
  }, [api, project]);

  const loadBoard = useCallback(async () => {
    if (!project) return;
    const b = await api(`/api/projects/${project.id}/review-board`).catch(() => null);
    setBoard(b);
  }, [api, project]);

  /** Copy the OFFICIAL forensic prompt verbatim. Fetched from the backend so
   *  there is exactly one copy of it and the console can never drift. */
  const copyForensicPrompt = useCallback(async () => {
    const r = await api(`/api/review/forensic-prompt`);
    await navigator.clipboard.writeText(r.prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2500);
  }, [api]);

  /** Download an export. Plain link so the browser handles the file. */
  const downloadExport = useCallback((params) => {
    if (!project) return;
    const pw = sessionStorage.getItem("wl_pw") || "";
    const qs = new URLSearchParams({ ...params, ...(pw ? { k: pw } : {}) }).toString();
    window.location.href = `${BACKEND}/api/projects/${project.id}/review-export.zip?${qs}`;
  }, [project]);

  /** Write the same export to a local folder — the drag-into-chat workflow. */
  const exportReviewFolder = useCallback(async (selection) => {
    if (!project) return;
    setExportNote("Exporting…");
    try {
      const r = await api(`/api/projects/${project.id}/review-export`, {
        method: "POST",
        body: JSON.stringify({ selection, format: "folder" }),
      });
      setExportNote(r.ok ? `Exported ${r.counts.total} pages → ${r.path}` : r.message);
    } catch (e) {
      setExportNote(`Export failed: ${e.message}`);
    }
  }, [api, project]);

  /** Record a verdict against the EXACT render that was reviewed. */
  const recordVerdict = useCallback(async (renderId, status, notes) => {
    if (!project || !renderId) return;
    await api(`/api/projects/${project.id}/render-reviews`, {
      method: "POST",
      body: JSON.stringify({ renderId, status, method: "AI_CHAT", notes: notes || undefined, reviewedBy: "operator", reviewerLabel: "Claude chat (forensic pixel QA v1)" }),
    });
    await loadBoard();
  }, [api, project, loadBoard]);

  /**
   * Operator override of a page's review route. Changes only WHO reviews the
   * page: the server never touches readableWords, so the tile keeps showing
   * the real measurement alongside the override marker and the rule stays
   * auditable. Passing null clears the override.
   */
  const setReviewRoute = useCallback(async (pageKey, route) => {
    if (!project) return;
    await api(`/api/projects/${project.id}/pages/${pageKey}/review-route`, {
      method: "PATCH",
      body: JSON.stringify({ route, by: "operator" }),
    });
    const routed = await api(`/api/projects/${project.id}/paginated-pages`).catch(() => ({ pages: [], routing: null }));
    const rmap = new Map((routed.pages || []).map((r) => [r.pageKey, r]));
    const merge = (p) => {
      const r = rmap.get(p.pageKey);
      if (!r) return p;
      return {
        ...p,
        reviewRoute: r.reviewRoute ?? null,
        reviewRouteLabel: r.reviewRouteLabel ?? null,
        reviewRouteReason: r.reviewRouteReason ?? null,
        manualCheckRequired: !!r.manualCheckRequired,
        reviewRouteOverridden: !!r.reviewRouteOverridden,
      };
    };
    setRouting(routed.routing || null);
    setPages((prev) => (prev || []).map(merge));
    setZoom((z) => (z && z.pageKey === pageKey ? merge(z) : z));
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

  // A render call returns HTTP 200 even when the underlying generation failed
  // (status: "FAILED" in the body, e.g. billing limit) — it's not an error the
  // pipeline is guarding against per-page, it succeeded at recording the
  // failure. So this loop tracks real success/failure itself, and — this is
  // the important part — STOPS after a run of consecutive failures instead of
  // blindly working through the rest of the backlog: 3 failures in a row is
  // almost always a systemic block (billing, outage), not 3 unlucky pages,
  // and burning through the other 150 pending pages the same way just
  // produces 150 more FAILED rows for nothing.
  const CONSECUTIVE_FAILURE_STOP = 3;
  const renderAll = (filter) => run("Rendering all pending pages (paid)", async () => {
    const pending = (renders?.merged || []).filter((m) => m.status === "NOT RENDERED" && filter(m));
    let ok = 0, failed = 0, consecutiveFailed = 0, stoppedEarly = false;
    let lastError = "";
    for (const m of pending) {
      const d = await api(`/api/whole-page-render/${m.pageId}`, { method: "POST", body: "{}" });
      if (d.status === "RENDERED" || d.status === "APPROVED") { ok++; consecutiveFailed = 0; }
      else { failed++; consecutiveFailed++; lastError = d.render?.errorMessage || d.status || "unknown"; }
      if (consecutiveFailed >= CONSECUTIVE_FAILURE_STOP) { stoppedEarly = true; break; }
    }
    await loadRenders();
    const attempted = ok + failed;
    const notice = stoppedEarly
      ? `Stopped after ${CONSECUTIVE_FAILURE_STOP} failures in a row (${ok} succeeded, ${failed} failed of ${attempted} attempted, ${pending.length - attempted} not tried). Last error: "${lastError}" — fix that before running the rest.`
      : failed > 0
        ? `Rendered ${ok} of ${pending.length} — ${failed} failed. Check the FAILED pages below.`
        : `Rendered ${ok} page(s).`;
    return { notice };
  });

  const previewPage = (pageId, imagePath) => run("Building no-spend preview", async () => {
    const d = await api(`/api/whole-page-render/page/${pageId}/preview-package`);
    // Carry the rendered image (if any) so the modal shows the actual page, not just
    // the text package — lets the operator SEE a rendered page (e.g. the index) large.
    setPreview({ ...d, _imagePath: imagePath || null, _cb: Date.now() });
    return { notice: `Preview ready for ${d.authority?.entryTitle || pageId} (no spend).` };
  });

  // Pre-flight sanity check on the ASSEMBLED PROMPT — before any spend. Catches
  // subject/entry mismatches, truncated or garbled body text, and placeholder
  // content before the operator commits to a paid render. One explicit call,
  // never auto-triggered, never retried.
  const reviewPromptPage = (pageId) => run("Reviewing prompt (no spend)", async () => {
    const d = await api(`/api/whole-page-render/page/${pageId}/review-prompt`, { method: "POST", body: "{}" });
    setPromptReviewResults((prev) => ({ ...prev, [pageId]: d }));
    return { notice: d.pass ? "Prompt review: looks correct." : `Prompt review found ${d.issues.length} issue(s) — see below.` };
  });

  const renderPage = (pageId) => run("Rendering page (paid)", async () => {
    const d = await api(`/api/whole-page-render/${pageId}`, { method: "POST", body: "{}" });
    await loadRenders();
    // A render call returns HTTP 200 even when the underlying generation
    // failed (e.g. an OpenAI billing/quota error) — see renderAll's comment
    // above. Surfacing that as a green success notice ("Rendered v1
    // (FAILED)") is exactly the kind of raw-status-leak this app's error
    // layer exists to prevent, so a non-success status is thrown instead,
    // routing it through the same red banner as any other error.
    if (d.status !== "RENDERED" && d.status !== "APPROVED") {
      throw new Error(d.render?.errorMessage || `Render failed (status: ${d.status}).`);
    }
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

  // Cheap AI text-fidelity check (chat-vision call, not another image generation).
  // Compares the baked text against the source and flags mismatches — the operator
  // still clicks Approve themselves, this just does the word-by-word reading for them.
  const aiReviewRender = (renderId) => run("AI reviewing text (cheap)", async () => {
    const d = await api(`/api/whole-page-render/${renderId}/ai-review`, { method: "POST", body: "{}" });
    setReviewResults((prev) => ({ ...prev, [renderId]: d }));
    return { notice: d.pass ? "AI review: text looks correct." : `AI review found ${d.issues.length} issue(s) — see below.` };
  });

  // Manual image upload — the escape hatch when OpenAI generation is blocked
  // (billing limit, outage) or the operator hand-corrected an image outside the
  // pipeline. Registers it as a real render version; approve/print-prep/select
  // all work on it afterward exactly like a normal render.
  const uploadManualRender = (pageId, file) => run("Uploading image (no spend)", async () => {
    const imageBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const d = await api(`/api/whole-page-render/${pageId}/upload-manual`, { method: "POST", body: JSON.stringify({ imageBase64 }) });
    await loadRenders();
    return { notice: `Uploaded as v${d.render?.version} — review and approve it below.` };
  });

  // COVER PREFLIGHT — free. Resolves exactly what a paid generation would send:
  // the geometry, the blueprint the model receives, the final prompt, the cost,
  // and the checks that would block it. Nothing here spends.
  const loadCoverPreflight = () => run("Checking the cover before spending", async () => {
    const d = await api(`/api/projects/${project.id}/cover/preflight`);
    setPreflight({ ...d, _cb: Date.now() });
    return {
      notice: d.blocked
        ? "Preflight FAILED — generation is blocked. Fix the errors below."
        : d.status === "WARNING"
          ? "Preflight passed with warnings. Read them before generating."
          : "Preflight passed. Safe to generate.",
    };
  });

  const genCover = () => run("Generating cover (paid)", async () => {
    const d = await api(`/api/projects/${project.id}/generate-cover-artwork`, { method: "POST", body: "{}" });
    setCover({ ...d, _cb: Date.now() });
    await loadCoverVersions(project.id).catch(() => {});
    return { notice: "Cover artwork generated." };
  });

  // Upload a finished wrap instead of generating one. Mirrors the illustration
  // upload: the file becomes the next version, the previous one is kept, and
  // the export gate is re-pointed at the page count this wrap was built for.
  // Costs nothing — it is the escape hatch for artwork finished outside the
  // platform, and the way an approved cover gets back in after a manual fix.
  const uploadCover = (file) => run("Uploading cover artwork", async () => {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Could not read that file."));
      r.readAsDataURL(file);
    });
    const pngBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const d = await api(`/api/projects/${project.id}/cover-artwork`, {
      method: "PUT",
      body: JSON.stringify({ pngBase64, note: `Uploaded ${file.name}` }),
    });
    setCoverVersions((c) => ({ ...(c || {}), currentAssetPath: d.current.assetPath, versions: d.versions, current: d.current }));
    setCover({ imagePath: d.current.assetPath, _probe: true, _cb: Date.now() });
    return { notice: `Uploaded as version ${d.current.version} (${d.current.widthPx}×${d.current.heightPx}). The previous cover is kept.` };
  });

  const selectCoverVersion = (version) => run(`Switching to cover version ${version}`, async () => {
    const d = await api(`/api/projects/${project.id}/cover-artwork`, { method: "PUT", body: JSON.stringify({ selectVersion: version }) });
    setCoverVersions((c) => ({ ...(c || {}), currentAssetPath: d.current.assetPath, versions: d.versions, current: d.current }));
    setCover({ imagePath: d.current.assetPath, _probe: true, _cb: Date.now() });
    return { notice: `Version ${version} is now the cover. Nothing was deleted.` };
  });

  // Fix ONLY the spine of an approved cover. One image-edit call against the
  // existing artwork, masked to the spine, and only the spine column of the
  // result is kept — the front and back stay byte-identical. Costs the same as
  // a generation, but a full regenerate would throw away an approved cover:
  // the model never draws the same thing twice.
  const repairSpine = () => run("Repairing the spine (paid)", async () => {
    const d = await api(`/api/projects/${project.id}/cover/repair-spine`, { method: "POST", body: "{}" });
    setCover((c) => ({ ...(c || {}), ...d, _cb: Date.now() }));
    return {
      notice: d.spineChanged
        ? `Spine repaired (${d.strip?.widthPx}px strip). Front and back unchanged; previous artwork kept.`
        : "The spine came back unchanged — the model did not alter it. Nothing else was touched.",
    };
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

  // Delivery check — opens the FINISHED files and reports what they contain
  // (page size, TrimBox, embedded fonts, wrap geometry). Read-only and free.
  // This was a script with the previous book's paths compiled into it, so no
  // operator could run it on their own book without a shell and a developer.
  const runDeliveryCheck = () => run("Checking the finished files", async () => {
    const d = await api(`/api/projects/${project.id}/delivery-check`);
    setDelivery(d);
    const bad = (d.checks || []).filter((c) => c.status === "FAIL").length;
    return { notice: bad ? `${bad} problem${bad === 1 ? "" : "s"} found — see the list.` : `Delivery check: ${d.status}.` };
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

  const activeStepIndex = Math.max(0, STEPS.findIndex((st) => st.key === step));
  const jumpToStep = (key) => {
    setStep(key);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goRelativeStep = (delta) => {
    const next = STEPS[activeStepIndex + delta];
    if (next) jumpToStep(next.key);
  };
  const shellStyle = isMobile ? { ...S.shell, display: "block", minHeight: "100dvh" } : S.shell;
  const sideStyle = isMobile ? { ...S.side, width: "100%", height: "auto", maxHeight: "none", position: "sticky", top: 0, zIndex: 200, borderRight: "none", borderBottom: `1px solid ${C.line}`, padding: "11px 12px 9px", overflow: "visible" } : S.side;
  const mainStyle = isMobile ? { ...S.main, width: "100%", maxWidth: "none", padding: "16px 12px 96px", boxSizing: "border-box" } : S.main;

  if (!authReady) return null; // brief: checking a stored password
  if (!authed) return <LoginScreen onLogin={doLogin} />;

  return (
    <div style={shellStyle} className="wl-console-shell">
      <aside style={sideStyle} className="wl-console-sidebar">
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 2 }}>Wild Lands</div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: isMobile ? 8 : 16 }}>Operator Production Console</div>
        {isMobile && (
          <select aria-label="Jump to workflow step" value={step} onChange={(e) => jumpToStep(e.target.value)} style={{ ...S.input, marginTop: 0, marginBottom: 8, fontSize: 15 }}>
            {STEPS.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
          </select>
        )}
        <nav className="wl-step-nav" aria-label="Publishing workflow steps" style={isMobile ? { display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollSnapType: "x proximity", paddingBottom: 4 } : undefined}>
        {STEPS.map((st) => (
          <div key={st.key} style={isMobile ? { ...S.step(step === st.key, doneFlags[st.key]), flex: "0 0 auto", minWidth: 112, display: "block", marginBottom: 0, padding: "8px 10px", scrollSnapAlign: "start" } : S.step(step === st.key, doneFlags[st.key])} onClick={() => jumpToStep(st.key)}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={S.dot(doneFlags[st.key])}>{doneFlags[st.key] ? "✓" : ""}</span>
              <span>{isMobile ? shortStepLabel(st.label) : st.label}</span>
            </div>
            {!isMobile && st.purpose && <div style={{ fontSize: 11, color: C.muted, marginLeft: 24, marginTop: 3, lineHeight: 1.3 }}>{st.purpose}</div>}
          </div>
        ))}
        </nav>
        <div style={isMobile ? { marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.line}`, fontSize: 11.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : { marginTop: 22, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontSize: 12, color: C.muted }}>
          {project ? <>Active: <b style={{ color: C.ink }}>{project.title}</b></> : "No project open"}
        </div>
        {/* Without this, an open book had no visible exit — the only way back to
            a clean Step 1 was clearing browser storage. Closing never deletes. */}
        {project && (
          <button
            title="Close this book and go back to Step 1 (nothing is deleted)"
            style={{ ...S.ghost, marginTop: 8, fontSize: 11.5, width: isMobile ? "auto" : "100%", textAlign: "left" }}
            onClick={closeProject}
          >
            ✕ Close project
          </button>
        )}
        {onExitToLegacy && (
          <button style={{ ...S.ghost, marginTop: 14, fontSize: 11 }} onClick={onExitToLegacy}>Legacy tools ↗</button>
        )}
      </aside>

      <main style={mainStyle} className="wl-console-main">
        {/* Sticky so the result of an action is visible no matter how far down
            the page the operator has scrolled — this grid runs to hundreds of
            cards, and a banner that only appeared at the very top of the page
            was invisible for virtually every click made mid-list. */}
        {(busy || errorState.message || notice) && (
          <div style={{ position: isMobile ? "static" : "sticky", top: 0, zIndex: 50, background: C.paper, paddingBottom: 8, marginBottom: 2 }}>
            {busy && <div style={{ ...S.pill(C.orange), marginBottom: 10 }}>⏳ {busy}…</div>}
            {errorState.message && (
              <div style={{ ...S.card, borderColor: C.red, color: C.red, marginTop: 0 }}>
                ⚠ {errorState.message}
                {errorState.code && <span title="Reference this code if you need to report the issue." style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 600, color: C.muted, letterSpacing: 0.3 }}>{errorState.code}</span>}
                {errorState.action && errorState.action.type === "navigate" && (
                  <div>
                    {errorState.action.explanation && <div style={{ fontSize: 12.5, marginTop: 6, marginBottom: 2 }}>{errorState.action.explanation}</div>}
                    <button
                      style={{ ...S.btn(), background: C.red, marginTop: 6, marginRight: 0 }}
                      onClick={() => {
                        // Recovery-success telemetry (docs/ERROR_HANDLING_STANDARD.md):
                        // fire-and-forget "clicked", then arm the pending-recovery
                        // ref so the next run() outcome can report whether it worked.
                        if (errorState.correlationId) {
                          pendingRecoveryRef.current = errorState.correlationId;
                          api("/api/diagnostics/recovery-event", { method: "POST", body: JSON.stringify({ correlationId: errorState.correlationId, kind: "clicked" }) }).catch(() => {});
                        }
                        setStep(errorState.action.target); setErrorState(EMPTY_ERROR_STATE);
                      }}
                    >
                      {errorState.action.label} →
                    </button>
                    {errorState.action.docLink && <a href={errorState.action.docLink} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontSize: 12, color: C.red }}>Learn more ↗</a>}
                  </div>
                )}
              </div>
            )}
            {notice && !errorState.message && <div style={{ ...S.card, borderColor: C.green, marginTop: 0 }}>{notice}</div>}
          </div>
        )}

        {step === "project" && (
          <Panel title="Project" sub="Open an existing book or create a new one.">
            <div style={S.card}>
              <b>Open existing</b>
              <div style={{ marginTop: 8 }}>
                {projects.length === 0 && <span style={{ color: C.muted }}>No projects yet.</span>}
                {projects.map((p) => {
                  const active = project?.id === p.id;
                  const detailBits = [p.subtitle, p.authorName, p.createdAt ? new Date(p.createdAt).toLocaleDateString() : null].filter(Boolean);
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <button style={{ ...(active ? S.btn("ok") : S.ghost), margin: 0, flex: 1, textAlign: "left", display: "block" }} onClick={() => { setProject(p); setNotice(`Opened “${p.title}”.`); }}>
                        <div>{p.title} <span style={{ ...S.pill(active ? "rgba(255,255,255,0.25)" : C.muted), marginLeft: 4 }}>{p.status}</span></div>
                        {detailBits.length > 0 && (
                          <div style={{ color: active ? "rgba(255,255,255,0.85)" : C.muted, fontSize: 11.5, marginTop: 2 }}>{detailBits.join(" · ")}</div>
                        )}
                      </button>
                      <button title={`Delete “${p.title}”`} style={{ ...S.ghost, margin: 0, color: C.red, borderColor: C.red, padding: "6px 10px", fontSize: 11 }}
                        onClick={() => { if (window.confirm(`Permanently delete “${p.title}” and ALL its pages, renders, and cover? This cannot be undone.`)) deleteProject(p).catch(() => {}); }}>✕</button>
                    </div>
                  );
                })}
              </div>
              <button style={S.ghost} onClick={() => loadProjects().catch(() => {})}>↻ Refresh</button>
            </div>
            <div style={S.card}>
              <b>Create new</b>
              {/* Bound to `newForm`, NOT the Setup form — a new book starts blank
                  even when another project is open. */}
              <LabeledInput label="Book title" value={newForm.title} onChange={(v) => setNewForm({ ...newForm, title: v })} error={fieldError(errorState.fields, "title")} />
              {/* Progressive validation: flagged the instant it matches, not after Create is clicked — duplicate
                  titles are still allowed (see the disambiguating subtitle/author/date above), this is just a heads-up. */}
              {newForm.title.trim() && projects.some((p) => p.title.trim().toLowerCase() === newForm.title.trim().toLowerCase()) && (
                <div style={{ color: C.orange, fontSize: 12, marginTop: 4 }}>A project named "{newForm.title.trim()}" already exists. You can still create another — just double-check this isn't an accidental duplicate.</div>
              )}
              <LabeledInput label="Subtitle" value={newForm.subtitle} onChange={(v) => setNewForm({ ...newForm, subtitle: v })} error={fieldError(errorState.fields, "subtitle")} />
              <LabeledInput label="Author / pen name" value={newForm.author} onChange={(v) => setNewForm({ ...newForm, author: v })} error={fieldError(errorState.fields, "authorName")} />
              <button style={S.btn()} onClick={() => createProject().then(() => setStep("manuscript")).catch(() => {})}>Create project →</button>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>
                Creating a new book closes the one that's open. Nothing is deleted — reopen it any time from the list above.
              </div>
            </div>
          </Panel>
        )}

        {step === "manuscript" && (
          <Panel title="Manuscript" sub="Paste or drop the master manuscript (Markdown). This is the source of truth for breakdown, pagination, and the glossary.">
            <Guard project={project} setStep={setStep} />
            {project && (
              <>
                <div style={S.card}>
                  <b>Required structure</b>
                  <ul style={{ fontSize: 13, color: C.ink, marginTop: 8, paddingLeft: 20, lineHeight: 1.6 }}>
                    <li><code>{"# CHAPTER 1: TITLE"}</code> — one top-level heading per chapter.</li>
                    <li><code>{"### Entry Title"}</code> — one per page, inside its chapter. <b>Every chapter needs at least one</b> — a chapter with none fails Breakdown.</li>
                    <li><code>{"# GLOSSARY"}</code> — optional, top-level, recognized automatically.</li>
                  </ul>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                    Index and back-matter resources are generated by the platform — don't add them to the manuscript.
                  </div>
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.blue }}>Show example</summary>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 11.5, background: "#fff", padding: 10, borderRadius: 6, marginTop: 8, border: `1px solid ${C.line}` }}>{MANUSCRIPT_TEMPLATE}</pre>
                  </details>
                  <button style={S.ghost} onClick={() => downloadTextFile("manuscript-template.md", MANUSCRIPT_TEMPLATE)}>⭳ Download template (.md)</button>
                </div>
                <div style={S.card}>
                  <DropZone onText={(t, n) => { setManuscript(t); setManuscriptName(n); setManuscriptOrigin("file"); }} />
                  <textarea
                    style={{ ...S.input, minHeight: 200, fontFamily: "monospace", fontSize: 12 }}
                    value={manuscript}
                    placeholder="# Chapter 1 …"
                    onChange={(e) => {
                      setManuscript(e.target.value);
                      // Typing into an EMPTY box is the operator supplying genuine
                      // source bytes. Editing RESTORED text is not: the sanitizer
                      // already removed characters that editing cannot bring back,
                      // so it stays derivative. Editing a dropped FILE also stays
                      // "file" — those bytes originated from a real source.
                      setManuscriptOrigin((o) => (o === "empty" ? "typed" : o));
                    }}
                  />
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                    {manuscript.length.toLocaleString()} chars{manuscriptName ? ` · ${manuscriptName}` : ""}
                    {manuscriptOrigin === "file" && <span style={{ ...S.pill(C.green), marginLeft: 8 }}>SOURCE FILE</span>}
                    {manuscriptOrigin === "typed" && <span style={{ ...S.pill(C.green), marginLeft: 8 }}>TYPED / PASTED</span>}
                    {manuscriptOrigin === "restored" && <span style={{ ...S.pill(C.muted), marginLeft: 8 }}>RESTORED WORKING COPY</span>}
                  </div>
                  {manuscriptOrigin === "restored" && (
                    <div style={{ ...S.card, borderColor: C.orange, marginTop: 10 }}>
                      <b>This is the stored working copy, not a source file.</b>
                      <div style={{ fontSize: 12.5, color: C.ink, marginTop: 6, lineHeight: 1.5 }}>
                        The platform loaded the <b>sanitized working manuscript</b> so you can read and
                        check it. These are derived bytes — the canonical source may contain characters
                        (emoji, original punctuation) that were stripped to produce this copy.
                        <br /><br />
                        Uploading it would record a derivative as your canonical artifact and show the
                        wrong frozen hash, so it is blocked. <b>Drop the original manuscript file above</b>
                        {" "}to replace the canonical source.
                      </div>
                    </div>
                  )}
                  {/* Progressive validation (docs/ERROR_HANDLING_STANDARD.md): a coarse,
                      client-side echo of assertUsableManuscriptOutline's rule, shown as
                      they type — not a hard block, since a partial paste mid-edit
                      shouldn't scold; it just gets ahead of the Breakdown-time failure. */}
                  {manuscriptStructureHint(manuscript) && (
                    <div style={{ color: C.orange, fontSize: 12, marginTop: 4 }}>⚠ {manuscriptStructureHint(manuscript)}</div>
                  )}
                  <button
                    style={{ ...S.btn(), ...(canUploadCanonical ? {} : { background: C.muted, cursor: "not-allowed" }) }}
                    disabled={!canUploadCanonical}
                    title={canUploadCanonical ? "Store this as the canonical source manuscript" : "Drop a source file first — the restored working copy cannot become the canonical source."}
                    onClick={() => upload().then(() => setStep("setup")).catch(() => {})}
                  >
                    Upload manuscript →
                  </button>
                </div>
                <ManuscriptProvenance project={project} />
              </>
            )}
          </Panel>
        )}

        {step === "setup" && (
          <Panel title="Book Setup" sub="The book's identity — title, subtitle/region, cover description, author, series, and volume. These print on the cover, title page, and series page. Visual style is locked by the Publishing Standard.">
            <Guard project={project} setStep={setStep} />
            {project && (
              <div style={S.card}>
                <LabeledInput label="Book title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} error={fieldError(errorState.fields, "title")} />
                <LabeledInput label="Subtitle / region" value={form.subtitle} onChange={(v) => setForm({ ...form, subtitle: v })} error={fieldError(errorState.fields, "subtitle")} />
                <LabeledInput label="Cover description line" value={form.coverDescription} onChange={(v) => setForm({ ...form, coverDescription: v })} />
                <LabeledInput label="Author / pen name (comma-separate co-authors)" value={form.author} onChange={(v) => setForm({ ...form, author: v })} error={fieldError(errorState.fields, "authorName")} />
                <LabeledInput label="Series name" value={form.series} onChange={(v) => setForm({ ...form, series: v })} />
                <label style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 600 }}>Volume
                  <input type="number" min="1" step="1" style={S.input} value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} />
                  <span style={{ fontWeight: 400, color: C.muted, fontSize: 12 }}>{form.series && Number(form.volume) > 0 ? `Prints as: ${form.series.toUpperCase()} — VOLUME ${roman(Number(form.volume))}` : "Stored as a number; printed as a Roman numeral."}</span>
                </label>
                <label style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 600 }}>Trim size
                  <select style={S.input} value={form.trim} onChange={(e) => setForm({ ...form, trim: e.target.value })}>
                    <option value="7x10">Hardcover 7 × 10 (bleed 0.125)</option>
                    <option value="6x9">Paperback 6 × 9 (bleed 0.125)</option>
                    <option value="5.5x8.5">Paperback Digest 5.5 × 8.5 (text interior, bleed 0)</option>
                    <option value="8.5x11">Large 8.5 × 11 (bleed 0.125)</option>
                  </select>
                  <span style={{ fontWeight: 400, color: C.muted, fontSize: 12 }}>
                    Bleed follows the trim. A text interior prints with none; an illustrated page bleeds 0.125 in.
                  </span>
                </label>
                {/* Paper stock sits beside trim because it is the other input to
                    the printed geometry: it sets the SPINE WIDTH and nothing else.
                    KDP cream is thicker than white, so the same page count gives a
                    wider spine, and getting it wrong drags the front artwork around
                    the fold with nothing in the file to show it. */}
                <label style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 600 }}>Interior paper
                  <select style={S.input} value={form.paperStock}
                    onChange={(e) => setForm({ ...form, paperStock: e.target.value })}>
                    <option value="white">White (0.002252 in / page)</option>
                    <option value="cream">Cream (0.0025 in / page)</option>
                  </select>
                  <span style={{ fontWeight: 400, color: C.muted, fontSize: 12 }}>
                    Sets the spine width on the cover. Cream is thicker, so the same book gets a wider spine.
                  </span>
                </label>
                {/* Body typography lives here, not in the renderer: it is a
                    per-book decision, and the typesetter reads it from config. */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <label style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 600, flex: "1 1 140px" }}>Body size (pt)
                    <input type="number" min="8" max="16" step="0.5" style={S.input} value={form.bodyPt}
                      onChange={(e) => setForm({ ...form, bodyPt: e.target.value })} />
                  </label>
                  <label style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 600, flex: "1 1 140px" }}>Line height
                    <input type="number" min="1" max="2" step="0.05" style={S.input} value={form.lineHeight}
                      onChange={(e) => setForm({ ...form, lineHeight: e.target.value })} />
                  </label>
                </div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                  Drives the typeset interior directly. Digest text books are typically 12pt / 1.3; large-format illustrated pages 11pt / 1.4.
                </div>
                {/* Font roles: headingFont is the display face (chapter labels,
                    titles, section headings); bodyFont is the text face. Both
                    already existed in ProjectConfig but had no way in. */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <label style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 600, flex: "1 1 180px" }}>Display face (headings)
                    <select style={S.input} value={form.headingFont}
                      onChange={(e) => setForm({ ...form, headingFont: e.target.value })}>
                      {HEADING_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </label>
                  <label style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 600, flex: "1 1 180px" }}>Text face (body)
                    <select style={S.input} value={form.bodyFont}
                      onChange={(e) => setForm({ ...form, bodyFont: e.target.value })}>
                      {BODY_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </label>
                </div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                  The display face sets chapter labels, chapter titles and section headings. Rebuild the typeset preview in Step 5 to see a change.
                </div>
                {/* Book type selects the production profile, which decides the
                    production track and names the layout standard the interior
                    is rendered against. */}
                <label style={{ display: "block", marginTop: 16, fontSize: 13, fontWeight: 600 }}>Book type
                  <select style={S.input} value={form.productionProfileId}
                    onChange={(e) => setForm({ ...form, productionProfileId: e.target.value })}>
                    {BOOK_TYPES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </select>
                </label>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                  Decides whether body pages are AI-rendered or deterministically typeset, how illustrations are budgeted, and which layout standard the interior follows.
                </div>
                {form.typesetLayoutStandardId ? (
                  <div style={{ marginTop: 10, padding: "8px 10px", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12.5 }}>
                    <strong>Layout standard:</strong> <code>{form.typesetLayoutStandardId}</code>
                    <div style={{ color: C.muted, marginTop: 3 }}>
                      Pinned to this book. A newer version of the standard will not change these pages unless you upgrade deliberately.
                    </div>
                  </div>
                ) : null}

                <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Cover art direction</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2, marginBottom: 4 }}>
                    What the cover artwork should actually BE — the concept, the palette, what appears on
                    the front, the spine and the back. This is the single field that decides what the paid
                    cover generation produces; leave it blank and the model invents a generic scene from
                    the title. Everything here reaches the image model, which also bakes the title,
                    subtitle, author and back-cover copy into the artwork itself — so every word in the
                    fields above has to be right <b>before</b> you generate.
                  </div>
                  <LabeledTextarea label="Cover art direction" rows={10}
                    hint="Concept, palette, and what belongs on the front / spine / back. Say what to avoid as well as what to include."
                    value={form.coverArtDirection} onChange={(v) => setForm({ ...form, coverArtDirection: v })} />
                </div>

                {/* ACCURACY NOTE — front matter for books making health/safety claims. */}
                <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Accuracy note (front matter)</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2, marginBottom: 8 }}>
                    An optional line on the copyright page, for books making health, safety or other claims a
                    reader could act on. Off by default. Edit the wording to match what was actually done.
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={Boolean(form.accuracyNoteEnabled)}
                      onChange={(e) => setForm({ ...form, accuracyNoteEnabled: e.target.checked })} />
                    Print an accuracy note on the copyright page
                  </label>
                  {form.accuracyNoteEnabled && (
                    <>
                      <LabeledTextarea label="Note text" rows={4}
                        hint="Say what was actually done. Do not claim a professional reviewed the book unless one did — name them below if so."
                        error={fieldError(errorState.fields, "accuracyNote.text")}
                        value={form.accuracyNoteText} onChange={(v) => setForm({ ...form, accuracyNoteText: v })} />
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 240px" }}>
                          <LabeledInput label="Reviewer name (only if one actually reviewed it)"
                            value={form.accuracyReviewerName}
                            onChange={(v) => setForm({ ...form, accuracyReviewerName: v })} />
                        </div>
                        <div style={{ flex: "1 1 200px" }}>
                          <LabeledInput label="Reviewer credentials"
                            value={form.accuracyReviewerCredentials}
                            onChange={(v) => setForm({ ...form, accuracyReviewerCredentials: v })} />
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: C.orange, marginTop: 6, lineHeight: 1.5 }}>
                        Saying the book was medically reviewed is a claim about a person. If the note says so and no
                        reviewer is named, saving is rejected — that check lives in the schema, not this form, so it
                        holds for the API and scripts too.
                      </div>
                    </>
                  )}
                </div>

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
            {/* The typeset interior is REVIEWED in Step 7, with every other
                edition, rather than here. Pagination is where pages are made;
                Step 7 is the one place the operator looks at what came out. */}
            {project && trackOf(form.productionProfileId) === "typeset" && (
              <div style={{ ...S.card, borderColor: C.blue }}>
                <b>This book's pages come from the typesetter</b>
                <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
                  Nothing here needs running. The typeset interior — page count, blanks, overflow,
                  illustrations, and the trim guides — is built and reviewed in <b>Step 7 · Render &amp; Review</b>,
                  alongside the cover and the Kindle edition.
                </div>
                <button style={{ ...S.btn(), marginTop: 10 }} onClick={() => setStep("render")}>
                  Go to Step 7 · Render &amp; Review →
                </button>
              </div>
            )}
            {project && trackOf(form.productionProfileId) !== "typeset" && (
              <TypesetPreview project={project} api={api} fileUrlBase={BACKEND} />
            )}
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
                {/* ── FORENSIC REVIEW WORKFLOW ─────────────────────────────
                    Routing (blue) says WHO reviews a page. Verdict (its own
                    chips) says what they found. The two are never merged. */}
                <div style={{ marginTop: 16, padding: 14, border: `1px solid ${C.line}`, borderRadius: 10, background: C.panel }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Forensic review</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button style={S.btn(promptCopied ? "ok" : "primary")} onClick={copyForensicPrompt}>
                        {promptCopied ? "Prompt copied" : "Copy Forensic Prompt"}
                      </button>
                      <button style={S.ghost} onClick={loadBoard}>Refresh</button>
                    </div>
                  </div>

                  {!board && <div style={{ marginTop: 8, color: C.muted, fontSize: 13 }}>Click Refresh to load routing and review status.</div>}

                  {board && (
                    <>
                      <div style={{ marginTop: 10, fontSize: 13, color: C.muted }}>
                        Routing rule: <b>{board.threshold}+ canonical source words to AI review</b>. Routing is not approval.
                      </div>
                      <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
                        <span><span style={S.pill(C.blue)}>AI REVIEW</span> {board.counts.aiReview} <span style={{ color: C.muted }}>({board.counts.aiReviewUnreviewed} unreviewed)</span></span>
                        <span><span style={S.pill(C.muted)}>MANUAL</span> {board.counts.manualReview} <span style={{ color: C.muted }}>({board.counts.manualUnreviewed} unreviewed)</span></span>
                        <span style={{ color: C.muted }}>|</span>
                        <span><span style={S.pill(C.green)}>APPROVED</span> {board.counts.approved}</span>
                        <span><span style={S.pill(C.red)}>ISSUE</span> {board.counts.issueFound}</span>
                        <span><span style={S.pill(C.orange)}>UNCERTAIN</span> {board.counts.uncertain}</span>
                        <span><span style={S.pill(C.line)}>UNREVIEWED</span> {board.counts.unreviewed}</span>
                      </div>

                      <div style={{ marginTop: 12, fontSize: 12, color: C.muted }}>Download as .zip</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button style={S.btn()} onClick={() => downloadExport({ route: "AI_REVIEW" })}>AI review pages ({board.counts.aiReview})</button>
                        <button style={S.btn("ghost")} onClick={() => downloadExport({ route: "MANUAL_REVIEW" })}>Manual review pages ({board.counts.manualReview})</button>
                        <button style={S.btn("ghost")} onClick={() => downloadExport({ unreviewed: "true" })}>All unreviewed ({board.counts.unreviewed})</button>
                        <button style={S.btn("ghost")} disabled={picked.length === 0} onClick={() => downloadExport({ pageKeys: picked.join(",") })}>Selected ({picked.length})</button>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 12, color: C.muted }}>Or write to a local folder (drag straight into a chat)</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button style={S.ghost} onClick={() => exportReviewFolder({ kind: "ROUTE", route: "AI_REVIEW" })}>AI review to folder</button>
                        <button style={S.ghost} onClick={() => exportReviewFolder({ kind: "ROUTE", route: "MANUAL_REVIEW" })}>Manual to folder</button>
                        <button style={S.ghost} disabled={picked.length === 0} onClick={() => exportReviewFolder({ kind: "PAGE_KEYS", pageKeys: picked })}>Selected to folder</button>
                      </div>
                      {exportNote && <div style={{ marginTop: 8, fontSize: 12, color: C.ink, wordBreak: "break-all" }}>{exportNote}</div>}

                      <div style={{ marginTop: 14, maxHeight: 340, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: C.paper }}>
                              <th style={{ padding: 6, width: 28 }}></th>
                              <th style={{ padding: 6, textAlign: "left" }}>Page</th>
                              <th style={{ padding: 6, textAlign: "left" }}>Render</th>
                              <th style={{ padding: 6, textAlign: "right" }}>Words</th>
                              <th style={{ padding: 6, textAlign: "left" }}>Route</th>
                              <th style={{ padding: 6, textAlign: "left" }}>Verdict</th>
                              <th style={{ padding: 6, textAlign: "left" }}>Record</th>
                            </tr>
                          </thead>
                          <tbody>
                            {board.pages.map((p) => {
                              const vc = p.reviewStatus === "APPROVED" ? C.green : p.reviewStatus === "ISSUE_FOUND" ? C.red : p.reviewStatus === "UNCERTAIN" ? C.orange : C.line;
                              const ai = p.reviewRoute === "AI_REVIEW";
                              return (
                                <tr key={p.pageKey} style={{ borderTop: `1px solid ${C.line}` }}>
                                  <td style={{ padding: 4, textAlign: "center" }}>
                                    <input type="checkbox" checked={picked.includes(p.pageKey)}
                                      onChange={(e) => setPicked((prev) => e.target.checked ? [...prev, p.pageKey] : prev.filter((k) => k !== p.pageKey))} />
                                  </td>
                                  <td style={{ padding: 4, fontWeight: 600 }}>{p.pageKey}</td>
                                  <td style={{ padding: 4, color: C.muted }}>{p.renderVersion != null ? `v${p.renderVersion}` : "-"}</td>
                                  <td style={{ padding: 4, textAlign: "right" }}>{p.readableWords == null ? "-" : p.readableWords}</td>
                                  <td style={{ padding: 4 }} title={p.reviewRouteReason || ""}>
                                    <span style={{ ...S.pill(ai ? C.blue : "transparent"), color: ai ? "#fff" : C.blue, border: ai ? "none" : `1px solid ${C.field}` }}>
                                      {ai ? "AI" : "MANUAL"}
                                    </span>
                                    {p.escalated && <span style={{ fontSize: 10, color: C.orange, marginLeft: 4 }}>esc</span>}
                                    {p.overridden && <span style={{ fontSize: 10, color: C.muted, marginLeft: 4 }}>ovr</span>}
                                  </td>
                                  <td style={{ padding: 4 }}><span style={S.pill(vc)}>{p.reviewStatus}</span></td>
                                  <td style={{ padding: 4, whiteSpace: "nowrap" }}>
                                    <button style={{ ...S.ghost, marginTop: 0, padding: "2px 6px", fontSize: 11 }} disabled={!p.renderId} onClick={() => recordVerdict(p.renderId, "APPROVED")}>ok</button>
                                    <button style={{ ...S.ghost, marginTop: 0, padding: "2px 6px", fontSize: 11 }} disabled={!p.renderId} onClick={() => recordVerdict(p.renderId, "ISSUE_FOUND", window.prompt("Findings for " + p.pageKey) || "")}>issue</button>
                                    <button style={{ ...S.ghost, marginTop: 0, padding: "2px 6px", fontSize: 11 }} disabled={!p.renderId} onClick={() => recordVerdict(p.renderId, "UNCERTAIN", window.prompt("What is uncertain on " + p.pageKey) || "")}>?</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
                {pages && pages.length > 0 && (
                  <>
                    <div style={{ marginTop: 8, color: C.muted, fontSize: 13 }}>
                      Planning preview — the text flowed into each layout (no illustration yet). Tinted blocks = where art will go. Check the <b>fit</b> chip and click any page to enlarge and confirm it reads well, <i>before</i> any render spend.
                    </div>
                    {routing && (
                      <div style={{ marginTop: 10, padding: "10px 12px", border: `1px solid ${C.field}`, borderRadius: 8, background: "rgba(157,187,214,0.10)" }}>
                        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
                          Review routing — who checks each page. <b>{routing.threshold}+ readable words → AI review.</b> This is a routing attribute, not an approval state.
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {[
                            ["ALL", `All ${routing.total}`],
                            ["AI_REVIEW", `HIGH TEXT · AI REVIEW ${routing.aiReview}`],
                            ["MANUAL_REVIEW", `MANUAL REVIEW ${routing.manualReview}`],
                          ].map(([key, label]) => (
                            <button
                              key={key}
                              onClick={() => setRouteFilter(key)}
                              style={{
                                padding: "5px 11px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
                                border: `1px solid ${routeFilter === key ? C.blue : C.line}`,
                                background: routeFilter === key ? C.blue : "transparent",
                                color: routeFilter === key ? "#fff" : C.ink,
                              }}
                            >
                              {label}
                            </button>
                          ))}
                          {routing.manualCheckRequired > 0 && (
                            <span style={{ fontSize: 11, color: C.orange }}>
                              {routing.manualCheckRequired} also need a manual check (structured layout)
                            </span>
                          )}
                          {routing.overridden > 0 && (
                            <span style={{ fontSize: 11, color: C.muted }}>{routing.overridden} operator override(s)</span>
                          )}
                        </div>
                      </div>
                    )}
                    <div style={S.grid}>
                      {pages
                        .filter((p) => routeFilter === "ALL" || p.reviewRoute === routeFilter)
                        .map((p) => <PagePreview key={p.pageKey} page={p} trim={trimSize(form.trim)} onZoom={setZoom} />)}
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
            {project && trackOf(form.productionProfileId) === "typeset" && (
              <div style={{ ...S.card, borderColor: C.orange }}>
                <div style={{ fontWeight: 700, color: C.orange }}>This step is not part of a typeset book</div>
                <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
                  A typeset book builds its own title page, copyright page and contents inside the
                  typeset pass, set in the same standard as the body — the contents page even needs
                  two passes, because where sections start depends on how long the contents itself is.
                  Building front matter here would create page rows that the typeset interior does not
                  use. Go straight to the typeset preview.
                </div>
                <button style={{ ...S.btn(), marginTop: 10 }} onClick={() => setStep("render")}>
                  Go to Step 7 · Render &amp; Review →
                </button>
              </div>
            )}
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
                      {(matter.omitted || []).length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <b>Omitted:</b>
                          <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: C.muted }}>
                            {matter.omitted.map((o) => (
                              <li key={o.page}><b style={{ color: C.ink }}>{FRONT_BACK_MATTER_LABELS[o.page] || o.page}</b> — {o.reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
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
            {/* THE INTERIOR, at the top of the one review surface. It used to
                live in Step 5 · Paginate, so the operator reviewed the cover
                and the Kindle edition here and had to go backwards a step to
                look at the actual book. */}
            {project && trackOf(form.productionProfileId) === "typeset" && (
              <TypesetPreview project={project} api={api} fileUrlBase={BACKEND} />
            )}
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
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        style={{ ...S.ghost, margin: 0, fontSize: 12 }}
                        title="Free. Shows the exact geometry, blueprint, prompt and cost that a paid generation would use."
                        onClick={() => loadCoverPreflight().catch(() => {})}
                      >
                        Preflight (free)
                      </button>
                      <button
                        style={{ ...S.btn("spend"), margin: 0, fontSize: 12, opacity: preflight?.blocked ? 0.45 : 1 }}
                        disabled={Boolean(preflight?.blocked)}
                        title={preflight?.blocked ? "Preflight failed — fix the errors before generating." : undefined}
                        onClick={() => genCover().catch(() => {})}
                      >
                        {cover ? "Regenerate cover" : "Generate cover"}
                      </button>
                      {cover && (
                        <button
                          style={{ ...S.btn("spend"), margin: 0, fontSize: 12 }}
                          title="Sends THIS artwork back with a mask over the spine only. Front and back are kept byte-for-byte; a full regenerate would replace them with a different cover."
                          onClick={() => { if (window.confirm("Fix the spine text only?\n\nThis costs one image call. Your front and back are kept exactly as they are — only the spine strip can change, and the current artwork is backed up first.")) repairSpine().catch(() => {}); }}
                        >
                          Fix spine text only
                        </button>
                      )}
                      <label
                        style={{ ...S.ghost, margin: 0, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                        title="Free. Put a finished wrap in as the next version — artwork fixed outside the platform, or a cover you made elsewhere. The previous version is kept."
                      >
                        Upload cover (free)
                        <input
                          type="file"
                          accept="image/png"
                          style={{ display: "none" }}
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadCover(f).catch(() => {}); }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* VERSION HISTORY — nothing is overwritten, so the previous
                      cover is always one click away. */}
                  {coverVersions?.versions?.length > 1 && (
                    <div style={{ ...S.card, marginTop: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>Cover versions</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Every generation and upload is kept. Switching back deletes nothing.</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                        {coverVersions.versions.slice().sort((a, b) => b.version - a.version).map((v) => {
                          const isCurrent = v.assetPath === coverVersions.currentAssetPath;
                          return (
                            <div key={v.version} style={{ width: 190, border: `2px solid ${isCurrent ? C.green : C.line}`, borderRadius: 6, padding: 6, background: isCurrent ? "rgba(0,140,60,0.06)" : "transparent" }}>
                              <a href={`${fileUrl(v.assetPath)}&v=${v.version}`} target="_blank" rel="noreferrer" style={{ display: "block", border: `1px solid ${C.line}`, borderRadius: 4, overflow: "hidden", background: "#000" }}>
                                <img alt={`Cover version ${v.version}`} src={`${fileUrl(v.assetPath)}&v=${v.version}`} style={{ width: "100%", display: "block" }} />
                              </a>
                              <div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 5 }}>
                                v{v.version} · {v.source}{isCurrent ? " · CURRENT" : ""}
                              </div>
                              <div style={{ fontSize: 10.5, color: C.muted }}>
                                {v.widthPx}×{v.heightPx}
                                {v.builtForPageCount ? ` · ${v.builtForPageCount}pp · spine ${v.spineIn?.toFixed(4)}in` : " · page count unknown"}
                              </div>
                              {v.note && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3, lineHeight: 1.35 }}>{v.note}</div>}
                              {!isCurrent && (
                                <button style={{ ...S.ghost, margin: "6px 0 0", fontSize: 11, width: "100%" }} onClick={() => selectCoverVersion(v.version).catch(() => {})}>
                                  Use this version
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>One continuous full-bleed image: back cover, spine, and front cover together{cover?.pageCount ? `; spine sized for ${cover.pageCount} interior pages` : ""}. It is a single file, so there is just one generate.</div>

                  {/* PREFLIGHT — everything that would be sent, before anything is spent. */}
                  {preflight && (
                    <div style={{ ...S.card, marginTop: 10, borderColor: preflight.blocked ? C.red : preflight.status === "WARNING" ? C.orange : C.line }}>
                      <div style={{ fontWeight: 800, color: preflight.blocked ? C.red : preflight.status === "WARNING" ? C.orange : C.ink }}>
                        Preflight: {preflight.status}{preflight.blocked ? " — GENERATION BLOCKED" : ""}
                      </div>

                      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8, fontSize: 12 }}>
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: 3 }}>Geometry</div>
                          <div style={{ color: C.muted, lineHeight: 1.7 }}>
                            {preflight.geometry.pageCount} pages · {preflight.geometry.paperStock} paper<br />
                            spine <b>{preflight.geometry.spineIn.toFixed(4)}in</b><br />
                            wrap <b>{preflight.geometry.fullWidthIn.toFixed(3)} × {preflight.geometry.fullHeightIn.toFixed(3)}in</b><br />
                            print {preflight.geometry.printCanvas.widthPx}×{preflight.geometry.printCanvas.heightPx} @ {preflight.geometry.printCanvas.dpi}dpi<br />
                            model {preflight.geometry.modelCanvas.widthPx}×{preflight.geometry.modelCanvas.heightPx}<br />
                            crop keeps <b>{preflight.geometry.crop.survivingWidthPct.toFixed(1)}%</b> of width
                          </div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: 3 }}>Model &amp; cost</div>
                          <div style={{ color: C.muted, lineHeight: 1.7 }}>
                            {preflight.model.model} · quality {preflight.model.quality}<br />
                            blueprint attached: <b>{preflight.model.usesBlueprint ? "yes" : "no"}</b><br />
                            spine text: <b>{preflight.spineTextAllowed ? "yes" : "no (under 79pp)"}</b><br />
                            colour: <b>{preflight.artDirection.fullColour ? "FULL COLOUR" : "monochrome"}</b><br />
                            DNA: {preflight.artDirection.styleDnaId}<br />
                            est. <b>${preflight.cost.estimatedUsd.toFixed(2)}</b> for one image
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: 11, color: C.muted, marginTop: 6, fontStyle: "italic" }}>{preflight.cost.basis}</div>

                      <div style={{ marginTop: 10 }}>
                        {preflight.checks.map((c) => (
                          <div key={c.key} style={{ display: "flex", gap: 8, fontSize: 12, padding: "3px 0", alignItems: "baseline" }}>
                            <span style={{ ...S.pill(c.status === "ERROR" ? C.red : c.status === "WARNING" ? C.orange : C.green), fontSize: 9.5, padding: "1px 6px", minWidth: 58, textAlign: "center" }}>{c.status}</span>
                            <span><b>{c.label}</b> — <span style={{ color: C.muted }}>{c.detail}</span></span>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Layout blueprint — the reference image the model receives</div>
                          <a href={blueprintUrl(project.id, preflight._cb)} target="_blank" rel="noreferrer" title="Open full size" style={{ display: "block", width: 420, border: `1px solid ${C.line}`, borderRadius: 6, overflow: "hidden", cursor: "zoom-in" }}>
                            <img alt="Cover layout blueprint" src={blueprintUrl(project.id, preflight._cb)} style={{ width: "100%", display: "block" }} />
                          </a>
                          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4, maxWidth: 420 }}>
                            Production guide only — none of it is printed. Red boxes are where text goes; the dimmed band is cropped off.
                          </div>
                        </div>
                      </div>

                      <button style={{ ...S.ghost, marginTop: 12, fontSize: 12 }} onClick={() => setShowPrompt((v) => !v)}>
                        {showPrompt ? "Hide" : "Show"} the exact prompt ({preflight.prompt.length.toLocaleString()} chars)
                      </button>
                      {showPrompt && (
                        <pre style={{ marginTop: 8, maxHeight: 420, overflow: "auto", background: "#0d1117", color: "#d7dde5", padding: 12, borderRadius: 6, fontSize: 11.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{preflight.prompt}</pre>
                      )}
                    </div>
                  )}
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
                            <a href={`${BACKEND}/api/projects/${project.id}/cover/paperback-preview?k=${encodeURIComponent(sessionStorage.getItem("wl_pw") || "")}&v=${cover._cb || 0}`} target="_blank" rel="noreferrer" title="Open full-size — paperback wrap with bleed/trim/safe/spine/barcode guides" style={{ display: "block", width: 460, aspectRatio: cover?.dimensions ? `${cover.dimensions.fullWidthIn} / ${cover.dimensions.fullHeightIn}` : "14.9 / 10.25", overflow: "hidden", border: `1px solid ${C.line}`, borderRadius: 6, background: "#fff", cursor: "zoom-in" }}>
                              <img alt="Paperback wrap with KDP guidelines" src={`${BACKEND}/api/projects/${project.id}/cover/paperback-preview?k=${encodeURIComponent(sessionStorage.getItem("wl_pw") || "")}&v=${cover._cb || 0}`} decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                            </a>
                            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4, maxWidth: 460 }}>Paperback wrap {cover?.dimensions ? `(${cover.dimensions.fullWidthIn.toFixed(3)} × ${cover.dimensions.fullHeightIn.toFixed(3)}in, spine ${cover.dimensions.spineIn.toFixed(4)}in from ${cover.pageCount} pages)` : "(from the live page count)"}. Dotted guides: <b style={{ color: "#c0218a" }}>magenta=bleed</b> · <b style={{ color: "#0098a6" }}>teal=trim</b> · <b style={{ color: "#2f8a3f" }}>green=safe</b> · <b style={{ color: "#e08a2e" }}>orange=spine</b> · <b style={{ color: "#d7263d" }}>red=barcode</b>. (Hardcover is a separate, larger wrap.)</div>
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
                          <div style={{ marginTop: 4, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={S.pill(statusColor(m.status))}>{m.status}</span>
                            <span style={{ fontSize: 10, color: C.muted }}>{m.section}</span>
                          </div>
                          {isDeterministicPage(m.pageKey) && (
                            <div title="This page is generated deterministically (typeset, not AI-rendered) and requires no manual approval." style={{ fontSize: 10, color: C.muted, marginTop: 3, fontStyle: "italic" }}>
                              auto-approved — typeset, not AI-rendered
                            </div>
                          )}
                          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                            <button style={{ ...S.ghost, margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => previewPage(m.pageId, m.imagePath).catch(() => {})}>Preview</button>
                            <button style={{ ...S.ghost, margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => reviewPromptPage(m.pageId).catch(() => {})} title="No-spend pre-flight check: does the subject match the entry, is the body text intact — before you commit to a paid render">Review prompt</button>
                            <button style={{ ...S.btn("spend"), margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => renderPage(m.pageId).catch(() => {})}>Render</button>
                            <label style={{ ...S.ghost, margin: 0, fontSize: 11, padding: "4px 8px", cursor: "pointer" }} title="Register your own PNG as this page's render — no OpenAI spend. Use when generation is blocked or you hand-corrected an image.">
                              Upload image
                              <input type="file" accept="image/png" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadManualRender(m.pageId, f).catch(() => {}); }} />
                            </label>
                            {m.status === "RENDERED" && m.renderId && <button style={{ ...S.ghost, margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => aiReviewRender(m.renderId).catch(() => {})} title="Cheap AI text-check — compares the baked text against the source before you approve">AI review text</button>}
                            {m.status === "RENDERED" && m.renderId && <button style={{ ...S.btn("ok"), margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => approveForBook(m.renderId).catch(() => {})}>Approve for book</button>}
                            {m.status === "RENDERED" && m.renderId && <button style={{ ...S.ghost, margin: 0, fontSize: 11, padding: "4px 8px" }} onClick={() => rejectRender(m.renderId).catch(() => {})}>Reject</button>}
                            {m.approvedForBook && <span style={{ ...S.pill(C.green), alignSelf: "center" }}>✓ approved</span>}
                            {m.approvedForBook && (m.printReady
                              ? <span style={{ ...S.pill(C.green), alignSelf: "center" }}>✓ print-ready</span>
                              : <span style={{ ...S.pill("#b8860b"), alignSelf: "center" }} title="Approved but not yet print-prepped — run print-prep before Build Book">⚠ needs print-prep</span>)}
                          </div>
                          {promptReviewResults[m.pageId] && (
                            <div style={{ marginTop: 5, padding: 6, borderRadius: 5, fontSize: 11, background: promptReviewResults[m.pageId].pass ? "#e8f3e6" : "#fbeaea", color: promptReviewResults[m.pageId].pass ? "#2f6b2f" : "#a33", position: "relative" }}>
                              <button onClick={() => setPromptReviewResults((prev) => { const n = { ...prev }; delete n[m.pageId]; return n; })} title="Dismiss" style={{ position: "absolute", top: 4, right: 6, border: "none", background: "none", cursor: "pointer", fontSize: 12, color: "inherit", opacity: 0.6, padding: 0 }}>✕</button>
                              <div style={{ paddingRight: 16 }}>
                                {promptReviewResults[m.pageId].pass
                                  ? "✓ Prompt review: subject + text look correct (no spend yet)."
                                  : <>⚠ Prompt review found issues (before any spend):<ul style={{ margin: "4px 0 0 16px", padding: 0 }}>{promptReviewResults[m.pageId].issues.map((iss, i) => <li key={i}>{iss}</li>)}</ul><div style={{ marginTop: 4, fontStyle: "italic", opacity: 0.85 }}>Advisory only — this does not block Render. The reviewer can be wrong (e.g. flagging a deliberate stylistic contrast as a mismatch); use your judgment, then dismiss (✕) or Render anyway.</div></>}
                              </div>
                            </div>
                          )}
                          {m.renderId && reviewResults[m.renderId] && (
                            <div style={{ marginTop: 5, padding: 6, borderRadius: 5, fontSize: 11, background: reviewResults[m.renderId].pass ? "#e8f3e6" : "#fbeaea", color: reviewResults[m.renderId].pass ? "#2f6b2f" : "#a33", position: "relative" }}>
                              <button onClick={() => setReviewResults((prev) => { const n = { ...prev }; delete n[m.renderId]; return n; })} title="Dismiss" style={{ position: "absolute", top: 4, right: 6, border: "none", background: "none", cursor: "pointer", fontSize: 12, color: "inherit", opacity: 0.6, padding: 0 }}>✕</button>
                              <div style={{ paddingRight: 16 }}>
                                {reviewResults[m.renderId].pass
                                  ? "✓ AI review: text matches source."
                                  : <>⚠ AI review found issues:<ul style={{ margin: "4px 0 0 16px", padding: 0 }}>{reviewResults[m.renderId].issues.map((iss, i) => <li key={i}>{iss}</li>)}</ul><div style={{ marginTop: 4, fontStyle: "italic", opacity: 0.85 }}>Advisory only — this does not block Approve. Look at the actual page yourself before deciding; then dismiss (✕) or Approve anyway.</div></>}
                              </div>
                            </div>
                          )}
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
          <Panel
            title="Build Book"
            sub={trackOf(form.productionProfileId) === "typeset"
              ? "Take the finished typeset interior exactly as the typesetter produced it — live text, embedded fonts, stamped artwork, nothing re-encoded — and produce the full-wrap cover PDF with the spine sized to its page count. Blocks on overflow, on artwork that could not be placed, or on a cover built for a different page count."
              : "Merge every book-ready (approved + print-prepped) page into the interior PDF in spine order, and produce the full-wrap cover PDF (spine sized to the final page count). Blocks if anything is missing or fails preflight."}
          >
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
                            <div style={{ color: C.red, fontWeight: 600, marginTop: assembly.coverStale ? 12 : 0 }}>
                              {assembly.track === "typeset"
                                ? "The typeset interior isn't clean yet. Fix these in Step 7 · Render & Review (the typeset preview card), then build again:"
                                : "Some pages aren't book-ready yet. Go back to step 7 and render + approve these, then assemble again:"}
                            </div>
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
            {project && (
              <div style={S.card}>
                <b>Delivery check</b>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                  Opens the finished PDFs and reports what is actually inside them — page size, trim
                  declaration, embedded fonts, and whether the cover wrap matches this interior's page
                  count and paper. Read-only. Free. Run it before uploading to KDP.
                </div>
                <button style={{ ...S.btn(), marginTop: 10 }} onClick={() => runDeliveryCheck().catch(() => {})}>
                  Check the finished files
                </button>
                {delivery && (
                  <div style={{ marginTop: 12 }}>
                    <span style={S.pill(delivery.status === "FAIL" ? C.red : delivery.status === "WARNING" ? C.orange : C.green)}>
                      {delivery.status}
                    </span>
                    <table style={{ width: "100%", marginTop: 10, borderCollapse: "collapse", fontSize: 13 }}>
                      <tbody>
                        {(delivery.checks || []).map((c) => (
                          <tr key={c.name} style={{ borderTop: `1px solid ${C.line}` }}>
                            <td style={{ padding: "6px 8px 6px 0", whiteSpace: "nowrap", verticalAlign: "top", fontWeight: 600 }}>{c.label}</td>
                            <td style={{ padding: "6px 8px 6px 0", whiteSpace: "nowrap", verticalAlign: "top", color: c.status === "FAIL" ? C.red : c.status === "WARNING" ? C.orange : C.green }}>{c.status}</td>
                            <td style={{ padding: "6px 0", verticalAlign: "top", color: C.muted }}>{c.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {delivery.interiorPath && (
                        <a style={{ ...S.btn("ok"), textDecoration: "none", display: "inline-block" }} href={fileUrl(delivery.interiorPath)} target="_blank" rel="noreferrer">Download interior PDF</a>
                      )}
                      {delivery.coverPath && (
                        <a style={{ ...S.btn("ok"), textDecoration: "none", display: "inline-block" }} href={fileUrl(delivery.coverPath)} target="_blank" rel="noreferrer">Download cover PDF</a>
                      )}
                    </div>
                    {delivery.interior && (
                      <div style={{ marginTop: 10, color: C.muted, fontSize: 12.5 }}>
                        Fonts found: {(delivery.interior.fonts || []).map((f) => `${f.baseFont} (${f.subtype}${f.embedded ? ", embedded" : ", NOT embedded"})`).join(" · ") || "none"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Panel>
        )}
        {zoom && <ZoomModal page={zoom} trim={trimSize(form.trim)} onClose={() => setZoom(null)} onSetRoute={setReviewRoute} />}
        {isMobile && (
          <div className="wl-mobile-step-dock" aria-label="Mobile workflow navigation" style={{ position: "fixed", left: 10, right: 10, bottom: "calc(10px + env(safe-area-inset-bottom, 0px))", zIndex: 500, display: "flex", alignItems: "center", gap: 8, padding: 8, borderRadius: 12, border: `1px solid ${C.line}`, background: "rgba(251,247,234,0.98)", boxShadow: "0 8px 26px rgba(46,36,23,0.18)" }}>
            <button type="button" disabled={activeStepIndex <= 0} onClick={() => goRelativeStep(-1)} style={{ ...S.ghost, margin: 0, padding: "8px 10px", opacity: activeStepIndex <= 0 ? 0.45 : 1 }}>Back</button>
            <select aria-label="Current workflow step" value={step} onChange={(e) => jumpToStep(e.target.value)} style={{ ...S.input, marginTop: 0, flex: 1, minWidth: 0, fontSize: 13 }}>
              {STEPS.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
            </select>
            <button type="button" disabled={activeStepIndex >= STEPS.length - 1} onClick={() => goRelativeStep(1)} style={{ ...S.ghost, margin: 0, padding: "8px 10px", opacity: activeStepIndex >= STEPS.length - 1 ? 0.45 : 1 }}>Next</button>
          </div>
        )}
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

/**
 * Review-routing badge. BLUE only — routing is not an approval verdict, so it
 * must never borrow green/yellow/red. AI-review pages get the solid blue fill
 * so the operator can scan the strip and see at a glance which pages are
 * theirs; manual pages get a quiet outline.
 */
function RouteBadge({ page, compact }) {
  if (!page.reviewRoute) return null;
  const ai = page.reviewRoute === "AI_REVIEW";
  const words = page.readableWords;
  const base = {
    display: "inline-block", fontSize: compact ? 9 : 11, fontWeight: 700, letterSpacing: 0.3,
    padding: compact ? "1px 5px" : "2px 8px", borderRadius: 4, whiteSpace: "nowrap",
  };
  const style = ai
    ? { ...base, background: C.blue, color: "#fff" }
    : { ...base, background: "transparent", color: C.blue, border: `1px solid ${C.field}` };
  const text = ai ? (compact ? "AI" : "HIGH TEXT · AI REVIEW") : (compact ? "MANUAL" : "MANUAL REVIEW");
  return (
    <span title={page.reviewRouteReason || ""}>
      <span style={style}>{text}</span>
      {page.manualCheckRequired && (
        <span style={{ ...base, background: "transparent", color: C.orange, border: `1px solid ${C.orange}`, marginLeft: 4 }}>
          {compact ? "+CHK" : "+ MANUAL CHECK"}
        </span>
      )}
      {page.reviewRouteOverridden && (
        <span style={{ fontSize: 9, color: C.muted, marginLeft: 4 }}>override</span>
      )}
      {words != null && !compact && (
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 6 }}>{words} readable words</span>
      )}
    </span>
  );
}

function PagePreview({ page, trim, onZoom }) {
  const W = 168;
  const p = { ...page, __w: trim.widthIn, __h: trim.heightIn };
  const fm = fitMeta(page.fitStatus);
  const ai = page.reviewRoute === "AI_REVIEW";
  return (
    <div style={{ width: W }}>
      <div
        onClick={() => onZoom(page)}
        title="Click to enlarge"
        style={{ cursor: "zoom-in", outline: ai ? `2px solid ${C.blue}` : "none", outlineOffset: 2, borderRadius: 2 }}
      >
        <PageLayout page={p} width={W} />
      </div>
      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, wordBreak: "break-all" }}>{page.pageKey}</div>
      <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={S.pill(fm.bg)}>{page.fitStatus}</span>
        <RouteBadge page={page} compact />
        {page.readableWords != null && <span style={{ fontSize: 10, color: C.muted }}>{page.readableWords}w</span>}
      </div>
      <div style={{ marginTop: 2, fontSize: 10, color: C.muted }}>{page.entryTitle || page.layoutTemplate}</div>
    </div>
  );
}

function ZoomModal({ page, trim, onClose, onSetRoute }) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const W = isMobile ? 300 : 460;
  const fm = fitMeta(page.fitStatus);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,16,8,0.55)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", zIndex: 9000, padding: isMobile ? 10 : 24, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, borderRadius: 12, padding: isMobile ? 12 : 20, width: isMobile ? "100%" : undefined, maxHeight: isMobile ? "none" : "92vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <div><b>{page.pageKey}</b> · {page.layoutTemplate} · <span style={S.pill(fm.bg)}>{fm.text}</span></div>
          <button style={S.ghost} onClick={onClose}>Close ✕</button>
        </div>
        {page.reviewRoute && (
          <div style={{ marginBottom: 10, padding: "8px 10px", border: `1px solid ${C.field}`, borderRadius: 6 }}>
            <RouteBadge page={page} />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{page.reviewRouteReason}</div>
            {onSetRoute && (
              <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: C.muted }}>Override route:</span>
                <button style={{ ...S.ghost, marginTop: 0 }} onClick={() => onSetRoute(page.pageKey, "AI_REVIEW")}>AI review</button>
                <button style={{ ...S.ghost, marginTop: 0 }} onClick={() => onSetRoute(page.pageKey, "MANUAL_REVIEW")}>Manual</button>
                <button style={{ ...S.ghost, marginTop: 0 }} onClick={() => onSetRoute(page.pageKey, null)}>Clear</button>
              </div>
            )}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 18, alignItems: "flex-start" }}>
          <PageLayout page={{ ...page, __w: trim.widthIn, __h: trim.heightIn }} width={W} />
          <div style={{ fontSize: 13, minWidth: isMobile ? 0 : 200, width: isMobile ? "100%" : undefined }}>
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

/**
 * Enlarge one typeset page. Mirrors ZoomModal (the illustration reviewer's
 * lightbox) so both review surfaces behave identically: click the backdrop to
 * dismiss, header carries the identity, body scrolls if the page is tall.
 *
 * Re-renders from the PDF at a high scale rather than upscaling the thumbnail
 * bitmap — the whole point of opening a page is to read the type.
 */
/**
 * LOCAL LAYOUT OVERRIDES — the operator's escape hatch for ONE block.
 *
 * The rule this UI exists to keep honest:
 *
 *     systemic defect -> fix the layout standard (a developer, a version bump)
 *     isolated defect -> local override (right here, no developer)
 *     manuscript      -> frozen, always
 *
 * Two things are deliberately impossible from this panel. There is no free-text
 * style field — every control below maps to one bounded property the backend
 * schema already validates, so an override can never grow into a second,
 * unversioned layout system. And there is no way to edit the words: an override
 * changes how a block is SET, never what it says.
 *
 * Nothing here is keyed to a page number. The page is only how you FIND the
 * block; what gets stored is the block's own content-derived id, so an override
 * survives repagination. This book's page count moved four times during QA.
 */
const KEEP_CHOICES = [
  ["", "Standard"],
  ["yes", "Yes"],
  ["no", "No"],
];
const BREAK_CHOICES = [
  ["", "Standard"],
  ["auto", "Auto"],
  ["page", "Force new page"],
  ["avoid", "Avoid"],
];
const VARIANT_CHOICES = [
  ["", "Standard"],
  ["compact", "Compact"],
  ["roomy", "Roomy"],
  // For a chapter/section closing unit left nearly alone on a page: drops it
  // clear of the top margin and centres it on a narrowed measure, so the page
  // reads as decided rather than leftover. Moves nothing outside the block.
  ["closing-beat", "Closing beat (standalone)"],
];

/** Human label for a block kind — the operator should not have to read CSS. */
const KIND_LABEL = {
  opener: "Chapter opener",
  p: "Paragraph",
  h3: "Section heading",
  h4: "Sub-heading",
  ul: "Bulleted list",
  ol: "Numbered list",
  callout: "Callout",
  "alert-panel": "Alert panel",
  takeaway: "Chapter takeaway",
  "tail-unit": "Closing unit",
  "scene-break": "Scene break",
};

/** One-line plain-English summary of what an override actually changes. */
function describeOverride(o) {
  const parts = [];
  if (o.variant) parts.push(`${o.variant} variant`);
  if (o.spaceBeforeEm !== undefined) parts.push(`space before ${o.spaceBeforeEm}em`);
  if (o.spaceAfterEm !== undefined) parts.push(`space after ${o.spaceAfterEm}em`);
  if (o.keepWithNext !== undefined) parts.push(o.keepWithNext ? "keep with next" : "may break after");
  if (o.keepTogether !== undefined) parts.push(o.keepTogether ? "keep together" : "may split");
  if (o.breakBefore) parts.push(`break before: ${o.breakBefore}`);
  if (o.breakAfter) parts.push(`break after: ${o.breakAfter}`);
  return parts.length ? parts.join(" · ") : "no change";
}

function BlockOverrideEditor({ block, current, onSave, onReset }) {
  const [form, setForm] = useState(() => ({
    spaceBeforeEm: current?.spaceBeforeEm ?? "",
    spaceAfterEm: current?.spaceAfterEm ?? "",
    keepWithNext: current?.keepWithNext === undefined ? "" : current.keepWithNext ? "yes" : "no",
    keepTogether: current?.keepTogether === undefined ? "" : current.keepTogether ? "yes" : "no",
    breakBefore: current?.breakBefore ?? "",
    breakAfter: current?.breakAfter ?? "",
    variant: current?.variant ?? "",
    note: current?.note ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // "" means "leave it to the standard", so it is omitted rather than sent as a
  // value. That is what makes Reset and per-property Standard mean the same
  // thing: the standard decides unless this book says otherwise.
  const build = () => {
    const o = {};
    if (form.spaceBeforeEm !== "") o.spaceBeforeEm = Number(form.spaceBeforeEm);
    if (form.spaceAfterEm !== "") o.spaceAfterEm = Number(form.spaceAfterEm);
    if (form.keepWithNext !== "") o.keepWithNext = form.keepWithNext === "yes";
    if (form.keepTogether !== "") o.keepTogether = form.keepTogether === "yes";
    if (form.breakBefore !== "") o.breakBefore = form.breakBefore;
    if (form.breakAfter !== "") o.breakAfter = form.breakAfter;
    if (form.variant !== "") o.variant = form.variant;
    if (form.note.trim() !== "") o.note = form.note.trim();
    return o;
  };

  const field = (label, node) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: C.muted }}>
      {label}
      {node}
    </label>
  );
  const sel = (k, choices) => (
    <select value={form[k]} onChange={set(k)} style={{ ...S.input, padding: "5px 7px", fontSize: 12 }}>
      {choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const num = (k) => (
    <input
      type="number" step="0.1" min="-2" max="6" value={form[k]} onChange={set(k)} placeholder="standard"
      style={{ ...S.input, padding: "5px 7px", fontSize: 12 }}
    />
  );

  return (
    <div style={{ marginTop: 8, padding: 10, background: "#f7f2e6", border: `1px solid ${C.line}`, borderRadius: 6 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
        {field("Space before (em)", num("spaceBeforeEm"))}
        {field("Space after (em)", num("spaceAfterEm"))}
        {field("Keep with next", sel("keepWithNext", KEEP_CHOICES))}
        {field("Keep together", sel("keepTogether", KEEP_CHOICES))}
        {field("Break before", sel("breakBefore", BREAK_CHOICES))}
        {field("Break after", sel("breakAfter", BREAK_CHOICES))}
        {field("Variant", sel("variant", VARIANT_CHOICES))}
      </div>
      <div style={{ marginTop: 8 }}>
        {field(
          "Why (for whoever regenerates this book next)",
          <input
            type="text" maxLength={300} value={form.note} onChange={set("note")}
            placeholder="e.g. thin chapter ending, pulled up to sit with the chapter"
            style={{ ...S.input, padding: "5px 7px", fontSize: 12 }}
          />,
        )}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          style={{ ...S.btn(), margin: 0, padding: "6px 12px", fontSize: 12.5 }}
          disabled={saving}
          onClick={async () => { setSaving(true); try { await onSave(block.blockId, build()); } finally { setSaving(false); } }}
        >
          {saving ? "Saving…" : "Save override"}
        </button>
        {current && (
          <button
            style={{ ...S.ghost, margin: 0, padding: "6px 12px", fontSize: 12.5 }}
            disabled={saving}
            onClick={async () => { setSaving(true); try { await onReset(block.blockId); } finally { setSaving(false); } }}
          >
            ↺ Reset to standard
          </button>
        )}
        <span style={{ fontSize: 11, color: C.muted }}>
          Rebuild the preview to see the change.
        </span>
      </div>
    </div>
  );
}

/** The blocks that landed on one page, each openable into the editor. */
function PageBlockList({ blocks, overrides, onSave, onReset }) {
  const [open, setOpen] = useState(null);
  if (!blocks.length) {
    return <div style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>No addressable blocks on this page.</div>;
  }
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
        Blocks on this page
        <span style={{ fontWeight: 400, color: C.muted }}> — customise one without touching the standard or the text</span>
      </div>
      {blocks.map((b) => {
        const current = overrides[b.blockId];
        return (
          <div key={b.blockId} style={{ borderTop: `1px solid ${C.line}`, padding: "8px 0" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>{KIND_LABEL[b.kind] || b.kind}</span>
              {current && <span style={{ ...S.pill(C.orange), fontSize: 10 }}>customised</span>}
              <code style={{ fontSize: 10, color: C.muted }}>{b.blockId}</code>
              <button
                style={{ ...S.ghost, margin: 0, padding: "2px 8px", fontSize: 11.5, marginLeft: "auto" }}
                onClick={() => setOpen(open === b.blockId ? null : b.blockId)}
              >
                {open === b.blockId ? "Close" : current ? "Edit" : "Customise"}
              </button>
            </div>
            <div style={{ fontSize: 12, color: C.ink, marginTop: 3, opacity: 0.85 }}>
              {b.preview || <i style={{ color: C.muted }}>(no text)</i>}
            </div>
            {current && (
              <div style={{ fontSize: 11.5, color: C.orange, marginTop: 3 }}>
                {describeOverride(current)}
                {current.note ? <span style={{ color: C.muted }}> — {current.note}</span> : null}
              </div>
            )}
            {open === b.blockId && (
              <BlockOverrideEditor block={b} current={current} onSave={onSave} onReset={onReset} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TypesetPageModal({ docRef, page, onClose, blocks = [], overrides = {}, onSave, onReset }) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const canvasRef = useRef(null);
  const W = isMobile ? 320 : 620;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;
      const pg = await doc.getPage(page.n);
      if (cancelled) return;
      const base = pg.getViewport({ scale: 1 });
      const viewport = pg.getViewport({ scale: (W / base.width) * 2 }); // 2x for crisp type
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${W}px`;
      await pg.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    })();
    return () => { cancelled = true; };
  }, [docRef, page.n, W]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,16,8,0.55)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", zIndex: 9000, padding: isMobile ? 10 : 24, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, borderRadius: 12, padding: isMobile ? 12 : 20, maxHeight: isMobile ? "none" : "92vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <b>page {page.n}</b>
            {page.section ? <span style={{ color: C.muted }}> · {page.section}</span> : null}
            {page.flag ? <span style={{ ...S.pill(page.flag === "overflow" ? C.red : C.muted), marginLeft: 8 }}>{page.flag}</span> : null}
          </div>
          <button style={S.ghost} onClick={onClose}>Close ✕</button>
        </div>
        <canvas ref={canvasRef} style={{ display: "block", border: `1px solid ${C.line}`, background: "#fff" }} />
        {onSave && (
          <PageBlockList blocks={blocks} overrides={overrides} onSave={onSave} onReset={onReset} />
        )}
      </div>
    </div>
  );
}

/**
 * Renders PDF pages to canvas so the operator actually sees the book.
 *
 * The first version embedded the PDF in an <iframe> and relied on the browser's
 * built-in PDF plugin. That plugin rendered a blank black box, so the preview
 * showed nothing at all. Drawing the pages ourselves with pdf.js removes that
 * dependency entirely.
 *
 * ─── WHY A GRID ───────────────────────────────────────────────────────────
 * The pages used to stack one-per-row inside a fixed-height box with its own
 * scrollbar, which made reviewing a 155-page book a slog: one page visible at a
 * time, nested scrolling, no way to compare spreads or spot an odd page without
 * hunting. This reuses the illustration reviewer's pattern instead — a thumbnail
 * grid, click to enlarge — so both review surfaces work the same way. The inner
 * scroller is gone; the whole book flows down the page.
 *
 * Pages still render in batches: a 155-page book is far too much to rasterise up
 * front.
 */
function PdfPages({ url, pageCount, report, blocks = [], overrides = {}, onSave, onReset }) {
  const hostRef = useRef(null);
  const docRef = useRef(null);
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [shown, setShown] = useState(24);
  const [total, setTotal] = useState(pageCount || 0);
  const [err, setErr] = useState("");
  const [cols, setCols] = useState(4);
  const [zoomPage, setZoomPage] = useState(null);

  /**
   * Page number -> the section that STARTS there, plus anything the report
   * already flagged. Keeps section context visible while scanning, and makes a
   * suspicious page identifiable without opening it.
   */
  const pageMeta = useMemo(() => {
    const m = new Map();
    for (const s of report?.sectionStarts ?? []) {
      if (s.page) m.set(s.page, { ...(m.get(s.page) || {}), section: s.label || s.title });
    }
    for (const p of report?.blankPages ?? []) m.set(p, { ...(m.get(p) || {}), flag: "blank" });
    for (const p of report?.verticalOverflowPages ?? []) m.set(p, { ...(m.get(p) || {}), flag: "overflow" });
    // A customised block must be VISIBLE from the grid. An override nobody can
    // see is a landmine for whoever regenerates the book next — they change the
    // standard, the page still misbehaves, and nothing explains why.
    for (const [n, ids] of Object.entries(report?.pageBlocks ?? {})) {
      const count = ids.filter((id) => overrides[id]).length;
      if (count) m.set(Number(n), { ...(m.get(Number(n)) || {}), overrides: count });
    }
    return m;
  }, [report, overrides]);

  /** blockId -> its ref, so a page's ids become nameable blocks. */
  const blockById = useMemo(() => {
    const m = new Map();
    for (const b of blocks) m.set(b.blockId, b);
    return m;
  }, [blocks]);

  const blocksOnPage = useCallback(
    (n) => (report?.pageBlocks?.[n] ?? []).map((id) => blockById.get(id)).filter(Boolean),
    [report, blockById],
  );

  const effCols = isMobile ? Math.min(cols, 2) : cols;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/build/pdf");
        // pdf.js REQUIRES a worker. Leaving workerSrc empty makes it fall back
        // to a "fake worker" that then fails with
        // `Cannot read properties of undefined (reading 'WorkerMessageHandler')`.
        // `pdf.worker.entry` is the webpack-bundled worker, so CRA emits it and
        // the URL is always correct.
        const workerMod = await import("pdfjs-dist/build/pdf.worker.entry");
        pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default ?? workerMod;
        const task = pdfjs.getDocument(url);
        const doc = await task.promise;
        if (cancelled) { doc.destroy?.(); return; }
        docRef.current = doc;
        setTotal(doc.numPages);
        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = "";

        // Thumbnails are cheap at 4-up and readable at 2-up; render each at the
        // size it is actually displayed rather than one size for both.
        const targetW = effCols >= 4 ? 190 : 380;

        for (let n = 1; n <= Math.min(shown, doc.numPages); n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (targetW / base.width) * 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.cssText = `width:100%;display:block;border:1px solid ${C.line};box-shadow:0 1px 4px rgba(0,0,0,.12);background:#fff;cursor:zoom-in;`;

          const meta = pageMeta.get(n) || {};
          const cell = document.createElement("div");
          const cap = document.createElement("div");
          cap.textContent = `page ${n}`;
          cap.style.cssText = `font-size:11px;font-weight:700;color:${C.ink};margin-bottom:4px;`;
          if (meta.flag) {
            const pill = document.createElement("span");
            pill.textContent = meta.flag;
            pill.style.cssText = `margin-left:6px;font-weight:400;font-size:10px;color:${meta.flag === "overflow" ? C.red : C.muted};`;
            cap.appendChild(pill);
          }
          if (meta.overrides) {
            const pill = document.createElement("span");
            pill.textContent = meta.overrides > 1 ? `✎ ${meta.overrides} customised` : "✎ customised";
            pill.style.cssText = `margin-left:6px;font-weight:700;font-size:10px;color:${C.orange};`;
            cap.appendChild(pill);
          }
          const ctx = document.createElement("div");
          ctx.textContent = meta.section || "";
          ctx.style.cssText = `font-size:10px;color:${C.muted};margin-top:4px;min-height:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;

          cell.appendChild(cap);
          cell.appendChild(canvas);
          cell.appendChild(ctx);
          // A section opener is the natural landmark when scanning; ringing it
          // makes chapter boundaries findable at a glance.
          if (meta.section) canvas.style.outline = `2px solid ${C.blue}`;
          canvas.addEventListener("click", () => setZoomPage({ n, section: meta.section, flag: meta.flag }));
          if (meta.overrides) canvas.style.outline = `2px solid ${C.orange}`;
          host.appendChild(cell);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        }
      } catch (e) {
        if (!cancelled) setErr(e.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
      const d = docRef.current;
      docRef.current = null;
      if (d) d.destroy?.();
    };
  }, [url, shown, effCols, pageMeta]);

  const densityBtn = (n, label) => (
    <button
      key={n}
      onClick={() => setCols(n)}
      style={{ ...S.ghost, margin: 0, padding: "4px 10px", fontSize: 12, background: cols === n ? C.blue : "transparent", color: cols === n ? "#fff" : C.ink, borderColor: cols === n ? C.blue : C.line }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ marginTop: 12 }}>
      {err && <div style={{ color: C.red, fontSize: 12.5 }}>⚠ Could not render pages: {err}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: C.muted }}>View</span>
        {densityBtn(4, "Overview · 4 across")}
        {densityBtn(2, "Review · 2 across")}
        <span style={{ fontSize: 11.5, color: C.muted, marginLeft: 4 }}>
          Click any page to enlarge and customise a block on it. Chapter openers are outlined blue; customised pages orange.
        </span>
      </div>

      {/* No inner scrollbar: the book flows down the page so the whole thing can
          be scanned in one continuous pass. */}
      <div
        ref={hostRef}
        style={{ display: "grid", gridTemplateColumns: `repeat(${effCols}, 1fr)`, gap: effCols >= 4 ? 14 : 20, background: "#efe9db", padding: 14, border: `1px solid ${C.line}`, borderRadius: 8, alignItems: "start" }}
      />

      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: C.muted }}>Showing {Math.min(shown, total)} of {total} pages</span>
        {shown < total && (
          <button style={{ ...S.ghost, margin: 0 }} onClick={() => setShown((s) => s + 24)}>Load 24 more pages</button>
        )}
        {shown < total && (
          <button style={{ ...S.ghost, margin: 0 }} onClick={() => setShown(total)}>Load all {total}</button>
        )}
      </div>

      {zoomPage && (
        <TypesetPageModal
          docRef={docRef}
          page={zoomPage}
          onClose={() => setZoomPage(null)}
          blocks={blocksOnPage(zoomPage.n)}
          overrides={overrides}
          onSave={onSave}
          onReset={onReset}
        />
      )}
    </div>
  );
}

/**
 * TYPESET PREVIEW — the real interior, in the console.
 *
 * For a text-first book the pages are deterministically typeset (Paged.js), not
 * AI-generated images, so the operator must be able to judge the actual book:
 * type size, measure, margins, chapter openers, page density, real page count.
 * Free — no model call, no spend.
 *
 * The PDF is shown in an <iframe> rather than rasterised to images on purpose:
 * the browser's own viewer gives page-by-page navigation, zoom, and true vector
 * type at real trim, which is exactly what is being judged.
 */
function TypesetPreview({ project, api, fileUrlBase }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [report, setReport] = useState(null);
  const [src, setSrc] = useState(null);
  // OFF by default. The body's first chapter always opens on a right-hand page
  // regardless; this forces EVERY chapter to, which cost this book ten blank
  // pages. The server defaults it off too, but the console used to send
  // recto=true on every request and quietly overrode that — so the pagination
  // policy looked like it had not been applied at all.
  const [recto, setRecto] = useState(false);
  // Trim + text-area guides. Preview-only and never persisted: there is no path
  // by which this can end up switched on in an exported interior.
  const [guides, setGuides] = useState(false);
  /** The addressable blocks of the last render, and this book's exceptions. */
  const [blocks, setBlocks] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [orphaned, setOrphaned] = useState([]);
  // Illustrations are stamped onto the finished PDF, so the pages below already
  // show them. These carry the metadata the operator judges them by.
  const [stampedArt, setStampedArt] = useState([]);
  const [orphanedArt, setOrphanedArt] = useState([]);
  const [artRecords, setArtRecords] = useState({});
  const [standardId, setStandardId] = useState("");

  // Revoke the previous object URL so repeated previews don't leak blobs.
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  // An override is stored against the block's content-derived id and lives in
  // the PROJECT config, so it travels with this book and can never leak into the
  // reusable layout standard.
  const saveOverride = useCallback(async (blockId, override) => {
    await api(`/api/projects/${project.id}/layout-overrides/${blockId}`, {
      method: "PUT",
      body: JSON.stringify(override),
    });
    setOverrides((o) => ({ ...o, [blockId]: override }));
  }, [api, project.id]);

  const resetOverride = useCallback(async (blockId) => {
    await api(`/api/projects/${project.id}/layout-overrides/${blockId}`, { method: "DELETE" });
    setOverrides((o) => { const next = { ...o }; delete next[blockId]; return next; });
  }, [api, project.id]);

  // Declared before the callbacks that await it, and memoised, so those
  // callbacks can list it as a dependency. CI builds treat a missing hook
  // dependency as a compile error, and a plain function here is a new value on
  // every render, which would defeat their memoisation anyway.
  const build = useCallback(async () => {
    setBusy(true); setErr(""); setReport(null);
    try {
      const q = `recto=${recto ? "true" : "false"}&guides=${guides ? "true" : "false"}`;
      const meta = await api(`/api/projects/${project.id}/typeset-preview?format=json&${q}`);
      setReport(meta.report);
      setBlocks(meta.blocks || []);
      setOverrides(meta.layoutOverrides || {});
      setOrphaned(meta.orphanedOverrides || []);
      setStampedArt(meta.stampedIllustrations || []);
      setOrphanedArt(meta.orphanedIllustrations || []);
      setArtRecords(meta.illustrations || {});
      setStandardId(meta.layoutStandardId || "");
      const pw = sessionStorage.getItem("wl_pw") || "";
      const res = await fetch(
        `${fileUrlBase}/api/projects/${project.id}/typeset-preview?${q}`,
        { headers: pw ? { Authorization: `Bearer ${pw}` } : {} },
      );
      if (!res.ok) throw new Error(`Preview failed (${res.status})`);
      const blob = await res.blob();
      setSrc((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [api, project.id, recto, guides, fileUrlBase]);

  /**
   * Replace the artwork on a page. The placement SIZE is kept, so a replacement
   * prints at the same size; the API refuses it if the new file cannot carry
   * 300 native ppi at that size, rather than resampling it into looking fine.
   */
  const replaceArt = useCallback(async (stamped, file) => {
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    await api(`/api/projects/${project.id}/illustrations/${stamped.blockId}`, {
      method: "PUT",
      body: JSON.stringify({
        pngBase64: btoa(binary),
        placementWidthIn: stamped.widthIn,
        placementHeightIn: stamped.heightIn,
        status: "approved",
      }),
    });
    await build();
  }, [api, project.id, build]);

  const removeArt = useCallback(async (blockId) => {
    await api(`/api/projects/${project.id}/illustrations/${blockId}`, { method: "DELETE" });
    await build();
  }, [api, project.id, build]);

  const r = report;
  return (
    <div style={{ ...S.card, borderColor: C.blue }}>
      <b>Typeset interior preview</b>
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
        The real printed interior: deterministic typesetting, live vector text, at true trim.
        Page breaks come from the typesetter itself, so this page count is the one the book will have. Free.
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button style={busy ? { ...S.btn(), background: C.muted } : S.btn()} disabled={busy} onClick={build}>
          {busy ? "Typesetting…" : src ? "Rebuild preview" : "Build typeset preview"}
        </button>
        <label style={{ fontSize: 12.5, color: C.ink, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={recto} onChange={(e) => setRecto(e.target.checked)} />
          Force EVERY chapter onto a right-hand page
          <span style={{ color: C.muted }}>
            (Chapter 1 always does. Turning this on adds a blank page before roughly half the
            chapters — ten of them in this book.)
          </span>
        </label>
        <label style={{ fontSize: 12.5, color: C.ink, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
          Show trim guides
          <span style={{ color: C.muted }}>
            (<span style={{ color: "#cc2222" }}>red = trim</span>, where the paper is cut ·{" "}
            <span style={{ color: C.blue }}>blue = text area</span>. Drawn for review only — they
            are never in the exported interior, and they cannot move a line.)
          </span>
        </label>
      </div>

      {busy && <div style={{ ...S.pill(C.orange), marginTop: 10 }}>⏳ Flowing the whole book — this takes a moment on a long manuscript.</div>}
      {err && <div style={{ ...S.card, borderColor: C.red, color: C.red }}>⚠ {err}</div>}

      {r && (
        <div style={{ ...S.grid, marginTop: 12 }}>
          <Stat label="Total pages" value={r.totalPages} />
          <Stat label="Trim" value={`${r.trim.widthIn} × ${r.trim.heightIn} in`} />
          <Stat label="Body type" value={`${r.bodyPt}pt / ${r.lineHeight}`} />
          <Stat label="Gutter" value={`${r.marginsIn.gutterIn} in`} />
          <Stat label="Blank pages" value={r.blankPages.length} />
          <Stat label="Overflowing" value={r.verticalOverflowPages.length} />
        </div>
      )}

      {r && r.verticalOverflowPages.length > 0 && (
        <div style={{ color: C.red, fontSize: 12.5, marginTop: 8 }}>
          ⚠ Text may be clipped on page(s): {r.verticalOverflowPages.join(", ")}
        </div>
      )}

      {(stampedArt.length > 0 || orphanedArt.length > 0) && (
        <div style={{ ...S.card, marginTop: 12, borderColor: C.blue }}>
          <b>Illustrations</b>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
            Stamped onto the finished PDF, never flowed into the text, so they cannot move a line.
            Each is anchored to a stable block id and its page is resolved on every build.
            Removing one restores the untouched typeset page.
          </div>
          {stampedArt.map((a) => {
            const rec = artRecords[a.blockId] || {};
            return (
              <div key={a.blockId} style={{ ...S.card, marginTop: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <b>Page {a.page}</b>
                  <span style={S.pill(rec.status === "approved" ? C.green : C.orange)}>
                    {rec.status || "draft"}
                  </span>
                  <span style={{ fontSize: 12.5, color: C.muted }}>anchor {a.blockId}</span>
                </div>
                <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.6 }}>
                  placement {a.widthIn.toFixed(2)} × {a.heightIn.toFixed(2)} in
                  {" · "}native {rec.nativeWidthPx}×{rec.nativeHeightPx}px
                  {" · "}<b>{Math.round(a.nativePpi)} native ppi</b>{" "}
                  <span style={{ color: a.nativePpi >= 300 ? C.green : C.red }}>
                    {a.nativePpi >= 300 ? "meets the 300 print gate" : "UNDER the 300 print gate"}
                  </span>
                  {rec.version ? ` · v${rec.version}` : ""}
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={{ ...S.ghost, display: "inline-block", cursor: "pointer" }}>
                    Replace…
                    <input
                      type="file"
                      accept="image/png"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files && e.target.files[0];
                        if (file) replaceArt(a, file).catch(() => {});
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    style={S.ghost}
                    onClick={() => {
                      if (window.confirm(`Remove the illustration on page ${a.page}? The typeset page underneath is restored exactly.`)) {
                        removeArt(a.blockId).catch(() => {});
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          {orphanedArt.length > 0 && (
            <div style={{ ...S.card, marginTop: 10, borderColor: C.red, color: C.red, fontSize: 12.5 }}>
              ⚠ Not stamped, and NOT silently dropped:
              <ul style={{ margin: "6px 0 0 18px" }}>
                {orphanedArt.map((o) => (
                  <li key={o.blockId}>
                    {o.blockId} — {o.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {src && (
        <>
          {/* Pages are rendered to canvas with pdf.js rather than embedded in an
              <iframe>. An iframe hands the PDF to the browser's plugin, which
              may not render at all (it showed a blank black box), so the
              operator could not see their own book. Drawing the pages ourselves
              makes them appear reliably, in the console, like a book. */}
          <PdfPages
            url={src}
            pageCount={r ? r.totalPages : 0}
            report={r}
            blocks={blocks}
            overrides={overrides}
            onSave={saveOverride}
            onReset={resetOverride}
          />
          <div style={{ marginTop: 8 }}>
            <a href={src} download={`${(project.title || "book").replace(/[^\w-]+/g, "-").toLowerCase()}-typeset.pdf`} style={{ ...S.ghost, display: "inline-block", textDecoration: "none" }}>
              ⭳ Download this proof
            </a>
          </div>
        </>
      )}

      {/* Every exception in one place. A book must never be able to accumulate
          invisible local hacks: the next person to regenerate it needs to see
          what was customised and why, or they will change the standard trying to
          fix a page that is already deliberately different. */}
      {r && (Object.keys(overrides).length > 0 || orphaned.length > 0) && (
        <div style={{ ...S.card, marginTop: 12, borderColor: C.orange }}>
          <b style={{ fontSize: 13 }}>Local layout overrides ({Object.keys(overrides).length})</b>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>
            Per-block exceptions to <code>{standardId || "the layout standard"}</code>, stored with this book.
            Keyed to block content, not page number, so they survive repagination.
            A problem that recurs is systemic and belongs in the standard instead.
          </div>
          {Object.entries(overrides).map(([id, o]) => {
            const b = blocks.find((x) => x.blockId === id);
            return (
              <div key={id} style={{ borderTop: `1px solid ${C.line}`, padding: "7px 0", fontSize: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, color: C.blue }}>{b ? KIND_LABEL[b.kind] || b.kind : "Unknown block"}</span>
                  <code style={{ fontSize: 10, color: C.muted }}>{id}</code>
                  {b && <span style={{ fontSize: 11, color: C.muted }}>{b.sectionTitle}</span>}
                  <button
                    style={{ ...S.ghost, margin: 0, padding: "2px 8px", fontSize: 11.5, marginLeft: "auto" }}
                    onClick={() => resetOverride(id)}
                  >
                    ↺ Reset to standard
                  </button>
                </div>
                <div style={{ color: C.orange, fontSize: 11.5, marginTop: 2 }}>{describeOverride(o)}</div>
                {o.note && <div style={{ color: C.muted, fontSize: 11.5 }}>{o.note}</div>}
                {b && <div style={{ opacity: 0.8, marginTop: 2 }}>{b.preview}</div>}
              </div>
            );
          })}
          {orphaned.length > 0 && (
            <div style={{ marginTop: 8, color: C.red, fontSize: 12 }}>
              ⚠ {orphaned.length} override(s) point at content that is no longer in the book: {orphaned.join(", ")}.
              They are doing nothing. Reset them, or check whether the manuscript changed.
            </div>
          )}
        </div>
      )}

      {r && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.blue }}>
            Section start pages ({r.sectionStarts.length})
          </summary>
          <div style={{ marginTop: 8, fontSize: 12.5, columns: 2, columnGap: 24 }}>
            {r.sectionStarts.map((s, i) => (
              <div key={i} style={{ breakInside: "avoid", marginBottom: 3 }}>
                <b style={{ color: C.blue }}>p{s.page}</b>{" "}
                <span style={{ color: C.muted }}>{s.label || s.kind}</span> — {s.title}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Manuscript provenance. Shows the CANONICAL SOURCE hash — the operator's exact
 * uploaded bytes — so a frozen manuscript can be checked against the author's
 * own record BEFORE any production spend.
 *
 * The working manuscript is a sanitized derivative and has its own, different
 * hash. Showing only that (the old behaviour) made a frozen hash look wrong.
 * Both are shown, clearly labelled, whenever they differ.
 */
function ManuscriptProvenance({ project }) {
  const canonical = project?.canonicalManuscriptSha256;
  const working = project?.manuscriptSha256;
  if (!canonical && !working) return null;

  const mono = { fontFamily: "monospace", fontSize: 11, wordBreak: "break-all", color: C.ink };
  const row = (label, value, note) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={mono}>{value || "—"}</div>
      {note && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{note}</div>}
    </div>
  );

  return (
    <div style={S.card}>
      <b>Manuscript provenance</b>
      {canonical ? (
        <>
          {row("Canonical source · SHA-256", canonical, "The exact bytes you uploaded. Retained unchanged — check this against your frozen hash.")}
          {project.manuscriptSanitized
            ? row(
                "Working copy · SHA-256",
                working,
                "Production reads this sanitized derivative (emoji/ICON markers stripped, mojibake repaired, trailing spaces trimmed). A different hash here is expected and does not mean the source changed.",
              )
            : (
              <div style={{ marginTop: 8, fontSize: 12.5, color: C.green }}>
                ✓ Sanitization changed nothing — production reads the canonical bytes verbatim.
              </div>
            )}
        </>
      ) : (
        <>
          {row("Working copy · SHA-256", working)}
          <div style={{ color: C.orange, fontSize: 12, marginTop: 8 }}>
            ⚠ No canonical source retained for this upload. It predates canonical-source
            retention, so the hash above is the sanitized working copy, not your uploaded
            bytes. Re-upload the manuscript to record a verifiable canonical hash.
          </div>
        </>
      )}
    </div>
  );
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
  const isMobile = useMediaQuery(MOBILE_QUERY);
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
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12, marginTop: 14, alignItems: "flex-start" }}>
        {/* left: structure tree */}
        <div style={{ flex: isMobile ? "1 1 auto" : "0 0 260px", width: isMobile ? "100%" : undefined, maxHeight: isMobile ? 260 : 460, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, background: "#fff", padding: 8 }}>
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
        <div style={{ flex: 1, width: isMobile ? "100%" : undefined, maxHeight: isMobile ? "none" : 460, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, background: "#fff", padding: isMobile ? "12px" : "14px 18px" }}>
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
function LabeledInput({ label, value, onChange, error }) {
  return (
    <label style={{ display: "block", marginTop: 10, fontSize: 13, fontWeight: 600 }}>{label}
      <input style={{ ...S.input, ...(error ? { border: `2px solid ${C.red}` } : {}) }} value={value} onChange={(e) => onChange(e.target.value)} />
      {error ? <span style={{ display: "block", fontWeight: 400, color: C.red, fontSize: 12, marginTop: 3 }}>{error}</span> : null}
    </label>
  );
}
function LabeledTextarea({ label, value, onChange, rows = 4, hint, error }) {
  return (
    <label style={{ display: "block", marginTop: 10, fontSize: 13, fontWeight: 600 }}>{label}
      <textarea style={{ ...S.input, minHeight: rows * 22, fontFamily: "inherit", resize: "vertical", ...(error ? { border: `2px solid ${C.red}` } : {}) }} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      {/* The rule, in full. A guard the operator cannot read is a guard they
          cannot comply with, so this shows the whole sentence rather than
          truncating it to fit. */}
      {error ? <span style={{ display: "block", fontWeight: 400, color: C.red, fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>{error}</span> : null}
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
