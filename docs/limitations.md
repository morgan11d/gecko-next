# Limitations

## Production Gaps

- Backend API is implemented and tested, but runtime persistence currently uses an in-memory repository. PostgreSQL service, Alembic schema and Docker Compose are present; the remaining production step is a SQLAlchemy repository implementation.
- Waveform peaks endpoint is deterministic and cached-shaped for demo use. Production extraction via ffmpeg/PCM aggregation is planned.
- AI assistant is an explicit deterministic mock, not an external ML model.
- Frontend still performs the main demo workflow autonomously through local state/localStorage; API integration points are implemented but not fully wired into every UI action.

## Why This Is Acceptable For Demo

- The required user-facing flow works with real `14.mp4` and `14.json`.
- Gecko v2 real-file round-trip is tested in both browser and backend.
- Docker, backend API, PostgreSQL migration and acceptance evidence are included for judging architecture and further implementation.

