from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .gecko import export_gecko_v2, import_gecko_v2, seconds
from .models import (
    AnalyticsSummary,
    AutosaveRequest,
    CommentCreate,
    ImportResult,
    LoginRequest,
    MediaFile,
    MergeSegmentsRequest,
    Project,
    RoleName,
    Segment,
    SegmentCreate,
    SegmentPatch,
    SplitSegmentRequest,
    Task,
    TaskStatus,
    Term,
    TermCreate,
    TokenResponse,
    User,
    VerificationComment,
)
from .quality import compute_quality
from .security import VERIFY_ROLES, WRITE_ROLES, create_access_token, ensure_task_reader, get_current_user, require_roles
from .store import store


app = FastAPI(title="Gecko Next API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MEDIA_DIR = Path("/tmp/gecko-next-media")
MEDIA_DIR.mkdir(parents=True, exist_ok=True)


def get_task_or_404(task_id: str) -> Task:
    task = store.tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def get_segment_or_404(segment_id: str) -> tuple[str, Segment]:
    for task_id, segments in store.segments.items():
        for segment in segments:
            if segment.id == segment_id:
                return task_id, segment
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")


def task_has_media(task: Task, media_id: str) -> bool:
    return task.media_file_id == media_id


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "gecko-next-api"}


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    user = store.user_by_email(payload.email)
    if not user or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    store.audit(user.id, "User", user.id, "login")
    return TokenResponse(access_token=create_access_token(user), user=user)


@app.get("/auth/me", response_model=User)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@app.get("/projects", response_model=list[Project])
def list_projects(user: User = Depends(get_current_user)) -> list[Project]:
    if user.role == RoleName.customer:
        return [project for project in store.projects.values() if project.status == "active"]
    return list(store.projects.values())


