# Gecko Next MVP

Работающий веб-прототип для аудио-/видеоразметки, верификации и контроля качества речевых данных. Проект повторяет базовый workflow Gecko и расширяет его автосохранением, QA-проверками, терминологическим модулем, ролями и экспортом Gecko-compatible JSON.

Публичный прототип: https://morgan11d.github.io/gecko-next/

## Комплект сдачи по требованиям

| Требование | Где находится |
|---|---|
| Работающий веб-прототип | https://morgan11d.github.io/gecko-next/ |
| Исходный код | `src/`, `backend/`, `tests/`, `infra/`, корневые конфиги |
| README с инструкцией по запуску | `README.md` |
| Описание архитектуры | `docs/ARCHITECTURE.md` |
| Схема БД / модель данных | `docs/DATABASE_SCHEMA.md` |
| Описание API | `docs/API.md` |
| Тестовые данные | `data/sample-gecko.json`, `public/demo-audio.wav` |
| Demo-видео | `deliverables/gecko-next-demo.webm` |
| Презентация | `deliverables/gecko-next-defense-presentation.pptx` |
| Описание реализованного функционала | `docs/FEATURES.md` |
| Список известных ограничений | `docs/limitations.md` |
| Список нереализованных, но запланированных функций | `docs/PLANNED_FEATURES.md` |
| Краткий план развития после хакатона | `docs/ROADMAP.md` |

## Запуск frontend

```bash
npm install
npm run dev
```

Откройте локальный адрес, который покажет Vite, обычно `http://127.0.0.1:5173/`.

Production-сборка:

```bash
npm run build
npm run preview
```

## Запуск backend

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
npm run backend:dev
```

AI-ASR в frontend по умолчанию работает без пользовательских ключей: quantized `onnx-community/whisper-tiny` лежит в `public/models` и загружается браузером локально из файлов проекта.

Для более стабильного production-ASR можно дополнительно включить backend-провайдера. В этом случае задайте ключ только на backend:

```bash
OPENAI_API_KEY="sk-..." npm run backend:dev
```

Для опубликованного сайта backend нужен только как опциональный ASR-провайдер повышенной стабильности. Пользователи ключ не вводят.

Docker Compose:

```bash
docker compose up --build
```

## Демо-пользователи

- Анна Разметчик - основной сценарий разметки.
- Виктор Верификатор - проверка, замечания, возврат и приёмка.
- София Супервайзер - контроль статусов и аналитика.
- Админ Gecko - пользователи, правила, аудит.

## Демо-сценарий

1. Войти как разметчик.
2. Импортировать JSON-предразметку через `Аннотация`.
3. Проверить сегменты на waveform, выбрать фрагмент и нажать `Segment`.
4. Изменить текст и границы `Start` / `End`.
5. Проверить QA, термины и AI-подсказки.
6. Отправить задачу на проверку.
7. Войти как верификатор, принять или вернуть задачу.
8. Экспортировать Gecko-compatible JSON.
9. Открыть аналитику и админ-раздел.

## Проверка

```bash
npm run build
npm run test:backend
APP_URL=http://127.0.0.1:5174/ npm run test:smoke
APP_URL=http://127.0.0.1:5174/ npm run test:import
APP_URL=http://127.0.0.1:5174/ npm run test:ui-actions
APP_URL=http://127.0.0.1:5174/ GECKO_JSON="/Users/mihail/Downloads/14.json" GECKO_VIDEO="/Users/mihail/Downloads/14.mp4" npm run test:gecko-v2
```

Пересоздать demo-видео:

```bash
APP_URL=http://127.0.0.1:5174/ npm run demo:video
```
