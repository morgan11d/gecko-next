from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def auth_headers(email: str = "anna@example.test") -> dict[str, str]:
    response = client.post("/auth/login", json={"email": email})
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def gecko_payload() -> dict:
    return {
        "schemaVersion": "2.0",
        "monologues": [
            {
                "speaker": {"id": "SPEAKER_00", "name": "SPEAKER_00"},
                "terms": [
                    {"text": "Привет", "type": "WORD", "start": 0.1, "end": 0.5},
                    {"text": "мир", "type": "WORD", "start": 0.5, "end": 0.9},
                ],
            },
            {
                "speaker": {"id": "SPEAKER_01", "name": "SPEAKER_01"},
                "terms": [
                    {"text": "Ответ", "type": "WORD", "start": 1.2, "end": 1.7},
                ],
            },
        ],
    }


def test_gecko_v2_import_edit_export_roundtrip() -> None:
    headers = auth_headers()

    imported = client.post("/tasks/task-demo/import/gecko-v2", headers=headers, json=gecko_payload())
    assert imported.status_code == 200
    assert imported.json()["imported_segments"] == 2

    segments = client.get("/tasks/task-demo/segments", headers=headers)
    assert segments.status_code == 200
    first_id = segments.json()[0]["id"]

    updated = client.patch(f"/segments/{first_id}", headers=headers, json={"text": "Привет изменённый мир"})
    assert updated.status_code == 200

    exported = client.post("/tasks/task-demo/export/json", headers=headers)
    assert exported.status_code == 200
    body = exported.json()
    assert body["schemaVersion"] == "2.0"
    assert len(body["monologues"]) == 2
    assert any(term["text"] == "изменённый" for term in body["monologues"][0]["terms"])

