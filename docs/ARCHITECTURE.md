# Архитектура

## Выбор стека

Frontend сделан на React, TypeScript, Vite и WaveSurfer.js. Backend добавлен на FastAPI/Pydantic v2 с Gecko v2 adapter, RBAC dependencies, Docker Compose и Alembic migration под PostgreSQL.

Текущее frontend-хранение drafts - localStorage, а backend demo runtime использует in-memory store. Это оставляет демонстрацию быстрой и воспроизводимой; PostgreSQL-схема и миграция уже есть для production repository.

## Слои

- `src/demoState.ts` - демо-проект, пользователи, задача, сегменты, термины, чек-листы.
- `src/types.ts` - доменная модель данных.
- `src/logic.ts` - проверки качества, AI-hints mock, импорт/экспорт, аналитика, audit/history.
- `src/App.tsx` - UI-модули: вход, разметка, верификация, термины, аналитика, админка.
- `src/styles.css` - адаптивный интерфейс.
- `backend/app/main.py` - FastAPI endpoints.
- `backend/app/gecko.py` - Gecko JSON v2 parser/serializer.
- `backend/app/security.py` - bearer token и RBAC.
- `backend/alembic/versions/0001_initial.py` - PostgreSQL schema migration.
- `docker-compose.yml` - frontend, backend, PostgreSQL.
- `public/demo-audio.wav` - демо-медиа.
- `data/sample-gecko.json` - демо-предразметка.

## Модель данных

Ключевые сущности повторяют ТЗ:

- `User`: fullName, email, role, status.
- `Project`: name, customer, deadline, rules, formats.
- `Task`: assignee, verifier, status, priority, deadline, returnCount.
- `MediaFile`: audioPath, videoPath, duration, format.
- `Segment`: startTime, endTime, text, sourceText, speakerId, status, confidence, isCrosstalk.
- `Speaker`: originalName, displayName, editable.
- `Term`: value, normalizedValue, type, status, comments.
- `VerificationComment`: segmentId, category, text, status.
- `AuditLogEntry`: userId, entityType, entityId, action, oldValue, newValue.
- `HistoryEntry`: action, target, before, after.

## Поток данных

1. Пользователь выбирает роль на экране входа.
2. Задача переходит в рабочий статус.
3. WaveSurfer загружает аудио и отображает waveform.
4. Редактирование сегментов меняет состояние React.
5. Автосохранение пишет снимок в localStorage.
6. Контроль качества пересчитывается из текущего состояния.
7. Верификатор создаёт замечания или принимает задачу.
8. Экспорт формирует Gecko-compatible JSON.

## Backend

FastAPI слой покрывает:

- auth/me/login;
- media upload/download/waveform;
- Gecko v2 import/export;
- segment CRUD/split/merge;
- server autosave;
- verification comments, return, accept;
- terms, analytics, audit, backup.

Следующий production-шаг - заменить in-memory repository на SQLAlchemy/PostgreSQL runtime persistence по уже созданной Alembic-схеме.
