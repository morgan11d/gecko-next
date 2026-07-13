# API

Проект содержит FastAPI backend в `backend/app/main.py`. Ниже - текущий REST-контракт; часть production-поведения, связанная с постоянной SQLAlchemy persistence, пока реализована через in-memory store для быстрой демонстрации.

## Auth

- `POST /auth/login` - вход по email, выдаёт signed bearer token.
- `GET /auth/me` - текущий пользователь.

## Projects

- `GET /projects` - список проектов.
- `POST /projects` - создание проекта.
- `GET /projects/{id}` - карточка проекта.
- `PUT /projects/{id}` - обновление.
- `DELETE /projects/{id}` - архивирование.

## Tasks

- `GET /tasks` - список задач по роли.
- `POST /tasks` - создание задачи.
- `GET /tasks/{id}` - задача с media, transcript, terms.
- `PUT /tasks/{id}/status` - изменение статуса.
- `POST /tasks/{id}/assign` - назначение исполнителя.
- `POST /tasks/{id}/submit` - отправка на проверку.

## Media

- `POST /media/upload` - загрузка аудио/видео.
- `GET /media/{id}` - получение файла с проверкой доступа.
- `GET /media/{id}/waveform` - cached waveform peaks endpoint.
- `DELETE /media/{id}` - удаление.

## ASR

- `POST /asr/transcribe` - серверное распознавание WAV/аудиофрагмента. Backend берёт `OPENAI_API_KEY` из переменных окружения и возвращает `{ "text": "...", "engine": "gpt-4o-mini-transcribe" }`; ключ не передаётся во frontend.

## Segments

- `GET /tasks/{task_id}/segments` - сегменты задачи.
- `POST /segments` - создание.
- `PUT /segments/{id}` - обновление start/end/text/status.
- `DELETE /segments/{id}` - удаление.
- `POST /segments/{id}/split` - разделение.
- `POST /segments/merge` - объединение.

## Transcripts

- `POST /tasks/{task_id}/import/gecko-v2` - импорт Gecko JSON v2.
- `PUT /tasks/{task_id}/autosave` - серверный autosave snapshot.
- `GET /tasks/{task_id}/transcript` - текущая транскрипция.
- `PUT /segments/{id}/text` - обновление текста.
- `GET /tasks/{task_id}/versions` - версии.
- `POST /tasks/{task_id}/restore` - восстановление версии.

## Terms

- `GET /projects/{id}/terms` - словарь.
- `POST /terms` - добавление.
- `PUT /terms/{id}` - обновление.
- `POST /terms/{id}/approve` - подтверждение.
- `POST /terms/{id}/reject` - отклонение.

## Verification

- `POST /tasks/{id}/comments` - замечание.
- `GET /tasks/{id}/comments` - замечания.
- `POST /tasks/{id}/return` - возврат.
- `POST /tasks/{id}/accept` - приёмка.

## Export

- `POST /tasks/{id}/export/json` - Gecko JSON v2.
- `POST /tasks/{id}/export/report` - QA-отчёт.
- `GET /exports/{id}` - скачивание.

## Analytics

- `GET /analytics/project/{id}` - прогресс проекта.
- `GET /analytics/users` - исполнители.
- `GET /analytics/quality` - качество.
- `GET /analytics/terms` - статистика терминов.

## Ops

- `GET /health` - healthcheck.
- `GET /audit` - последние записи аудита для supervisor/admin.
- `POST /backups` - JSON snapshot для demo/runtime store.
