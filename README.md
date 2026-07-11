# Gecko Next MVP

Рабочая веб-платформа сервиса аудио-/видеоразметки, верификации и контроля качества речевых данных по ТЗ хакатона. В проекте есть React/Vite frontend, FastAPI backend, Gecko v2 import/export adapter, Docker Compose, PostgreSQL schema migration and real-file tests.

## Что реализовано

- Роли: разметчик, верификатор, супервайзер, администратор.
- Рабочее место разметчика: WaveSurfer waveform, плеер, play segment, zoom, скорость, pre/post-roll, loop segment.
- Сегменты: просмотр, выбор, создание, удаление, разделение, объединение, редактирование start/end с точностью 0.01 сек.
- Аудиолиния: speaker-colored фрагменты поверх waveform, drag-создание нового фрагмента и растягивание границ ручками слева/справа.
- Текст: редактирование, undo/redo, автосохранение в localStorage, индикатор сохранения.
- Импорт: аудио, видео, Gecko-compatible JSON v2 (`schemaVersion/monologues/terms`), плоский JSON, CSV, RTTM, CTM.
- Экспорт: Gecko-compatible JSON v2 и QA-отчёт.
- Workflow: отправка на проверку, замечания, возврат на доработку, приёмка, статусы задачи.
- Терминология: словарь проекта, спорные термины, статусы, поиск, добавление из текста.
- Контроль качества: пустые сегменты, порядок времени, пересечения, короткие/длинные сегменты, низкий ASR confidence, регистр, термины, чек-лист, несохранённые изменения.
- Mock AI: подсказки по низкой уверенности, коротким репликам, регистру и терминам.
- Аналитика: прогресс, качество, замечания, возвраты, confidence по сегментам.
- Backend API: auth token, RBAC, media endpoints, autosave, segment CRUD, terms, verification, analytics, audit, backup.
- Инфраструктура: Dockerfile, backend Dockerfile, Docker Compose, PostgreSQL service, Alembic migration, CI workflow.

## Запуск

```bash
npm install
npm run dev
```

Откройте локальный адрес, который покажет Vite, обычно `http://127.0.0.1:5173/`.

Для production-сборки:

```bash
npm run build
npm run preview
```

Backend API локально:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
npm run backend:dev
```

Docker Compose:

```bash
docker compose up --build
```

## Демо-пользователи

- Анна Разметчик - основной сценарий разметки.
- Виктор Верификатор - проверка, замечания, возврат и приёмка.
- София Супервайзер - контроль статусов и аналитика.
- Админ Gecko - пользователи, правила, аудит.

## Демо-сценарий для защиты

1. Войти как разметчик.
2. Загрузить свой MP4/аудио через `Видео` или `Аудио`.
3. Импортировать Gecko JSON v2 через `Аннотация`, например `/Users/mihail/Downloads/14.json`.
4. Показать сегменты прямо поверх waveform и две дорожки `source/current` под ним.
5. Выбрать сегмент, нажать `Segment`, изменить текст или границы start/end.
6. Показать автосохранение, снимки версий и undo/redo.
7. Открыть контроль качества и чек-лист.
8. Отправить задачу на проверку.
9. Войти как верификатор, добавить замечание, вернуть на доработку или принять.
10. Экспортировать Gecko JSON v2 и QA-отчёт.
11. Открыть аналитику и AuditLog.

## Видео-демо

Готовый пример работы сохранён в `deliverables/gecko-next-demo.webm` и локально дублируется в `outputs/gecko-next-demo.webm`. Ролик показывает актуальный полный сценарий: вход разметчика, импорт JSON, сегменты на waveform, точное `Segment`-воспроизведение, правка текста и границ, термины, отправка на проверку, вход верификатора, приёмка, экспорт, аналитика и админ-функции.

Пересоздать ролик можно командой:

```bash
APP_URL=http://127.0.0.1:5174/ npm run demo:video
```

## Тестовые данные

- Приложение стартует с пустой рабочей областью и ждёт пользовательские медиа + JSON.
- `data/sample-gecko.json` и `demo-data/annotations/*` оставлены только как тестовые fixtures.
- Поддерживаемые форматы предразметки: Gecko JSON v2, плоский JSON, CSV, RTTM, CTM.

## Документация

- `docs/ARCHITECTURE.md` - архитектура и модель данных.
- `docs/DATABASE_SCHEMA.md` - целевая схема БД для backend-версии.
- `docs/API.md` - целевой API.
- `docs/ACCEPTANCE_MATRIX.md` - матрица соответствия PDF-критериям.
- `docs/GECKO_REFERENCE.md` - анализ `gong-io/gecko`.
- `docs/FEATURES.md` - реализованные функции и ограничения.
- `docs/USER_GUIDE.md` - пользовательская инструкция и сценарий показа.
- `docs/ROADMAP.md` - развитие после хакатона.
- `docs/PRESENTATION.md` - структура презентации.
- `docs/SUBMISSION_CHECKLIST.md` - комплект артефактов для сдачи.
- `docs/demo-script.md` - сценарий живого показа.
- `docs/limitations.md` - честные production-ограничения.
- `docs/backup-restore.md` - backup/restore команды.

## Проверка

```bash
npm run build
npm run test:backend
APP_URL=http://127.0.0.1:5174/ npm run test:smoke
APP_URL=http://127.0.0.1:5174/ npm run test:import
APP_URL=http://127.0.0.1:5174/ GECKO_JSON="/Users/mihail/Downloads/14.json" GECKO_VIDEO="/Users/mihail/Downloads/14.mp4" npm run test:gecko-v2
```

Проверка миграций:

```bash
.venv/bin/alembic -c backend/alembic.ini history
```

## Артефакты для защиты

- `deliverables/gecko-next-defense-presentation.pptx` - отдельная русская презентация для защиты.
- `deliverables/gecko-next-demo.webm` - актуальное видео-демо полного сценария.
- `outputs/gecko-next-presentation.pptx` - презентация.
- `outputs/smoke-workspace.png` - скриншот рабочего места.
- `outputs/gecko-v2-14-json-waveform-speakers.png` - проверочный скриншот реального `14.json` с цветами спикеров.
- `outputs/gecko-v2-14-json-export.json` и `outputs/gecko-v2-12-done-json-export.json` - реальные Gecko v2 экспорты.
