import { useEffect, useMemo, useState } from "react";
import "@/App.css";

const configuredBackend = process.env.REACT_APP_BACKEND_URL || "";

const LAYOUT_TEMPLATES = [
  ["LAYOUT_1_STANDARD", "Standard", "Balanced text and illustration", 220, 320, 420],
  ["LAYOUT_2_TEXT_HEAVY", "Text Heavy", "Long entries with smaller art", 420, 560, 720],
  ["LAYOUT_3_ILLUSTRATION_DOMINANT", "Image Dominant", "Short text with a strong plate", 90, 160, 240],
  ["LAYOUT_4_DANGER_WARNING", "Danger Warning", "Toxic or safety-heavy pages", 240, 340, 460],
  ["LAYOUT_5_CHAPTER_OPENER", "Chapter Opener", "Atmospheric opening page", 40, 90, 150],
  ["LAYOUT_6_BACK_MATTER", "Back Matter", "Tables, index, glossary", 260, 420, 620],
  ["LAYOUT_7_SCATTERED_VIGNETTES", "Vignettes", "Several small naturalist studies", 160, 240, 340],
  ["LAYOUT_8_MARGIN_ILLUSTRATION", "Margin Art", "Tall plant or side illustration", 300, 430, 580],
  ["LAYOUT_9_DIAGNOSTIC_DIAGRAM", "Diagnostic", "Comparisons, diagrams, anatomy", 180, 280, 400],
];

function defaultLayoutPromptAssets() {
  return LAYOUT_TEMPLATES.map(([id, name, description, minWords, targetWords, maxWords], index) => ({
    templateId: id,
    label: name,
    mockupImagePath: `layout-${String(index + 1).padStart(2, "0")}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`,
    minWords,
    targetWords,
    maxWords,
    recommendedBodyPt: id === "LAYOUT_2_TEXT_HEAVY" ? 10.5 : 11,
    recommendedLineHeight: id === "LAYOUT_2_TEXT_HEAVY" ? 1.23 : 1.28,
    promptTemplate:
      `Create the final illustration for ${name}. Subject: {SUBJECT}. ` +
      `Scientific/diagnostic details: {SCIENTIFIC_DETAILS}. ` +
      `Composition must match the approved mockup image slot for ${id}: ${description}. ` +
      `Do not render page text, labels, titles, captions, or typography.`,
    placeholders: ["{SUBJECT}", "{SCIENTIFIC_DETAILS}", "{COMPOSITION_NOTES}"],
    textFitRule:
      id === "LAYOUT_2_TEXT_HEAVY"
        ? "Use this when manuscript text is long; art stays secondary and text must remain comfortable."
        : id === "LAYOUT_9_DIAGNOSTIC_DIAGRAM"
          ? "Use this for comparisons, anatomy, diagrams, tracks, and look-alike pages."
          : "Fit the real manuscript text into this mockup before generating final art.",
    imageSlotDescription: "Mockup image defines the art slot. Generated art replaces only that slot after text-fit approval.",
    capacityTestStatus: "UNTESTED",
    operatorNotes: "Word range is a starting recommendation; approve after real text-fit tests.",
  }));
}

function trimSlash(value) {
  return value.replace(/\/+$/, "");
}

