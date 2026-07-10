# Целевая схема данных

Frontend сохраняет быстрый draft в `localStorage`, а backend содержит PostgreSQL-схему в Alembic migration `backend/alembic/versions/0001_initial.py`. Локальный API runtime использует in-memory store для демонстрации без обязательной БД, но таблицы и индексы уже описаны для перехода на SQLAlchemy repository.

## Основные таблицы

| Таблица | Назначение | Ключевые поля |
|---|---|---|
| `users` | Участники процесса | `id`, `full_name`, `email`, `role`, `status`, `created_at` |
| `projects` | Проекты заказчиков | `id`, `name`, `description`, `customer`, `deadline`, `status`, `input_format`, `output_format` |
| `project_rules` | Инструкции проекта | `id`, `project_id`, `rule_text`, `sort_order` |
| `media_files` | Аудио/видео | `id`, `project_id`, `audio_url`, `video_url`, `duration`, `format`, `uploaded_at` |
| `tasks` | Задачи разметки | `id`, `project_id`, `media_file_id`, `title`, `assignee_id`, `verifier_id`, `status`, `priority`, `deadline`, `return_count` |
| `speakers` | Спикеры задачи | `id`, `task_id`, `original_name`, `display_name`, `editable` |
| `segments` | Фрагменты речи | `id`, `task_id`, `speaker_id`, `start_ms`, `end_ms`, `text`, `source_text`, `status`, `confidence`, `is_crosstalk`, `listened`, `source_payload` |
| `terms` | Терминология проекта | `id`, `project_id`, `value`, `normalized_value`, `type`, `status`, `annotator_comment`, `verifier_comment`, `occurrences` |
| `verification_comments` | Замечания проверки | `id`, `task_id`, `segment_id`, `author_id`, `category`, `text`, `status`, `created_at` |
| `checklist_items` | Чек-листы | `id`, `task_id`, `role`, `label`, `done` |
| `quality_checks` | Результаты QA | `id`, `task_id`, `segment_id`, `type`, `result`, `severity`, `message`, `created_at` |
| `transcript_versions` | Версии разметки | `id`, `task_id`, `version`, `label`, `source`, `segments_snapshot`, `author_id`, `comment`, `created_at` |
| `audit_log` | Аудит действий | `id`, `user_id`, `entity_type`, `entity_id`, `action`, `old_value`, `new_value`, `created_at` |

## Связи

- `projects 1 -> N tasks`, `projects 1 -> N media_files`, `projects 1 -> N terms`.
- `tasks 1 -> N segments`, `tasks 1 -> N speakers`, `tasks 1 -> N verification_comments`.
- `segments N -> 1 speakers`.
- `users 1 -> N tasks` через `assignee_id` и `verifier_id`.
- `transcript_versions` хранит immutable-снимки сегментов для восстановления и сравнения.

## Индексы

- `segments(task_id, start_time, end_time)` для быстрого поиска на таймлайне.
- `segments(task_id, speaker_id)` для аналитики по спикерам.
- `terms(project_id, normalized_value)` для проверки терминов.
- `verification_comments(task_id, status)` для очереди проверки.
- `audit_log(entity_type, entity_id, created_at)` для истории изменений.

## Примечания к MVP

- В backend demo runtime `segments_snapshot` хранится в массиве `versions`; Alembic-схема содержит таблицу `transcript_versions`.
- В backend-версии медиа лучше хранить в S3/MinIO, а в БД держать URL и метаданные.
- QA можно пересчитывать на клиенте для мгновенной обратной связи и дублировать на сервере перед финальной выгрузкой.
