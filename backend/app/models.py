from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class RoleName(str, Enum):
    annotator = "annotator"
    verifier = "verifier"
    supervisor = "supervisor"
    admin = "admin"
    ml = "ml"
    customer = "customer"


class TaskStatus(str, Enum):
    new = "Новая"
    assigned = "Назначена"
    in_progress = "В работе"
    in_review = "На проверке"
    returned = "На доработке"
    fixed = "Исправлена"
    accepted = "Принята"
    exported = "Выгружена"


class SegmentStatus(str, Enum):
    new = "new"
    checked = "checked"
    disputed = "disputed"
    returned = "returned"
    accepted = "accepted"


class User(BaseModel):
    id: str
    full_name: str
    email: str
    role: RoleName
    status: Literal["active", "blocked"] = "active"


class Project(BaseModel):
    id: str
    name: str
    description: str = ""
    customer: str
    deadline: str
    status: Literal["active", "archived"] = "active"
    rules: list[str] = Field(default_factory=list)
    input_format: str = "audio/video + Gecko JSON"
    output_format: str = "Gecko JSON v2"


class MediaFile(BaseModel):
    id: str
    project_id: str
    audio_path: str = ""
    video_path: str | None = None
    duration: float = 0
    format: str = ""
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)


class Task(BaseModel):
    id: str
    project_id: str
    media_file_id: str
    title: str
    assignee_id: str
    verifier_id: str
    status: TaskStatus = TaskStatus.new
    priority: Literal["low", "normal", "high"] = "normal"
    deadline: str
    listened_seconds: float = 0
    return_count: int = 0


class Speaker(BaseModel):
    id: str
    task_id: str
    original_name: str
    display_name: str
    editable: bool = True


class GeckoV2Speaker(BaseModel):
    id: str | None = None
    name: str | None = None

    model_config = {"extra": "allow"}


class GeckoV2Term(BaseModel):
    text: str
    type: str = "WORD"
    start: float
    end: float

    model_config = {"extra": "allow"}


class Segment(BaseModel):
    id: str
    task_id: str
    start_time: float
    end_time: float
    text: str = ""
    source_text: str = ""
    speaker_id: str
    status: SegmentStatus = SegmentStatus.new
    confidence: float = 1
    is_crosstalk: bool = False
    listened: bool = False
    verifier_comment: str | None = None
    crosstalk_comment: str | None = None
    source_format: Literal["gecko-v2", "flat"] | None = None
    source_index: int | None = None
    source_speaker: dict[str, Any] | None = None
    source_terms: list[dict[str, Any]] = Field(default_factory=list)
    source_extra: dict[str, Any] = Field(default_factory=dict)
    source_speaker_extra: dict[str, Any] = Field(default_factory=dict)

    @field_validator("end_time")
    @classmethod
    def end_after_start(cls, value: float, info: Any) -> float:
        start = info.data.get("start_time", 0)
        if value <= start:
            raise ValueError("end_time must be greater than start_time")
        return value


class Term(BaseModel):
    id: str
    project_id: str
    value: str
    normalized_value: str
    type: Literal["product", "extension", "abbreviation", "foreign", "slang", "unknown"] = "unknown"
    status: Literal["new", "review", "approved", "rejected", "disputed"] = "new"
    annotator_comment: str = ""
    verifier_comment: str = ""
    occurrences: int = 0


class TermCreate(BaseModel):
    project_id: str
    value: str
    type: Literal["product", "extension", "abbreviation", "foreign", "slang", "unknown"] = "unknown"
    annotator_comment: str = ""


class VerificationComment(BaseModel):
    id: str
    task_id: str
    segment_id: str | None = None
    author_id: str
    category: Literal["text", "boundary", "term", "crosstalk", "workflow"] = "workflow"
    text: str
    status: Literal["open", "resolved"] = "open"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CommentCreate(BaseModel):
    segment_id: str | None = None
    category: Literal["text", "boundary", "term", "crosstalk", "workflow"] = "workflow"
    text: str


class TranscriptVersion(BaseModel):
    id: str
    task_id: str
    version: int
    label: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    author_id: str
    source: Literal["import", "autosave", "export", "restore"] = "import"
    segments_snapshot: list[Segment]
    comment: str = ""


class AuditLogEntry(BaseModel):
    id: str
    user_id: str
    entity_type: str
    entity_id: str
    action: str
    old_value: str = ""
    new_value: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class QualityCheck(BaseModel):
    id: str
    type: str
    result: bool
    message: str
    severity: Literal["ok", "warning", "critical"]
    segment_id: str | None = None


class LoginRequest(BaseModel):
    email: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


class SegmentCreate(BaseModel):
    task_id: str
    start_time: float
    end_time: float
    text: str = ""
    speaker_id: str
    confidence: float = 1
    is_crosstalk: bool = False


class SegmentPatch(BaseModel):
    start_time: float | None = None
    end_time: float | None = None
    text: str | None = None
    speaker_id: str | None = None
    status: SegmentStatus | None = None
    confidence: float | None = None
    is_crosstalk: bool | None = None
    listened: bool | None = None
    verifier_comment: str | None = None
    crosstalk_comment: str | None = None


class SplitSegmentRequest(BaseModel):
    at: float


class MergeSegmentsRequest(BaseModel):
    left_id: str
    right_id: str


class AutosaveRequest(BaseModel):
    segments: list[Segment]
    comment: str = "Autosave snapshot"


class ImportResult(BaseModel):
    task_id: str
    imported_segments: int
    speakers: int
    duration: float
    version_id: str


class AnalyticsSummary(BaseModel):
    project_id: str
    tasks_total: int
    segments_total: int
    accepted_tasks: int
    open_comments: int
    average_confidence: float
