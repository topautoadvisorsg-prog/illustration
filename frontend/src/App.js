import { useEffect, useMemo, useState } from "react";
import "@/App.css";

const configuredBackend = process.env.REACT_APP_BACKEND_URL || "";

function trimSlash(value) {
  return value.replace(/\/+$/, "");
}

function defaultConfig(title) {
  return {
    brand: "THE_WILDLANDS",
    audience: "ADULT",
    editions: ["PREMIUM", "KINDLE_EPUB"],
    volume: 1,
    title,
    subtitle: "Milestone 1 Test",
    authorName: "The Wildlands",
    trimSize: { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 },
  };
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
  const [projectTitle, setProjectTitle] = useState("The Wildlands Field Guide");
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

  const apiUrl = useMemo(() => trimSlash(backendUrl), [backendUrl]);
  const selectedProject = projects.find((project) => project.id === activeProjectId);

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
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      body: JSON.stringify({ config: defaultConfig(projectTitle) }),
    });
    setProjects((current) => [data.project, ...current.filter((project) => project.id !== data.project.id)]);
    setActiveProjectId(data.project.id);
    setMessage("Project created.");
  }

  async function uploadManuscript() {
    if (!activeProjectId) throw new Error("Create or select a project first.");
    const data = await call(`/api/projects/${activeProjectId}/manuscript`, {
      method: "POST",
      body: JSON.stringify({ filename: "milestone-1-test.md", markdown: manuscript }),
    });
    setProjects((current) => current.map((project) => (project.id === data.project.id ? data.project : project)));
    setMessage(`Manuscript uploaded: ${data.manuscript.sizeBytes} bytes.`);
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

  async function generateManifests() {
    if (!activeProjectId) throw new Error("Create or select a project first.");
    const data = await call(`/api/projects/${activeProjectId}/manifests`, {
      method: "POST",
      body: JSON.stringify({ markdown: manuscript }),
    });
    setProjects((current) => current.map((project) => (project.id === data.project.id ? data.project : project)));
    setMessage(`Manifested ${data.summary.totalPages} page(s), ${data.summary.manifestsWritten} manifest row(s).`);
    await loadArtifacts(activeProjectId);
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
        <label htmlFor="backend-url">Backend URL</label>
        <div className="inline-form">
          <input
            id="backend-url"
            value={backendUrl}
            onChange={(event) => setBackendUrl(trimSlash(event.target.value))}
            placeholder="https://wildlandsbackend-production..."
          />
          <button disabled={busy} onClick={() => run("Checking backend...", refreshHealth)}>
            Check
          </button>
        </div>
        <p className="hint">Set REACT_APP_BACKEND_URL on the Railway frontend service so this is baked into production.</p>
      </section>

      {(message || error) && <section className={`notice ${error ? "error" : ""}`}>{error || message}</section>}

      <section className="grid">
        <div className="panel">
          <h2>1. Project</h2>
          <label htmlFor="project-title">Title</label>
          <input id="project-title" value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} />
          <button disabled={busy} onClick={() => run("Creating project...", createProject)}>
            Create Project
          </button>

          <label htmlFor="project-select">Active Project</label>
          <select id="project-select" value={activeProjectId} onChange={(event) => setActiveProjectId(event.target.value)}>
            <option value="">No project selected</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title} - {project.status}
              </option>
            ))}
          </select>
          {selectedProject && <p className="meta">Selected: {selectedProject.id}</p>}
        </div>

        <div className="panel">
          <h2>2. Manuscript</h2>
          <textarea value={manuscript} onChange={(event) => setManuscript(event.target.value)} />
          <div className="button-row">
            <button disabled={busy || !activeProjectId} onClick={() => run("Uploading manuscript...", uploadManuscript)}>
              Upload
            </button>
            <button disabled={busy || !activeProjectId} onClick={() => run("Generating manifests...", generateManifests)}>
              Generate Manifests
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>3. Output</h2>
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
    </main>
  );
}

export default App;
