import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


REAL_GECKO = Path("/Users/mihail/Downloads/14.json")


client = TestClient(app)


def auth_headers() -> dict[str, str]:
    response = client.post("/auth/login", json={"email": "anna@example.test"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.skipif(not REAL_GECKO.exists(), reason="User real Gecko fixture is not available on this machine")
def test_real_gecko_v2_fixture_imports_and_exports_267_monologues() -> None:
    payload = json.loads(REAL_GECKO.read_text(encoding="utf-8"))
    headers = auth_headers()

    imported = client.post("/tasks/task-demo/import/gecko-v2", headers=headers, json=payload)
    assert imported.status_code == 200
    assert imported.json()["imported_segments"] == 267

    exported = client.post("/tasks/task-demo/export/json", headers=headers)
    assert exported.status_code == 200
    assert exported.json()["schemaVersion"] == "2.0"
    assert len(exported.json()["monologues"]) == 267