function defaultProjectConfig() {
  return {
    brand: "THE_WILDLANDS",
    audience: "ADULT",
    editions: ["PREMIUM", "KINDLE_EPUB"],
    volume: 1,
    title: "The Wildlands Field Guide",
    subtitle: "New England Volume",
    authorName: "The Wildlands",
    trimSize: { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 },
    typography: {
      headingFont: "EB Garamond",
      bodyFont: "EB Garamond",
      captionFont: "Inter",
      bodyPt: 11,
      lineHeight: 1.28,
      smallCaps: true,
    },
    colorPalette: {
      paper: "#f4f1ea",
      ink: "#1b332d",
      accent: "#2f5d50",
      warning: "#9f2d20",
    },
    imageGeneration: {
      masterStyleBlockVersion: "THE_WILDLANDS_v1",
      styleName: "Cinematic Naturalist",
      imageModel: "gpt-image-1",
      upscaleModel: "Replicate Real-ESRGAN",
    },
    layoutPolicy: {
      layoutReferenceSet: "wildlands-layout-references-v1",
      textFitFirst: true,
      chapterByChapterRender: true,
      defaultTemplate: "LAYOUT_1_STANDARD",
      longTextTemplate: "LAYOUT_2_TEXT_HEAVY",
      comparisonTemplate: "LAYOUT_9_DIAGNOSTIC_DIAGRAM",
    },
    layoutPromptAssets: defaultLayoutPromptAssets(),
    outputProfile: {
      printEdition: "PREMIUM",
      ebookEdition: "KINDLE_EPUB",
      renderEngine: "PUPPETEER_PAGEDJS",
      pdfTarget: "KDP premium color hardcover",
    },
  };
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function trimNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read manuscript file."));
    reader.readAsText(file);
  });
}

async function readJson(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.message || `${response.status} ${response.statusText}`);
  }
  return data;
}

