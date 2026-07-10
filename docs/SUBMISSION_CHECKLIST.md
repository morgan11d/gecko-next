# Комплект сдачи

Список собран по пункту PDF “что ожидается от участников”.

| Ожидаемый артефакт | Где находится |
|---|---|
| Работающий веб-прототип | Локально `http://127.0.0.1:5174/`, production build в `dist/` |
| Исходный код | Корень проекта: `src/`, `public/`, `data/`, `tests/`, `package.json` |
| README и запуск | `README.md` |
| Архитектура | `docs/ARCHITECTURE.md` |
| Схема данных / БД | `docs/DATABASE_SCHEMA.md` |
| API | `docs/API.md` |
| Матрица соответствия критериям | `docs/ACCEPTANCE_MATRIX.md` |
| Анализ Gecko | `docs/GECKO_REFERENCE.md` |
| Тестовые данные | `public/demo-audio.wav`, `data/sample-gecko.json` |
| Видео-демо | `outputs/gecko-next-demo.webm` |
| Презентация | `outputs/gecko-next-presentation.pptx`, `docs/PRESENTATION.md` |
| Реализованные функции и ограничения | `docs/FEATURES.md` |
| Roadmap | `docs/ROADMAP.md` |
| Пользовательская инструкция | `docs/USER_GUIDE.md` |
| Примеры экспорта | `outputs/demo-export.json`, `outputs/smoke-export.json` |

## Что демонстрировать жюри

1. Вход разметчика.
2. Импорт `data/sample-gecko.json`.
3. Видимые `source/current` сегменты на waveform-дорожке.
4. Редактирование текста, start/end, split/merge/delete.
5. Автосохранение, версии и восстановление.
6. QA-проверки, чек-лист, термины, AI-подсказки.
7. Отправка на проверку.
8. Вход верификатора, замечание, возврат или приёмка.
9. Экспорт Gecko JSON и QA report.
10. Аналитика и AuditLog.
