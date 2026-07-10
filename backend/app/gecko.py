from __future__ import annotations

import copy
import re
from typing import Any

from .models import Segment, Speaker


def seconds(value: Any) -> float:
    try:
        return round(float(value), 3)
    except (TypeError, ValueError):
        return 0.0


def is_gecko_v2_payload(payload: dict[str, Any]) -> bool:
    return str(payload.get("schemaVersion", "")) == "2.0" and isinstance(payload.get("monologues"), list)


def compose_terms_text(terms: list[dict[str, Any]]) -> str:
    words = [str(term.get("text", "")).strip() for term in terms if str(term.get("text", "")).strip()]
    return " ".join(words).replace(" ,", ",").replace(" .", ".").replace(" !", "!").replace(" ?", "?")


def ensure_speaker(existing: list[Speaker], task_id: str, speaker_id: str, speaker_name: str | None = None) -> tuple[list[Speaker], Speaker]:
    for speaker in existing:
        if speaker.id == speaker_id or speaker.original_name == speaker_id:
            return existing, speaker

    created = Speaker(
        id=speaker_id,
        task_id=task_id,
        original_name=speaker_id,
        display_name=speaker_name or speaker_id,
        editable=False,
    )
    return [*existing, created], created


def import_gecko_v2(task_id: str, payload: dict[str, Any], existing_speakers: list[Speaker]) -> tuple[list[Speaker], list[Segment], float]:
    if not is_gecko_v2_payload(payload):
        raise ValueError("Expected Gecko JSON v2: schemaVersion=2.0 and monologues[]")

    speakers = [speaker.model_copy(deep=True) for speaker in existing_speakers]
    segments: list[Segment] = []
    max_end = 0.0

    for index, monologue in enumerate(payload["monologues"]):
        if not isinstance(monologue, dict):
            continue

        speaker_record = monologue.get("speaker") if isinstance(monologue.get("speaker"), dict) else {}
        speaker_id = str(speaker_record.get("id") or speaker_record.get("name") or f"SPEAKER_{index + 1:02d}")
        speaker_name = str(speaker_record.get("name") or speaker_record.get("id") or speaker_id)
        speakers, speaker = ensure_speaker(speakers, task_id, speaker_id, speaker_name)

        raw_terms = monologue.get("terms") if isinstance(monologue.get("terms"), list) else []
        terms = [term for term in raw_terms if isinstance(term, dict)]
        starts = [seconds(term.get("start")) for term in terms if term.get("start") is not None]
        ends = [seconds(term.get("end")) for term in terms if term.get("end") is not None]
        start = min(starts) if starts else seconds(monologue.get("start") or monologue.get("startTime"))
        end = max(ends) if ends else seconds(monologue.get("end") or monologue.get("endTime") or start + 0.2)
        if end <= start:
            end = start + 0.2

        text = str(monologue.get("text") or compose_terms_text(terms)).strip()
        extra = copy.deepcopy(monologue)
        extra.pop("speaker", None)
        extra.pop("terms", None)
        extra.pop("text", None)

        speaker_extra = copy.deepcopy(speaker_record)
        speaker_extra.pop("id", None)
        speaker_extra.pop("name", None)

        segment = Segment(
            id=str(monologue.get("id") or f"mono-{index + 1}"),
            task_id=task_id,
            start_time=start,
            end_time=end,
            text=text,
            source_text=text,
            speaker_id=speaker.id,
            confidence=float(monologue.get("confidence") or 1),
            is_crosstalk="+" in speaker_id,
            source_format="gecko-v2",
            source_index=index,
            source_speaker={"id": speaker_id, "name": speaker_name},
            source_terms=copy.deepcopy(terms),
            source_extra=extra,
            source_speaker_extra=speaker_extra,
        )
        segments.append(segment)
        max_end = max(max_end, end)

    segments.sort(key=lambda segment: (segment.start_time, segment.end_time))
    return speakers, segments, seconds(max_end)


def build_terms_from_text(text: str, start: float, end: float) -> list[dict[str, Any]]:
    words = re.findall(r"\S+", text.strip())
    if not words:
        return []

    duration = max(end - start, 0.05)
    step = duration / len(words)
    return [
        {
            "text": word,
            "type": "WORD",
            "start": seconds(start + index * step),
            "end": seconds(start + (index + 1) * step),
        }
        for index, word in enumerate(words)
    ]


def terms_match_text(terms: list[dict[str, Any]], text: str) -> bool:
    return compose_terms_text(terms).strip() == text.strip()


def export_gecko_v2(segments: list[Segment], speakers: list[Speaker]) -> dict[str, Any]:
    speaker_map = {speaker.id: speaker for speaker in speakers}
    monologues: list[dict[str, Any]] = []

    for index, segment in enumerate(sorted(segments, key=lambda item: (item.start_time, item.end_time))):
        speaker = speaker_map.get(segment.speaker_id)
        source_speaker = copy.deepcopy(segment.source_speaker or {})
        speaker_id = str(source_speaker.get("id") or (speaker.original_name if speaker else segment.speaker_id))
        speaker_name = str(source_speaker.get("name") or (speaker.display_name if speaker else speaker_id))
        speaker_payload = {
            **copy.deepcopy(segment.source_speaker_extra),
            "id": speaker_id,
            "name": speaker_name,
        }

        terms = copy.deepcopy(segment.source_terms) if terms_match_text(segment.source_terms, segment.text) else build_terms_from_text(segment.text, segment.start_time, segment.end_time)
        monologue = {
            **copy.deepcopy(segment.source_extra),
            "id": segment.id or f"mono-{index + 1}",
            "speaker": speaker_payload,
            "terms": terms,
        }
        monologues.append(monologue)

    return {"schemaVersion": "2.0", "monologues": monologues}