function App() {
  const [backendUrl, setBackendUrl] = useState(trimSlash(configuredBackend));
  const [health, setHealth] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [projectConfig, setProjectConfig] = useState(defaultProjectConfig);
  const [manuscript, setManuscript] = useState(`# CHAPTER 1 - Forest Floor

## Chanterelle

### Identification
Golden yellow mushroom with false gills running down the stem.

### Habitat
Found near hardwoods after summer rain.

### Notes
Use this entry to prove manuscript to manifest generation.`);
  const [manifests, setManifests] = useState([]);
  const [pages, setPages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [commandInput, setCommandInput] = useState("");
  const [operatorLog, setOperatorLog] = useState([
    {
      level: "system",
      text: "Console ready. Load a manuscript, create/select a project, then run upload and manifest generation.",
      time: "ready",
    },
  ]);

  const apiUrl = useMemo(() => trimSlash(backendUrl), [backendUrl]);
  const selectedProject = projects.find((project) => project.id === activeProjectId);

  function setConfig(path, value) {
    setProjectConfig((current) => {
      const next = structuredClone(current);
      let target = next;
      for (let index = 0; index < path.length - 1; index += 1) {
        target = target[path[index]];
      }
      target[path[path.length - 1]] = value;
      return next;
    });
  }

  function updateLayoutAsset(index, key, value) {
    setProjectConfig((current) => {
      const next = structuredClone(current);
      next.layoutPromptAssets[index][key] = value;
      return next;
    });
  }

  function appendLog(level, text) {
    setOperatorLog((current) => [
      {
        level,
        text,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      },
      ...current,
    ].slice(0, 80));
  }

  async function uploadLayoutMockup(index, file) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setProjectConfig((current) => {
      const next = structuredClone(current);
      next.layoutPromptAssets[index].mockupImagePath = file.name;
      next.layoutPromptAssets[index].mockupImageDataUrl = dataUrl;
      return next;
    });
  }

  async function call(path, options = {}) {
    if (!apiUrl) {
      throw new Error("Set REACT_APP_BACKEND_URL in Railway or enter the backend URL here.");
    }
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    return readJson(response);
  }

  async function run(label, fn) {
    setBusy(true);
    setError("");
    setMessage(label);
    appendLog("running", label);
    try {
      await fn();
      appendLog("success", label.replace(/\.\.\.$/, " complete."));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      appendLog("error", errorMessage);
    } finally {
      setBusy(false);
    }
  }

  async function refreshHealth() {
    const data = await call("/health");
    setHealth(data);
    setMessage("Backend health check passed.");
  }

  async function refreshProjects() {
    const data = await call("/api/projects");
    setProjects(data.projects || []);
    if (!activeProjectId && data.projects?.[0]) {
      setActiveProjectId(data.projects[0].id);
    }
  }

  async function createProject() {
    const data = await call("/api/projects", {
      method: "POST",
      body: JSON.stringify({ config: projectConfig }),
    });
    setProjects((current) => [data.project, ...current.filter((project) => project.id !== data.project.id)]);
    setActiveProjectId(data.project.id);
    setMessage("Project created with the visible configuration.");
    appendLog("success", `Project ready: ${data.project.title}`);
    return data.project.id;
  }

  async function uploadManuscript(projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    const data = await call(`/api/projects/${projectId}/manuscript`, {
      method: "POST",
      body: JSON.stringify({ filename: "milestone-1-test.md", markdown: manuscript }),
    });
    setProjects((current) => current.map((project) => (project.id === data.project.id ? data.project : project)));
    setMessage(`Manuscript uploaded: ${data.manuscript.sizeBytes} bytes.`);
    appendLog("success", `Manuscript uploaded: ${data.manuscript.sizeBytes} bytes.`);
  }

  async function loadArtifacts(projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    const [manifestData, pageData] = await Promise.all([
      call(`/api/projects/${projectId}/manifests`),
      call(`/api/projects/${projectId}/pages`),
    ]);
    setManifests(manifestData.manifests || []);
    setPages(pageData.pages || []);
    setMessage("Loaded manifests and pages.");
  }

  async function generateManifests(projectId = activeProjectId) {
    if (!projectId) throw new Error("Create or select a project first.");
    const data = await call(`/api/projects/${projectId}/manifests`, {
      method: "POST",
      body: JSON.stringify({ markdown: manuscript }),
    });
    setProjects((current) => current.map((project) => (project.id === data.project.id ? data.project : project)));
    setMessage(`Manifested ${data.summary.totalPages} page(s), ${data.summary.manifestsWritten} manifest row(s).`);
    appendLog("success", `Claude manifest pass wrote ${data.summary.totalPages} page(s).`);
    await loadArtifacts(projectId);
  }

  async function uploadManuscriptFile(file) {
    if (!file) return;
    const text = await readFileAsText(file);
    setManuscript(text);
    appendLog("success", `Loaded local manuscript file: ${file.name}`);
  }

  async function runManuscriptIntake() {
    let projectId = activeProjectId;
    if (!projectId) {
      projectId = await createProject();
    }
    await uploadManuscript(projectId);
    await generateManifests(projectId);
  }

  async function handleOperatorCommand(event) {
    event.preventDefault();
    const command = commandInput.trim();
    if (!command) return;
    setCommandInput("");
    appendLog("command", command);

    const normalized = command.toLowerCase();
    if (normalized.includes("check")) {
      await run("Checking backend...", refreshHealth);
    } else if (normalized.includes("create")) {
      await run("Creating project...", createProject);
    } else if (normalized.includes("upload")) {
      await run("Uploading manuscript...", uploadManuscript);
    } else if (normalized.includes("manifest") || normalized.includes("claude")) {
      await run("Generating manifests...", generateManifests);
    } else if (normalized.includes("refresh") || normalized.includes("output")) {
      await run("Loading output...", () => loadArtifacts());
    } else if (normalized.includes("run") || normalized.includes("start")) {
      await run("Running manuscript intake...", runManuscriptIntake);
    } else {
      appendLog("system", "Try: check backend, create project, upload manuscript, generate manifests, refresh output, or run intake.");
    }
  }

  useEffect(() => {
    if (!apiUrl) return;
    run("Checking backend...", async () => {
      await refreshHealth();
      await refreshProjects();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">The Wildlands Publishing Platform</p>
          <h1>Pipeline Administration</h1>
        </div>
        <div className={`status ${health?.ok ? "ok" : "warn"}`}>{health?.ok ? "Backend online" : "Backend unchecked"}</div>
      </section>

      <section className="panel backend-panel">
        <Field label="Backend URL">
          <div className="inline-form">
            <input
              value={backendUrl}
              onChange={(event) => setBackendUrl(trimSlash(event.target.value))}
              placeholder="https://wildlandsbackend-production..."
            />
            <button disabled={busy} onClick={() => run("Checking backend...", refreshHealth)}>
              Check
            </button>
          </div>
        </Field>
        <p className="hint">This must be the backend API URL, not the database URL.</p>
      </section>

      {(message || error) && <section className={`notice ${error ? "error" : ""}`}>{error || message}</section>}

      <section className="operator-grid">
        <section className="panel command-panel">
          <div className="section-head">
            <div>
              <h2>Operator Command Center</h2>
              <p className="hint">Type a command or use the buttons. This is where you drive the pipeline.</p>
            </div>
            <span className="mode-pill">{busy ? "Running" : "Ready"}</span>
          </div>
          <form className="command-form" onSubmit={handleOperatorCommand}>
            <input
              value={commandInput}
              onChange={(event) => setCommandInput(event.target.value)}
              placeholder="Try: run intake, upload manuscript, generate manifests, refresh output"
            />
            <button disabled={busy} type="submit">Run</button>
          </form>
          <div className="quick-actions">
            <button disabled={busy} onClick={() => run("Checking backend...", refreshHealth)}>Check Backend</button>
            <button disabled={busy} onClick={() => run("Creating project...", createProject)}>Create Project</button>
            <button disabled={busy || !activeProjectId} onClick={() => run("Uploading manuscript...", uploadManuscript)}>
              Upload Manuscript
            </button>
            <button disabled={busy || !activeProjectId} onClick={() => run("Generating manifests...", generateManifests)}>
              Generate Manifests
            </button>
            <button disabled={busy} onClick={() => run("Running manuscript intake...", runManuscriptIntake)}>
              Run Intake
            </button>
          </div>
          <div className="operator-log" aria-live="polite">
            {operatorLog.map((entry, index) => (
              <div className={`log-row ${entry.level}`} key={`${entry.time}-${index}`}>
                <span>{entry.time}</span>
                <p>{entry.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel flow-panel">
          <h2>What Happens Next</h2>
          <div className="flow-steps">
            <div className={`flow-step ${activeProjectId ? "done" : "current"}`}>
              <strong>1. Project</strong>
              <span>{activeProjectId ? "Created or selected" : "Create/select project first"}</span>
            </div>
            <div className={`flow-step ${selectedProject?.manuscriptPath ? "done" : activeProjectId ? "current" : ""}`}>
              <strong>2. Manuscript</strong>
              <span>Paste or upload the .md manuscript, then send it to backend storage</span>
            </div>
            <div className={`flow-step ${pages.length > 0 ? "done" : selectedProject?.manuscriptPath ? "current" : ""}`}>
              <strong>3. Manifest</strong>
              <span>Claude splits chapters/pages and writes manifest rows</span>
            </div>
            <div className={`flow-step ${pages.length > 0 ? "current" : ""}`}>
              <strong>4. Layout Fit</strong>
              <span>Agent selects one of 9 layouts, fits text, waits for approval</span>
            </div>
            <div className="flow-step">
              <strong>5. Images + Exports</strong>
              <span>Approved layout prompts generate final art, then PDF/EPUB stages run</span>
            </div>
          </div>
        </section>
      </section>

      <section className="pipeline-grid">
        <section className="panel">
          <div className="section-head">
            <h2>2. Manuscript</h2>
            <div className="button-row">
              <label className="file-button">
                Load .md
                <input
                  type="file"
                  accept=".md,text/markdown,text/plain"
                  onChange={(event) => uploadManuscriptFile(event.target.files?.[0])}
                />
              </label>
              <button disabled={busy || !activeProjectId} onClick={() => run("Uploading manuscript...", uploadManuscript)}>
                Upload
              </button>
              <button disabled={busy || !activeProjectId} onClick={() => run("Generating manifests...", generateManifests)}>
                Generate Manifests
              </button>
            </div>
          </div>
          <textarea value={manuscript} onChange={(event) => setManuscript(event.target.value)} />
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>3. Manifest Output</h2>
            <button disabled={busy || !activeProjectId} onClick={() => run("Loading output...", () => loadArtifacts())}>
              Refresh
            </button>
          </div>
          <div className="output-grid">
            <div>
              <h3>Pages</h3>
              <div className="table">
                {pages.map((page) => (
                  <div className="row" key={page.id}>
                    <span>{page.pageKey}</span>
                    <span>{page.layoutTemplate || "No layout"}</span>
                    <span>{page.status}</span>
                  </div>
                ))}
                {pages.length === 0 && <p className="empty">No pages yet.</p>}
              </div>
            </div>
            <div>
              <h3>Manifests</h3>
              <div className="table">
                {manifests.map((manifest) => (
                  <div className="row" key={manifest.id}>
                    <span>{manifest.kind}</span>
                    <span>{manifest.externalId}</span>
                    <span>v{manifest.version}</span>
                  </div>
                ))}
                {manifests.length === 0 && <p className="empty">No manifests yet.</p>}
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className="workspace-grid">
        <section className="panel setup-panel">
          <div className="section-head">
            <h2>1. Project Setup</h2>
            <button disabled={busy} onClick={() => run("Creating project...", createProject)}>
              Create Project
            </button>
          </div>

          <div className="form-grid">
            <Field label="Title">
              <input value={projectConfig.title} onChange={(event) => setConfig(["title"], event.target.value)} />
            </Field>
            <Field label="Subtitle">
              <input value={projectConfig.subtitle} onChange={(event) => setConfig(["subtitle"], event.target.value)} />
            </Field>
            <Field label="Author / Imprint">
              <input value={projectConfig.authorName} onChange={(event) => setConfig(["authorName"], event.target.value)} />
            </Field>
            <Field label="Volume">
              <input
                type="number"
                min="1"
                value={projectConfig.volume}
                onChange={(event) => setConfig(["volume"], trimNumber(event.target.value))}
              />
            </Field>
            <Field label="Brand">
              <select value={projectConfig.brand} onChange={(event) => setConfig(["brand"], event.target.value)}>
                <option value="THE_WILDLANDS">THE_WILDLANDS</option>
              </select>
            </Field>
            <Field label="Audience">
              <select value={projectConfig.audience} onChange={(event) => setConfig(["audience"], event.target.value)}>
                <option value="ADULT">Adult</option>
              </select>
            </Field>
          </div>

          <div className="config-section">
            <h3>Output Profile</h3>
            <div className="form-grid compact">
              <Field label="Print Edition">
                <select
                  value={projectConfig.outputProfile.printEdition}
                  onChange={(event) => setConfig(["outputProfile", "printEdition"], event.target.value)}
                >
                  <option value="PREMIUM">Premium PDF, 8.5 x 11 full color</option>
                </select>
              </Field>
              <Field label="Ebook Edition">
                <select
                  value={projectConfig.outputProfile.ebookEdition}
                  onChange={(event) => setConfig(["outputProfile", "ebookEdition"], event.target.value)}
                >
                  <option value="KINDLE_EPUB">Kindle EPUB</option>
                </select>
              </Field>
              <Field label="PDF Engine">
                <select
                  value={projectConfig.outputProfile.renderEngine}
                  onChange={(event) => setConfig(["outputProfile", "renderEngine"], event.target.value)}
                >
                  <option value="PUPPETEER_PAGEDJS">Puppeteer + Paged.js</option>
                </select>
              </Field>
              <Field label="KDP Target">
                <input
                  value={projectConfig.outputProfile.pdfTarget}
                  onChange={(event) => setConfig(["outputProfile", "pdfTarget"], event.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="config-section">
            <h3>Page Geometry</h3>
            <div className="number-row">
              <Field label="Trim Width">
                <input
                  type="number"
                  step="0.125"
                  value={projectConfig.trimSize.widthIn}
                  onChange={(event) => setConfig(["trimSize", "widthIn"], trimNumber(event.target.value))}
                />
              </Field>
              <Field label="Trim Height">
                <input
                  type="number"
                  step="0.125"
                  value={projectConfig.trimSize.heightIn}
                  onChange={(event) => setConfig(["trimSize", "heightIn"], trimNumber(event.target.value))}
                />
              </Field>
              <Field label="Bleed">
                <input
                  type="number"
                  step="0.001"
                  value={projectConfig.trimSize.bleedIn}
                  onChange={(event) => setConfig(["trimSize", "bleedIn"], trimNumber(event.target.value))}
                />
              </Field>
            </div>
          </div>

          <div className="config-section">
            <h3>Typography</h3>
            <div className="form-grid compact">
              <Field label="Heading Font">
                <input
                  value={projectConfig.typography.headingFont}
                  onChange={(event) => setConfig(["typography", "headingFont"], event.target.value)}
                />
              </Field>
              <Field label="Body Font">
                <input
                  value={projectConfig.typography.bodyFont}
                  onChange={(event) => setConfig(["typography", "bodyFont"], event.target.value)}
                />
              </Field>
              <Field label="Caption Font">
                <input
                  value={projectConfig.typography.captionFont}
                  onChange={(event) => setConfig(["typography", "captionFont"], event.target.value)}
                />
              </Field>
              <Field label="Body Size">
                <input
                  type="number"
                  step="0.5"
                  value={projectConfig.typography.bodyPt}
                  onChange={(event) => setConfig(["typography", "bodyPt"], trimNumber(event.target.value))}
                />
              </Field>
              <Field label="Line Height">
                <input
                  type="number"
                  step="0.01"
                  value={projectConfig.typography.lineHeight}
                  onChange={(event) => setConfig(["typography", "lineHeight"], trimNumber(event.target.value))}
                />
              </Field>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={projectConfig.typography.smallCaps}
                  onChange={(event) => setConfig(["typography", "smallCaps"], event.target.checked)}
                />
                Small-caps section labels
              </label>
            </div>
          </div>

          <div className="config-section">
            <h3>Color System</h3>
            <div className="swatch-grid">
              {Object.entries(projectConfig.colorPalette).map(([key, value]) => (
                <Field key={key} label={key}>
                  <div className="color-input">
                    <span className="swatch" style={{ backgroundColor: value }} />
                    <input value={value} onChange={(event) => setConfig(["colorPalette", key], event.target.value)} />
                  </div>
                </Field>
              ))}
            </div>
          </div>

          <div className="config-section">
            <h3>Image + Style Policy</h3>
            <div className="form-grid compact">
              <Field label="Master Style Block">
                <input
                  value={projectConfig.imageGeneration.masterStyleBlockVersion}
                  onChange={(event) => setConfig(["imageGeneration", "masterStyleBlockVersion"], event.target.value)}
                />
              </Field>
              <Field label="Style Name">
                <input
                  value={projectConfig.imageGeneration.styleName}
                  onChange={(event) => setConfig(["imageGeneration", "styleName"], event.target.value)}
                />
              </Field>
              <Field label="Image Model">
                <input
                  value={projectConfig.imageGeneration.imageModel}
                  onChange={(event) => setConfig(["imageGeneration", "imageModel"], event.target.value)}
                />
              </Field>
              <Field label="Upscale Model">
                <input
                  value={projectConfig.imageGeneration.upscaleModel}
                  onChange={(event) => setConfig(["imageGeneration", "upscaleModel"], event.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="config-section">
            <h3>Layout Reference Policy</h3>
            <div className="form-grid compact">
              <Field label="Reference Set">
                <input
                  value={projectConfig.layoutPolicy.layoutReferenceSet}
                  onChange={(event) => setConfig(["layoutPolicy", "layoutReferenceSet"], event.target.value)}
                />
              </Field>
              <Field label="Default Template">
                <select
                  value={projectConfig.layoutPolicy.defaultTemplate}
                  onChange={(event) => setConfig(["layoutPolicy", "defaultTemplate"], event.target.value)}
                >
                  {LAYOUT_TEMPLATES.map(([id, name]) => (
                    <option key={id} value={id}>{`${name} - ${id}`}</option>
                  ))}
                </select>
              </Field>
              <Field label="Long Text Template">
                <select
                  value={projectConfig.layoutPolicy.longTextTemplate}
                  onChange={(event) => setConfig(["layoutPolicy", "longTextTemplate"], event.target.value)}
                >
                  {LAYOUT_TEMPLATES.map(([id, name]) => (
                    <option key={id} value={id}>{`${name} - ${id}`}</option>
                  ))}
                </select>
              </Field>
              <Field label="Comparison Template">
                <select
                  value={projectConfig.layoutPolicy.comparisonTemplate}
                  onChange={(event) => setConfig(["layoutPolicy", "comparisonTemplate"], event.target.value)}
                >
                  {LAYOUT_TEMPLATES.map(([id, name]) => (
                    <option key={id} value={id}>{`${name} - ${id}`}</option>
                  ))}
                </select>
              </Field>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={projectConfig.layoutPolicy.textFitFirst}
                  onChange={(event) => setConfig(["layoutPolicy", "textFitFirst"], event.target.checked)}
                />
                Text-fit preview before image spend
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={projectConfig.layoutPolicy.chapterByChapterRender}
                  onChange={(event) => setConfig(["layoutPolicy", "chapterByChapterRender"], event.target.checked)}
                />
                Render chapter by chapter
              </label>
            </div>
          </div>

          <div className="config-section">
            <h3>Layout Prompt Library</h3>
            <p className="hint">
              Each layout keeps its mockup image path and image prompt template together. The placeholders get filled
              after the text-fit mockup is approved.
            </p>
            <div className="layout-asset-grid">
              {projectConfig.layoutPromptAssets.map((asset, index) => (
                <article className="layout-asset-card" key={asset.templateId}>
                  <div className="layout-asset-head">
                    <strong>{asset.label}</strong>
                    <span>{asset.templateId}</span>
                  </div>
                  <Field label="Mockup Image Path">
                    <input
                      value={asset.mockupImagePath}
                      onChange={(event) => updateLayoutAsset(index, "mockupImagePath", event.target.value)}
                    />
                  </Field>
                  <Field label="Upload Mockup Image">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => uploadLayoutMockup(index, event.target.files?.[0])}
                    />
                  </Field>
                  <p className="filename-hint">Recommended name: {asset.mockupImagePath}</p>
                  {asset.mockupImageDataUrl ? (
                    <img className="layout-mockup-preview" src={asset.mockupImageDataUrl} alt={`${asset.label} mockup`} />
                  ) : (
                    <div className="layout-mockup-empty">No mockup uploaded</div>
                  )}
                  <div className="capacity-grid">
                    <Field label="Min Words">
                      <input
                        type="number"
                        value={asset.minWords}
                        onChange={(event) => updateLayoutAsset(index, "minWords", trimNumber(event.target.value))}
                      />
                    </Field>
                    <Field label="Target Words">
                      <input
                        type="number"
                        value={asset.targetWords}
                        onChange={(event) => updateLayoutAsset(index, "targetWords", trimNumber(event.target.value))}
                      />
                    </Field>
                    <Field label="Max Words">
                      <input
                        type="number"
                        value={asset.maxWords}
                        onChange={(event) => updateLayoutAsset(index, "maxWords", trimNumber(event.target.value))}
                      />
                    </Field>
                    <Field label="Body Pt">
                      <input
                        type="number"
                        step="0.5"
                        value={asset.recommendedBodyPt}
                        onChange={(event) => updateLayoutAsset(index, "recommendedBodyPt", trimNumber(event.target.value))}
                      />
                    </Field>
                    <Field label="Line Height">
                      <input
                        type="number"
                        step="0.01"
                        value={asset.recommendedLineHeight}
                        onChange={(event) => updateLayoutAsset(index, "recommendedLineHeight", trimNumber(event.target.value))}
                      />
                    </Field>
                    <Field label="Capacity Status">
                      <select
                        value={asset.capacityTestStatus}
                        onChange={(event) => updateLayoutAsset(index, "capacityTestStatus", event.target.value)}
                      >
                        <option value="UNTESTED">Untested</option>
                        <option value="TESTING">Testing</option>
                        <option value="APPROVED">Approved</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Prompt Template">
                    <textarea
                      className="prompt-template"
                      value={asset.promptTemplate}
                      onChange={(event) => updateLayoutAsset(index, "promptTemplate", event.target.value)}
                    />
                  </Field>
                  <Field label="Placeholders">
                    <input
                      value={asset.placeholders.join(", ")}
                      onChange={(event) =>
                        updateLayoutAsset(
                          index,
                          "placeholders",
                          event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  </Field>
                  <Field label="Text Fit Rule">
                    <input
                      value={asset.textFitRule}
                      onChange={(event) => updateLayoutAsset(index, "textFitRule", event.target.value)}
                    />
                  </Field>
                  <Field label="Image Slot Rule">
                    <input
                      value={asset.imageSlotDescription}
                      onChange={(event) => updateLayoutAsset(index, "imageSlotDescription", event.target.value)}
                    />
                  </Field>
                  <Field label="Operator / Agent Notes">
                    <textarea
                      className="notes-field"
                      value={asset.operatorNotes}
                      onChange={(event) => updateLayoutAsset(index, "operatorNotes", event.target.value)}
                    />
                  </Field>
                </article>
              ))}
            </div>
          </div>
        </section>

        <aside className="side-stack">
          <section className="panel preview-panel">
            <h2>Operator Preview</h2>
            <div className="book-preview" style={{ backgroundColor: projectConfig.colorPalette.paper }}>
              <p className="preview-kicker" style={{ color: projectConfig.colorPalette.accent }}>
                {projectConfig.brand} / {projectConfig.outputProfile.printEdition}
              </p>
              <h3 style={{ color: projectConfig.colorPalette.ink, fontFamily: projectConfig.typography.headingFont }}>
                {projectConfig.title}
              </h3>
              <p className="preview-subtitle">{projectConfig.subtitle}</p>
              <p
                className="preview-body"
                style={{
                  color: projectConfig.colorPalette.ink,
                  fontFamily: projectConfig.typography.bodyFont,
                  fontSize: `${projectConfig.typography.bodyPt}px`,
                  lineHeight: projectConfig.typography.lineHeight,
                }}
              >
                Chanterelle identification notes sit beside a cinematic naturalist illustration. Section labels use
                {projectConfig.typography.smallCaps ? " small caps" : " normal caps"}.
              </p>
              <div className="mock-art">subject art slot</div>
            </div>
            <div className="facts">
              <span>{projectConfig.trimSize.widthIn} x {projectConfig.trimSize.heightIn} in</span>
              <span>Bleed {projectConfig.trimSize.bleedIn} in</span>
              <span>{projectConfig.outputProfile.renderEngine}</span>
            </div>
          </section>

          <section className="panel">
            <h2>Active Project</h2>
            <select value={activeProjectId} onChange={(event) => setActiveProjectId(event.target.value)}>
              <option value="">No project selected</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title} - {project.status}
                </option>
              ))}
            </select>
            {selectedProject && <p className="meta">Selected: {selectedProject.id}</p>}
          </section>

          <section className="panel template-panel">
            <h2>9 Layout Templates</h2>
            {LAYOUT_TEMPLATES.map(([id, name, description]) => (
              <div className="template-row" key={id}>
                <strong>{name}</strong>
                <span>{description}</span>
              </div>
            ))}
          </section>
        </aside>
      </section>

    </main>
  );
}

export default App;
