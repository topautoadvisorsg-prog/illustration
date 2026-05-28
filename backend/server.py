"""
Placeholder ASGI app to satisfy the platform supervisor's pre-configured
`uvicorn server:app` command. This file is NOT part of the Wildlands
Publishing Platform.

The real backend is a Node.js + Fastify application started via
`yarn dev:backend` from the monorepo root. See /app/README.md.

This stub exists only so the supervisor process does not crash-loop in
the dev container. It exposes a single /health endpoint that returns a
human-readable pointer to the real Node backend.
"""
from fastapi import FastAPI

app = FastAPI(title="wildlands-supervisor-placeholder")


@app.get("/")
@app.get("/health")
def health():
    return {
        "status": "ok",
        "note": "This is a supervisor placeholder. The real backend is Node/Fastify — run 'yarn dev:backend' from /app.",
    }
