# Презентация

## Слайд 1. Проблема

Текущий процесс разметки теряет время и качество: риск несохранения, ручная проверка правил, отдельные списки спорных терминов, непрозрачная верификация.

## Слайд 2. Решение

Gecko Next объединяет waveform-редактор, текст, термины, QA, верификацию, аналитику и AI-подсказки в одном рабочем месте.

## Слайд 3. Сценарий

Загрузка аудио и JSON -> разметка сегментов -> автосохранение -> чек-лист -> проверка -> возврат или приёмка -> экспорт.

## Слайд 4. Что реализовано

WaveSurfer, сегменты, границы 0.01 сек, текст, роли, workflow, термины, проверки, mock AI, аналитика, AuditLog, Gecko JSON export.

## Слайд 5. Архитектура

React + TypeScript + Vite + WaveSurfer.js. Доменная модель соответствует будущему backend: User, Project, Task, MediaFile, Segment, Term, Comment, AuditLog.

## Слайд 6. Качество данных

Автосохранение, история, контроль пересечений, пустых сегментов, confidence, чек-листы, QA-отчёт и экспорт.

## Слайд 7. Демонстрация

Показать live demo: вход, waveform, edit segment, QA, submit, verifier return/accept, export.

## Слайд 8. Roadmap

Backend, PostgreSQL, S3/MinIO, ASR/AI, server-side waveform peaks, dataset versioning, интеграции ML pipeline.
