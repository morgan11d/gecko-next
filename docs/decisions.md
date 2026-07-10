# Decisions

## 2026-07-10

- Existing React/Vite/WaveSurfer prototype is preserved instead of a full rewrite, because it already covers the live annotation workflow and the user asked to fix real import/export and waveform visibility first.
- The app now starts from an empty work area instead of preloaded demo segments. Demo fixtures remain in the repository only for repeatable tests and documentation.
- Gecko JSON v2 is treated as a first-class format: `schemaVersion: "2.0"` + `monologues/terms` imports into internal segments and exports back to `monologues`.
- Unknown monologue/speaker/term fields are preserved in segment source metadata where possible. Edited text regenerates valid WORD/PUNCTUATION terms.
- Segment visualization is duplicated intentionally: editable regions are shown directly over the waveform, and the lower `source/current` rail remains for overview and comparison.
- Full backend/PostgreSQL/Docker from the ideal prompt is not claimed as complete in this pass. It remains documented as a P0 gap against that stricter prompt.
