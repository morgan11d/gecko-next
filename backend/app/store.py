from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

from .models import (
    AuditLogEntry,
    MediaFile,
    Project,
    Segment,
    Speaker,
    Task,
    TaskStatus,
    Term,
    TranscriptVersion,
    User,
    VerificationComment,
)


class InMemoryStore:
    def __init__(self) -> None:
        self.users: dict[str, User] = {}
        self.projects: dict[str, Project] = {}
        self.media: dict[str, MediaFile] = {}
        self.tasks: dict[str, Task] = {}
        self.speakers: dict[str, list[Speaker]] = {}
        self.segments: dict[str, list[Segment]] = {}
        self.terms: dict[str, list[Term]] = {}
        self.comments: dict[str, list[VerificationComment]] = {}
        self.versions: dict[str, list[TranscriptVersion]] = {}
        self.audit_log: list[AuditLogEntry] = []
        self.seed()

    def seed(self) -> None:
        if self.users:
            return

        users = [
            User(id="u-annotator", full_name="Анна Разметчик", email="anna@example.test", role="annotator"),
            User(id="u-verifier", full_name="Виктор Верификатор", email="victor@example.test", role="verifier"),
            User(id="u-supervisor", full_name="София Супервайзер", email="sofia@example.test", role="supervisor"),
            User(id="u-admin", full_name="Админ Gecko", email="admin@example.test", role="admin"),
            User(id="u-ml", full_name="ML инженер", email="ml@example.test", role="ml"),
            User(id="u-customer", full_name="Заказчик", email="customer@example.test", role="customer"),
        ]
        self.users = {user.id: user for user in users}

        project = Project(
            id="project-yadro",
            name="Gecko Next - YADRO speech QA",
            description="Разметка, проверка и экспорт речевых данных",
            customer="YADRO demo",
            deadline=str(date.today() + timedelta(days=5)),
            rules=[
                "Не менять оригинальные имена спикеров без необходимости.",
                "Сохранять границы реплик с точностью до 0.01 сек.",
                "Отмечать кросстолк и спорные термины.",
            ],
        )
        self.projects[project.id] = project

        media = MediaFile(id="media-demo", project_id=project.id, format="not_loaded")
        self.media[media.id] = media

        task = Task(
            id="task-demo",
            project_id=project.id,
            media_file_id=media.id,
            title="Загрузите медиа и Gecko JSON",
            assignee_id="u-annotator",
            verifier_id="u-verifier",
            status=TaskStatus.new,
            priority="high",
            deadline=project.deadline,
        )
        self.tasks[task.id] = task

        self.speakers[task.id] = [
            Speaker(id="SPEAKER_00", task_id=task.id, original_name="SPEAKER_00", display_name="Спикер 1", editable=False),
            Speaker(id="SPEAKER_01", task_id=task.id, original_name="SPEAKER_01", display_name="Спикер 2", editable=False),
        ]
        self.segments[task.id] = []
        self.comments[task.id] = []
        self.versions[task.id] = []
        self.terms[project.id] = []

    def user_by_email(self, email: str) -> User | None:
        normalized = email.strip().lower()
        return next((user for user in self.users.values() if user.email.lower() == normalized), None)

    def task_segments(self, task_id: str) -> list[Segment]:
        return self.segments.setdefault(task_id, [])

    def task_speakers(self, task_id: str) -> list[Speaker]:
        return self.speakers.setdefault(task_id, [])

    def replace_transcript(self, task_id: str, speakers: list[Speaker], segments: list[Segment], author_id: str, label: str) -> TranscriptVersion:
        self.speakers[task_id] = speakers
        self.segments[task_id] = segments
        version = TranscriptVersion(
            id=f"version-{uuid4().hex[:10]}",
            task_id=task_id,
            version=len(self.versions.setdefault(task_id, [])) + 1,
            label=label,
            author_id=author_id,
            source="import",
            segments_snapshot=[segment.model_copy(deep=True) for segment in segments],
            comment=f"{len(segments)} imported segments",
        )
        self.versions[task_id].insert(0, version)
        return version

    def audit(self, user_id: str, entity_type: str, entity_id: str, action: str, old_value: str = "", new_value: str = "") -> None:
        self.audit_log.insert(
            0,
            AuditLogEntry(
                id=f"audit-{uuid4().hex[:10]}",
                user_id=user_id,
                entity_type=entity_type,
                entity_id=entity_id,
                action=action,
                old_value=old_value,
                new_value=new_value,
            ),
        )


store = InMemoryStore()

