---
name: dev-server-watchmode-port-aware
description: In watchmode, detect an existing dev server and reuse it instead of killing it or changing ports
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: live-coding
---

## What I do

- Start the dev server safely in watchmode with hot reload
- Detect if the server is **already running** on the expected host/port
- Reuse the existing server instead of:
  - killing processes
  - picking a random free port
  - silently changing configuration

## When to use me

Use this when live coding with watchmode/hotreload and you often leave the server running, causing “port already in use” errors.

## Inputs

- Expected dev URL (host + port), from the repo config:
  - `.env*`, config files, or `package.json` scripts
- Start command(s) for the server (e.g. `npm run dev`, `pnpm dev`, `make dev`)
- Optional: health endpoint or known marker route (`/health`, `/api/health`, `/`)

## Execution rules

- **Never** kill processes by default.
- **Never** change ports by default.
- Determine the **canonical** host/port from repo config (do not guess).
- Before starting, run a **preflight** check:
  - If the port is open **and** the server responds as expected (health check or marker), treat it as already running.
  - If the port is open but response is unknown, do **not** kill it; report the conflict and propose next steps.
- If already running:
  - Reuse it (skip starting)
  - Attach logs only if possible without restarting
  - Continue with the rest of the workflow (tests, lint, etc.)
- If not running:
  - Start server normally
  - Wait until health check passes (or a deterministic “ready” signal is detected)

## Completion rules

- Provide a short decision log:
  - detected running server (yes/no)
  - evidence (health check / response / port probe)
  - action taken (reused / started / reported conflict)
- No port switching, no process killing unless explicitly requested
