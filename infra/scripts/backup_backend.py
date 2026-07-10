from __future__ import annotations

import json
from pathlib import Path

from app.store import store


target = Path("storage/backups/backend-snapshot.json")
target.parent.mkdir(parents=True, exist_ok=True)
snapshot = {
    "users": [item.model_dump(mode="json") for item in store.users.values()],
    "projects": [item.model_dump(mode="json") for item in store.projects.values()],
    "tasks": [item.model_dump(mode="json") for item in store.tasks.values()],
    "segments": {key: [item.model_dump(mode="json") for item in value] for key, value in store.segments.items()},
}
target.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
print(target)

