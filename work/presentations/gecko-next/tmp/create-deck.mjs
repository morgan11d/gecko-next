import fs from 'node:fs/promises';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const out = '/Users/mihail/Documents/Codex/2026-07-10/c/outputs/gecko-next-presentation.pptx';
const previewDir = '/Users/mihail/Documents/Codex/2026-07-10/c/work/presentations/gecko-next/tmp/preview';
const screenshot = '/Users/mihail/Documents/Codex/2026-07-10/c/outputs/smoke-workspace.png';

async function writeBlob(path, blob) {
  await fs.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
}

async function readImageBlob(path) {
  const bytes = await fs.readFile(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function addText(slide, text, position, style = {}) {
  const shape = slide.shapes.add({
    geometry: 'textbox',
    position,
    fill: 'none',
    line: { style: 'solid', fill: 'none', width: 0 }
  });
  shape.text = text;
  shape.text.style = {
    fontSize: 22,
    color: '#17212f',
    ...style
  };
  return shape;
}

function addTitle(slide, title, subtitle) {
  addText(slide, title, { left: 64, top: 52, width: 840, height: 72 }, { fontSize: 38, bold: true, color: '#17212f' });
  if (subtitle) addText(slide, subtitle, { left: 66, top: 114, width: 980, height: 44 }, { fontSize: 18, color: '#5e6d7f' });
}

function addPill(slide, text, left, top, width, fill = '#e0f3e9', color = '#176744') {
  const box = slide.shapes.add({
    geometry: 'roundRect',
    position: { left, top, width, height: 34 },
    fill,
    line: { style: 'solid', fill, width: 1 },
    borderRadius: 'rounded-md'
  });
  box.text = text;
  box.text.style = { fontSize: 15, bold: true, color, alignment: 'center' };
}

function addPanel(slide, title, body, left, top, width, height, accent = '#168f86') {
  slide.shapes.add({
    geometry: 'roundRect',
    position: { left, top, width, height },
    fill: '#ffffff',
    line: { style: 'solid', fill: '#d8e1e8', width: 1 },
    borderRadius: 'rounded-md'
  });
  slide.shapes.add({
    geometry: 'rect',
    position: { left, top, width: 6, height },
    fill: accent,
    line: { style: 'solid', fill: accent, width: 0 }
  });
  addText(slide, title, { left: left + 20, top: top + 16, width: width - 36, height: 34 }, { fontSize: 22, bold: true });
  addText(slide, body, { left: left + 20, top: top + 58, width: width - 36, height: height - 68 }, { fontSize: 16, color: '#4b5a69' });
}

const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

{
  const slide = deck.slides.add();
  slide.background.fill = '#f3f6f8';
  addText(slide, 'Gecko Next', { left: 72, top: 118, width: 720, height: 92 }, { fontSize: 58, bold: true });
  addText(slide, 'Веб-платформа разметки, верификации и контроля качества речевых данных', { left: 76, top: 218, width: 760, height: 72 }, { fontSize: 24, color: '#4f6174' });
  addPill(slide, 'Waveform', 76, 338, 138);
  addPill(slide, 'QA', 230, 338, 78, '#e7e9ff', '#3441a4');
  addPill(slide, 'Terms', 324, 338, 100, '#fff2cf', '#815500');
  addPill(slide, 'Verifier workflow', 440, 338, 184);
  addPanel(slide, 'Хакатонный результат', 'Работающий MVP закрывает сценарий загрузка -> разметка -> проверка -> экспорт и добавляет функции сверх Gecko.', 770, 116, 390, 244, '#5665d9');
}

{
  const slide = deck.slides.add();
  slide.background.fill = '#ffffff';
  addTitle(slide, 'Главная боль процесса - качество теряется между инструментами', 'ТЗ требует не макет, а управляемый workflow подготовки данных для ML/ASR.');
  addPanel(slide, 'Риск потери правок', 'Автосохранение, версии и история исправлений защищают работу разметчика.', 72, 210, 340, 210);
  addPanel(slide, 'Ручные проверки', 'Контроль качества ищет пустые сегменты, пересечения, короткие реплики, термины и низкий confidence.', 470, 210, 340, 210, '#b97800');
  addPanel(slide, 'Разрозненная верификация', 'Замечания, возврат, принятие и AuditLog находятся в одном продукте.', 868, 210, 340, 210, '#5665d9');
}

{
  const slide = deck.slides.add();
  slide.background.fill = '#f8fafb';
  addTitle(slide, 'Рабочее место объединяет waveform, сегменты, текст и качество', 'Разметчик исправляет предразметку, не покидая основного экрана.');
  const image = await readImageBlob(screenshot);
  slide.images.add({
    blob: image,
    contentType: 'image/png',
    alt: 'Скриншот рабочего места Gecko Next',
    position: { left: 74, top: 178, width: 1132, height: 472 },
    fit: 'cover',
    crop: { left: 0, top: 0, right: 0, bottom: 0.4 }
  });
}

{
  const slide = deck.slides.add();
  slide.background.fill = '#ffffff';
  addTitle(slide, 'MVP закрывает обязательный сценарий от импорта до экспорта', 'Показан путь пользователя, который жюри сможет проверить live.');
  const steps = [
    ['1', 'Загрузка', 'audio/video + JSON/CSV/RTTM/CTM'],
    ['2', 'Разметка', 'текст, start/end, split/merge/delete'],
    ['3', 'QA', 'чек-лист + автоматические проверки'],
    ['4', 'Проверка', 'замечания, возврат или приёмка'],
    ['5', 'Экспорт', 'Gecko JSON + QA report']
  ];
  steps.forEach((step, index) => {
    const left = 72 + index * 234;
    addPill(slide, step[0], left, 220, 44, '#17212f', '#ffffff');
    addText(slide, step[1], { left, top: 280, width: 190, height: 34 }, { fontSize: 24, bold: true });
    addText(slide, step[2], { left, top: 322, width: 198, height: 70 }, { fontSize: 16, color: '#5e6d7f' });
  });
}

{
  const slide = deck.slides.add();
  slide.background.fill = '#ffffff';
  addTitle(slide, 'Мы сохранили сильные паттерны gong-io/gecko и расширили их', 'Оригинальный Gecko полезен как исторический референс, но сам проект deprecated с ноября 2025.');
  addPanel(slide, 'Из Gecko', 'WaveSurfer, редактирование ASR/VAD/diarization, несколько источников аннотаций, сравнение файлов, форматы RTTM/CTM/JSON/CSV, горячие клавиши.', 72, 202, 520, 286, '#168f86');
  addPanel(slide, 'Сверх Gecko', 'Роли, workflow верификации, чек-листы, терминологический модуль, mock AI, аналитика, AuditLog, версии и восстановление.', 688, 202, 520, 286, '#5665d9');
}

{
  const slide = deck.slides.add();
  slide.background.fill = '#f8fafb';
  addTitle(slide, 'Архитектура готова к backend-эволюции', 'В MVP состояние локальное, но доменная модель повторяет будущие API и БД.');
  addPanel(slide, 'Frontend', 'React, TypeScript, Vite, WaveSurfer.js. Компоненты разделены на разметку, верификацию, термины, аналитику и администрирование.', 72, 198, 330, 270);
  addPanel(slide, 'Data model', 'User, Project, Task, MediaFile, Segment, Speaker, Term, Comment, QualityCheck, AuditLog, TranscriptVersion.', 474, 198, 330, 270, '#b97800');
  addPanel(slide, 'Next backend', 'FastAPI/NestJS, PostgreSQL, S3/MinIO, Redis/Celery, JWT, server-side waveform peaks и ASR integration.', 876, 198, 330, 270, '#5665d9');
}

{
  const slide = deck.slides.add();
  slide.background.fill = '#ffffff';
  addTitle(slide, 'Критерии приёмки закрыты проверяемыми артефактами', 'Команда может показывать не обещания, а работающие функции и файлы.');
  const rows = [
    ['Gecko coverage', 'waveform, сегменты, текст, экспорт'],
    ['Сегменты', 'create, edit, delete, split, merge'],
    ['Данные', 'import/export, versions, autosave'],
    ['Workflow', 'submit, comments, return, accept'],
    ['Новые функции', 'terms, QA, AI mock, analytics']
  ];
  rows.forEach((row, index) => {
    const top = 188 + index * 78;
    addPanel(slide, row[0], row[1], 110, top, 1040, 56, index % 2 ? '#5665d9' : '#168f86');
  });
}

{
  const slide = deck.slides.add();
  slide.background.fill = '#17212f';
  addText(slide, 'Что показываем жюри', { left: 72, top: 72, width: 780, height: 72 }, { fontSize: 44, bold: true, color: '#ffffff' });
  addText(slide, '1. Вход разметчика\\n2. Импорт аннотации и видимые сегменты\\n3. Правка текста и границ\\n4. QA и термины\\n5. Отправка на проверку\\n6. Вход верификатора, принятие\\n7. Экспорт JSON и аналитика', { left: 82, top: 180, width: 640, height: 360 }, { fontSize: 24, color: '#dce6ef' });
  addPanel(slide, 'Готовые файлы', 'README, архитектура, API, матрица соответствия, пользовательская инструкция, демо-данные, видео-демо и презентация.', 760, 190, 390, 220, '#168f86');
}

await fs.mkdir(previewDir, { recursive: true });
for (const [index, slide] of deck.slides.items.entries()) {
  const png = await deck.export({ slide, format: 'png', scale: 1 });
  await writeBlob(`${previewDir}/slide-${String(index + 1).padStart(2, '0')}.png`, png);
}

const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(out);
console.log(out);
