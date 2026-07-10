from __future__ import annotations

import json
from pathlib import Path


source = Path("storage/backups/backend-snapshot.json")
if not source.exists():
    raise SystemExit("No backup found at storage/backups/backend-snapshot.json")

json.loads(source.read_text(encoding="utf-8"))
print(f"Backup {source} is readable. Production restore is handled by PostgreSQL restore/migrations.")

