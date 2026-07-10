# Requirements Matrix

| ID | Requirement | Priority | Status | Frontend | Backend/API | Data | Verification | Notes |
|---|---|---:|---|---|---|---|---|---|
| P0-01 | Upload user audio/video | MUST | done | Import sidebar | `POST /media/upload`, `GET /media/{id}` | `media_files` | `test:gecko-v2` uploads `14.mp4`; backend pytests | Browser object URL in UI, protected media endpoint in API |
| P0-02 | Upload Gecko JSON | MUST | done | Annotation import | `POST /tasks/{id}/import/gecko-v2` | `segments`, `speakers`, `transcript_versions` | `test:import`, `test:gecko-v2`, backend real fixture | Supports flat JSON and Gecko v2 |
| P0-03 | Waveform | MUST | done | WaveSurfer | `GET /media/{id}/waveform` | `media_files.waveform_peaks` | `test:smoke` | API returns cached deterministic peaks; UI has WaveSurfer fallback |
| P0-04 | Segments visible on audio line | MUST | done | `WaveformRegions` with speaker colors | `GET /tasks/{id}/segments` | `segments` | `test:gecko-v2` counts 267 regions and multiple colors | Lower rail removed; editing happens directly on waveform |
| P0-05 | Edit segment boundaries/text | MUST | done | Segment editor | `POST /segments`, `PATCH /segments/{id}`, `DELETE /segments/{id}` | `segments` | `test:import`, `test:gecko-v2`, backend pytests | 0.01 sec inputs |
| P0-06 | Export Gecko-compatible JSON | MUST | done | JSON Gecko button | `POST /tasks/{id}/export/json` | export payload from `segments` | `outputs/gecko-v2-14-json-export.json` | Gecko v2 exports `monologues` |
| P0-07 | Round-trip real JSON | MUST | done | Import/export adapter | Gecko v2 adapter service | `segments.source_terms` | `test:gecko-v2` on `14.json` and `12 (done).json`; backend real fixture | Edited text appears in exported terms |
| P0-08 | Autosave/reload recovery | MUST | done | localStorage autosave | `PUT /tasks/{id}/autosave` | `transcript_versions` | smoke/manual, backend syntax/tests | UI reload recovery + API autosave snapshot |
| P0-09 | Annotator/verifier workflow | MUST | done | role views, comments, return/accept | `/submit`, `/comments`, `/return`, `/accept` | `tasks`, `verification_comments`, `audit_log` | smoke/manual + backend API coverage | Server-side role dependencies added |
| P1-01 | Terms module | SHOULD | done | Terms screen | `GET /projects/{id}/terms`, `POST /terms` | `terms` | manual/API | Server-backed dictionary endpoint added |
| P1-02 | Analytics | SHOULD | done/prototype | Analytics screen | planned | history/comments | manual/demo | Derived from local state |
| P1-03 | Admin/audit | SHOULD | done/prototype | Admin screen | `GET /audit`, `/backups` | `audit_log` | backend tests/manual | Admin UI local, audit API server-backed |
| P2-01 | AI helper | MAY | mock | AI panel | planned `/ai/suggestions` | AISuggestion | deterministic hints | Explicit mock |
| INF-01 | Docker/PostgreSQL/FastAPI | MUST in ideal prompt | done/partial-db | Dockerfile, compose | FastAPI app, healthcheck, Alembic migration | PostgreSQL schema migration | `npm run test:backend`, `alembic history`, `npm run build` | API currently uses in-memory store for demo runtime; PostgreSQL schema/migration included |