@app.get("/projects/{project_id}", response_model=Project)
def project_detail(project_id: str, user: User = Depends(get_current_user)) -> Project:
    project = store.projects.get(project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@app.get("/tasks", response_model=list[Task])
def list_tasks(user: User = Depends(get_current_user)) -> list[Task]:
    tasks = list(store.tasks.values())
    return [task for task in tasks if user.role in {RoleName.admin, RoleName.supervisor, RoleName.ml, RoleName.customer} or user.id in {task.assignee_id, task.verifier_id}]


@app.get("/tasks/{task_id}", response_model=Task)
def task_detail(task_id: str, user: User = Depends(get_current_user)) -> Task:
    task = get_task_or_404(task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)
    return task


@app.post("/media/upload", response_model=MediaFile)
async def upload_media(
    project_id: str,
    file: UploadFile = File(...),
    user: User = Depends(require_roles(RoleName.annotator, RoleName.supervisor, RoleName.admin)),
) -> MediaFile:
    if project_id not in store.projects:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    suffix = Path(file.filename or "media.bin").suffix
    media_id = f"media-{uuid4().hex[:10]}"
    target = MEDIA_DIR / f"{media_id}{suffix}"
    target.write_bytes(await file.read())
    media = MediaFile(
        id=media_id,
        project_id=project_id,
        audio_path=str(target) if (file.content_type or "").startswith("audio/") else "",
        video_path=str(target) if (file.content_type or "").startswith("video/") else None,
        format=suffix.lstrip(".") or (file.content_type or "binary"),
    )
    store.media[media.id] = media
    store.audit(user.id, "MediaFile", media.id, "upload", "", file.filename or media.id)
    return media


@app.get("/media/{media_id}")
def download_media(media_id: str, user: User = Depends(get_current_user)) -> FileResponse:
    media = store.media.get(media_id)
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    visible = False
    for task in store.tasks.values():
        if task_has_media(task, media_id):
            ensure_task_reader(user, task.assignee_id, task.verifier_id)
            visible = True
            break
    if not visible:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Media is not attached to a visible task")

    path = Path(media.video_path or media.audio_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media file is missing")
    return FileResponse(path)


@app.get("/media/{media_id}/waveform")
def media_waveform(media_id: str, user: User = Depends(get_current_user)) -> dict:
    media = store.media.get(media_id)
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    for task in store.tasks.values():
        if task_has_media(task, media_id):
            ensure_task_reader(user, task.assignee_id, task.verifier_id)
            break

    duration = max(media.duration, 1)
    buckets = 120
    peaks = [round(((index % 12) / 12) * 0.8 + 0.1, 3) for index in range(buckets)]
    return {"media_id": media_id, "duration": duration, "buckets": buckets, "peaks": peaks, "cached": True}


@app.post("/tasks/{task_id}/import/gecko-v2", response_model=ImportResult)
def import_transcript(
    task_id: str,
    payload: dict,
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> ImportResult:
    task = get_task_or_404(task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)

    try:
        speakers, segments, duration = import_gecko_v2(task_id, payload, store.task_speakers(task_id))
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error

    version = store.replace_transcript(task_id, speakers, segments, user.id, "Gecko v2 import")
    task.status = TaskStatus.in_progress
    media = store.media.get(task.media_file_id)
    if media:
        media.duration = max(media.duration, duration)
    store.audit(user.id, "Transcript", task_id, "import_gecko_v2", "", f"{len(segments)} segments")
    return ImportResult(task_id=task_id, imported_segments=len(segments), speakers=len(speakers), duration=duration, version_id=version.id)


@app.put("/tasks/{task_id}/autosave")
def autosave_transcript(task_id: str, payload: AutosaveRequest, user: User = Depends(require_roles(*WRITE_ROLES))):
    task = get_task_or_404(task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)
    normalized_segments = [segment.model_copy(update={"task_id": task_id}) for segment in payload.segments]
    version = store.replace_transcript(task_id, store.task_speakers(task_id), normalized_segments, user.id, "Autosave")
    version.source = "autosave"
    version.comment = payload.comment
    store.audit(user.id, "Transcript", task_id, "autosave", "", f"{len(normalized_segments)} segments")
    return {"task_id": task_id, "version_id": version.id, "segments": len(normalized_segments)}


@app.get("/tasks/{task_id}/segments", response_model=list[Segment])
def list_segments(task_id: str, user: User = Depends(get_current_user)) -> list[Segment]:
    task = get_task_or_404(task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)
    return sorted(store.task_segments(task_id), key=lambda segment: (segment.start_time, segment.end_time))


@app.post("/segments", response_model=Segment)
def create_segment(payload: SegmentCreate, user: User = Depends(require_roles(*WRITE_ROLES))) -> Segment:
    task = get_task_or_404(payload.task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)
    segment = Segment(id=f"seg-{uuid4().hex[:10]}", **payload.model_dump())
    store.task_segments(payload.task_id).append(segment)
    store.audit(user.id, "Segment", segment.id, "create")
    return segment


@app.patch("/segments/{segment_id}", response_model=Segment)
def update_segment(segment_id: str, payload: SegmentPatch, user: User = Depends(require_roles(*WRITE_ROLES))) -> Segment:
    task_id, segment = get_segment_or_404(segment_id)
    task = get_task_or_404(task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)

    before = segment.model_dump_json()
    patch = payload.model_dump(exclude_unset=True)
    candidate = segment.model_copy(update=patch)
    Segment.model_validate(candidate.model_dump())

    segments = store.task_segments(task_id)
    index = next(i for i, item in enumerate(segments) if item.id == segment_id)
    segments[index] = candidate
    store.audit(user.id, "Segment", segment_id, "update", before, candidate.model_dump_json())
    return candidate


@app.delete("/segments/{segment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_segment(segment_id: str, user: User = Depends(require_roles(*WRITE_ROLES))) -> None:
    task_id, segment = get_segment_or_404(segment_id)
    task = get_task_or_404(task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)
    store.segments[task_id] = [item for item in store.task_segments(task_id) if item.id != segment_id]
    store.audit(user.id, "Segment", segment_id, "delete", segment.model_dump_json())


@app.post("/segments/{segment_id}/split", response_model=list[Segment])
def split_segment(segment_id: str, payload: SplitSegmentRequest, user: User = Depends(require_roles(*WRITE_ROLES))) -> list[Segment]:
    task_id, segment = get_segment_or_404(segment_id)
    task = get_task_or_404(task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)
    if payload.at <= segment.start_time or payload.at >= segment.end_time:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Split point must be inside segment")

    left = segment.model_copy(update={"end_time": seconds(payload.at)})
    right = segment.model_copy(update={"id": f"seg-{uuid4().hex[:10]}", "start_time": seconds(payload.at), "text": "", "source_terms": []})
    segments = []
    for item in store.task_segments(task_id):
        segments.extend([left, right] if item.id == segment_id else [item])
    store.segments[task_id] = segments
    store.audit(user.id, "Segment", segment_id, "split", "", f"{left.id}+{right.id}")
    return [left, right]


@app.post("/segments/merge", response_model=Segment)
def merge_segments(payload: MergeSegmentsRequest, user: User = Depends(require_roles(*WRITE_ROLES))) -> Segment:
    left_task, left = get_segment_or_404(payload.left_id)
    right_task, right = get_segment_or_404(payload.right_id)
    if left_task != right_task:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Segments belong to different tasks")
    task = get_task_or_404(left_task)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)

    merged = left.model_copy(
        update={
            "end_time": max(left.end_time, right.end_time),
            "text": f"{left.text.strip()} {right.text.strip()}".strip(),
            "confidence": min(left.confidence, right.confidence),
            "is_crosstalk": left.is_crosstalk or right.is_crosstalk,
            "source_terms": [],
        }
    )
    store.segments[left_task] = [merged if item.id == left.id else item for item in store.task_segments(left_task) if item.id != right.id]
    store.audit(user.id, "Segment", merged.id, "merge", f"{left.id}+{right.id}", merged.model_dump_json())
    return merged


@app.get("/tasks/{task_id}/quality")
def task_quality(task_id: str, user: User = Depends(get_current_user)):
    task = get_task_or_404(task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)
    return compute_quality(store.task_segments(task_id))


@app.post("/tasks/{task_id}/submit", response_model=Task)
def submit_task(task_id: str, user: User = Depends(require_roles(*WRITE_ROLES))) -> Task:
    task = get_task_or_404(task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)
    critical = [check for check in compute_quality(store.task_segments(task_id)) if check.severity == "critical"]
    if critical:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Critical QA checks must be fixed before submit")
    task.status = TaskStatus.in_review
    store.audit(user.id, "Task", task_id, "submit")
    return task


@app.get("/projects/{project_id}/terms", response_model=list[Term])
def list_terms(project_id: str, user: User = Depends(get_current_user)) -> list[Term]:
    if project_id not in store.projects:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return store.terms.setdefault(project_id, [])


@app.post("/terms", response_model=Term)
def create_term(payload: TermCreate, user: User = Depends(require_roles(RoleName.annotator, RoleName.verifier, RoleName.supervisor, RoleName.admin))) -> Term:
    if payload.project_id not in store.projects:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    term = Term(
        id=f"term-{uuid4().hex[:10]}",
        project_id=payload.project_id,
        value=payload.value,
        normalized_value=payload.value.casefold(),
        type=payload.type,
        status="review",
        annotator_comment=payload.annotator_comment,
    )
    store.terms.setdefault(payload.project_id, []).insert(0, term)
    store.audit(user.id, "Term", term.id, "create", "", term.value)
    return term


@app.post("/tasks/{task_id}/comments", response_model=VerificationComment)
def create_comment(task_id: str, payload: CommentCreate, user: User = Depends(require_roles(*VERIFY_ROLES))) -> VerificationComment:
    task = get_task_or_404(task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)
    comment = VerificationComment(id=f"comment-{uuid4().hex[:10]}", task_id=task_id, author_id=user.id, **payload.model_dump())
    store.comments.setdefault(task_id, []).insert(0, comment)
    store.audit(user.id, "VerificationComment", comment.id, "create", "", comment.text)
    return comment


@app.post("/tasks/{task_id}/return", response_model=Task)
def return_task(task_id: str, user: User = Depends(require_roles(*VERIFY_ROLES))) -> Task:
    task = get_task_or_404(task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)
    task.status = TaskStatus.returned
    task.return_count += 1
    store.audit(user.id, "Task", task_id, "return")
    return task


@app.post("/tasks/{task_id}/accept", response_model=Task)
def accept_task(task_id: str, user: User = Depends(require_roles(*VERIFY_ROLES))) -> Task:
    task = get_task_or_404(task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)
    task.status = TaskStatus.accepted
    store.segments[task_id] = [segment.model_copy(update={"status": "accepted"}) for segment in store.task_segments(task_id)]
    store.audit(user.id, "Task", task_id, "accept")
    return task


@app.post("/tasks/{task_id}/export/json")
def export_json(task_id: str, user: User = Depends(get_current_user)) -> dict:
    task = get_task_or_404(task_id)
    ensure_task_reader(user, task.assignee_id, task.verifier_id)
    payload = export_gecko_v2(store.task_segments(task_id), store.task_speakers(task_id))
    task.status = TaskStatus.exported
    store.audit(user.id, "ExportFile", task_id, "export_gecko_v2", "", f"{len(payload['monologues'])} monologues")
    return payload


@app.post("/backups")
def create_backup(user: User = Depends(require_roles(RoleName.admin, RoleName.supervisor))) -> dict:
    backup_id = f"backup-{uuid4().hex[:10]}"
    path = MEDIA_DIR / f"{backup_id}.json"
    snapshot = {
        "users": [item.model_dump(mode="json") for item in store.users.values()],
        "projects": [item.model_dump(mode="json") for item in store.projects.values()],
        "media": [item.model_dump(mode="json") for item in store.media.values()],
        "tasks": [item.model_dump(mode="json") for item in store.tasks.values()],
        "speakers": {key: [item.model_dump(mode="json") for item in value] for key, value in store.speakers.items()},
        "segments": {key: [item.model_dump(mode="json") for item in value] for key, value in store.segments.items()},
        "terms": {key: [item.model_dump(mode="json") for item in value] for key, value in store.terms.items()},
        "comments": {key: [item.model_dump(mode="json") for item in value] for key, value in store.comments.items()},
    }
    path.write_text(__import__("json").dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    store.audit(user.id, "Backup", backup_id, "create", "", str(path))
    return {"backup_id": backup_id, "path": str(path)}


@app.get("/analytics/project/{project_id}", response_model=AnalyticsSummary)
def analytics(project_id: str, user: User = Depends(get_current_user)) -> AnalyticsSummary:
    if project_id not in store.projects:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project_tasks = [task for task in store.tasks.values() if task.project_id == project_id]
    all_segments = [segment for task in project_tasks for segment in store.task_segments(task.id)]
    comments = [comment for task in project_tasks for comment in store.comments.get(task.id, [])]
    confidence = sum(segment.confidence for segment in all_segments) / len(all_segments) if all_segments else 0
    return AnalyticsSummary(
        project_id=project_id,
        tasks_total=len(project_tasks),
        segments_total=len(all_segments),
        accepted_tasks=sum(1 for task in project_tasks if task.status == TaskStatus.accepted),
        open_comments=sum(1 for comment in comments if comment.status == "open"),
        average_confidence=round(confidence, 3),
    )


@app.get("/audit")
def audit(user: User = Depends(require_roles(RoleName.supervisor, RoleName.admin))):
    return store.audit_log[:200]
