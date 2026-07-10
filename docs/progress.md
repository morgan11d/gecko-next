# Progress

## Current Status

Status: CORE READY for demo workflow. Backend/API/Docker layer added; PostgreSQL schema and Alembic migration are present, while the local API runtime uses an in-memory store for fast hackathon demo startup.

## Done

- Read the PDF task and the full ideal prompt.
- Analyzed the real `14.json`, `14.mp4`, and `12 (done).json` fixtures.
- Added Gecko JSON v2 import/export support for `schemaVersion/monologues/terms`.
- Added waveform overlay regions directly on the audio line.
- Reworked waveform/source rails so every speaker has a stable color and dense Gecko v2 monologues remain visually separated.
- Changed startup to an empty user work area without preloaded demo segments.
- Added real-file Playwright coverage for `14.mp4 + 14.json` and `12 (done).json`.
- Added FastAPI backend with auth token, RBAC dependencies, media endpoints, Gecko v2 import/export, autosave, segment editing, terms, verification workflow, analytics, audit and backup endpoint.
- Added Dockerfile, backend Dockerfile, Docker Compose with PostgreSQL, `.env.example`, Alembic schema migration and CI workflow.
- Verified frontend build, smoke, import/edit, Gecko v2 round-trip export and backend API tests.

## Remaining Gaps Against Ideal Prompt

- API demo runtime persists in memory; PostgreSQL schema/migration is ready but repository layer is not yet switched from in-memory store to SQLAlchemy persistence.
- Current frontend persistence still uses localStorage for instant demo UX; backend autosave endpoint exists for server-backed integration.
- AI remains deterministic frontend mock.
- Advanced media waveform generation through ffmpeg is represented by a deterministic cached peaks endpoint; production ffmpeg extraction is still a next step.
