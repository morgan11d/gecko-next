from __future__ import annotations

from .models import QualityCheck, Segment


def compute_quality(segments: list[Segment], dirty: bool = False) -> list[QualityCheck]:
    checks: list[QualityCheck] = []
    ordered = sorted(segments, key=lambda segment: (segment.start_time, segment.end_time))

    if not ordered:
        return [
            QualityCheck(
                id="segments-empty",
                type="segments",
                result=False,
                severity="critical",
                message="Нет сегментов для экспорта",
            )
        ]

    for index, segment in enumerate(ordered):
        if not segment.text.strip():
            checks.append(
                QualityCheck(
                    id=f"text-empty-{segment.id}",
                    type="text",
                    result=False,
                    severity="critical",
                    segment_id=segment.id,
                    message=f"Сегмент {segment.id}: пустой текст",
                )
            )

        duration = segment.end_time - segment.start_time
        if duration < 0.15:
            checks.append(
                QualityCheck(
                    id=f"short-{segment.id}",
                    type="boundary",
                    result=False,
                    severity="warning",
                    segment_id=segment.id,
                    message=f"Сегмент {segment.id}: слишком короткая граница",
                )
            )
        if duration > 45:
            checks.append(
                QualityCheck(
                    id=f"long-{segment.id}",
                    type="boundary",
                    result=False,
                    severity="warning",
                    segment_id=segment.id,
                    message=f"Сегмент {segment.id}: слишком длинная реплика",
                )
            )

        if segment.confidence < 0.7:
            checks.append(
                QualityCheck(
                    id=f"confidence-{segment.id}",
                    type="confidence",
                    result=False,
                    severity="warning",
                    segment_id=segment.id,
                    message=f"Сегмент {segment.id}: низкая уверенность ASR",
                )
            )

        previous = ordered[index - 1] if index else None
        if previous and segment.start_time < previous.end_time:
            checks.append(
                QualityCheck(
                    id=f"overlap-{previous.id}-{segment.id}",
                    type="boundary",
                    result=False,
                    severity="critical",
                    segment_id=segment.id,
                    message=f"Пересечение сегментов {previous.id} и {segment.id}",
                )
            )

    if dirty:
        checks.append(
            QualityCheck(
                id="draft-dirty",
                type="autosave",
                result=False,
                severity="warning",
                message="Есть несохранённые изменения",
            )
        )

    if not checks:
        checks.append(
            QualityCheck(
                id="quality-ok",
                type="summary",
                result=True,
                severity="ok",
                message="Критических ошибок не найдено",
            )
        )

    return checks

