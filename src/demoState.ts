import type { AppState, ChecklistItem } from './types';

export const annotatorChecklistPreset: ChecklistItem[] = [
  { id: 'listened', label: 'Запись прослушана до конца', done: false },
  { id: 'segments', label: 'Все сегменты проверены', done: false },
  { id: 'boundaries', label: 'Границы сегментов исправлены', done: false },
  { id: 'cutWords', label: 'Обрезанные слова проверены', done: false },
  { id: 'missingSpeech', label: 'Пропущенная речь добавлена', done: false },
  { id: 'badMarkup', label: 'Некорректная разметка удалена', done: false },
  { id: 'crosstalk', label: 'Кросстолки обработаны', done: false },
  { id: 'shortReplies', label: 'Значимые короткие реплики добавлены', done: false },
  { id: 'terms', label: 'Термины проверены', done: false },
  { id: 'disputedTerms', label: 'Спорные термины зафиксированы', done: false },
  { id: 'saved', label: 'Несохранённых изменений нет', done: false }
];

export const verifierChecklistPreset: ChecklistItem[] = [
  { id: 'matchAudio', label: 'Соответствие текста аудио', done: false },
  { id: 'boundaries', label: 'Корректность границ', done: false },
  { id: 'missingSpeech', label: 'Наличие пропущенной речи', done: false },
  { id: 'terms', label: 'Корректность терминов', done: false },
  { id: 'rules', label: 'Соблюдение правил текста', done: false },
  { id: 'crosstalk', label: 'Корректность обработки кросстолков', done: false },
  { id: 'empty', label: 'Отсутствие пустых и ошибочных сегментов', done: false },
  { id: 'returns', label: 'Обработка замечаний после возврата', done: false }
];

export const demoState: AppState = {
  users: [
    {
      id: 'u-annotator',
      fullName: 'Анна Разметчик',
      email: 'annotator@gecko-next.local',
      role: 'annotator',
      status: 'active'
    },
    {
      id: 'u-verifier',
      fullName: 'Виктор Верификатор',
      email: 'verifier@gecko-next.local',
      role: 'verifier',
      status: 'active'
    },
    {
      id: 'u-supervisor',
      fullName: 'София Супервайзер',
      email: 'supervisor@gecko-next.local',
      role: 'supervisor',
      status: 'active'
    },
    {
      id: 'u-admin',
      fullName: 'Админ Gecko',
      email: 'admin@gecko-next.local',
      role: 'admin',
      status: 'active'
    }
  ],
  currentUserId: null,
  project: {
    id: 'project-yadro-demo',
    name: 'Gecko Next - YADRO speech QA',
    description: 'Демо-проект для разметки, верификации и контроля качества речевых данных.',
    customer: 'YADRO demo',
    deadline: '2026-07-24',
    status: 'active',
    rules: [
      'Предложение начинается с большой буквы.',
      'Слова-паразиты сохраняются, если они значимы для контекста.',
      'Технические термины сверяются со словарём проекта.',
      'Кросстолк допускается в одном сегменте по порядку произнесения.',
      'Границы сегментов редактируются с точностью 0.01 секунды.'
    ],
    inputFormat: 'Gecko JSON + audio/video',
    outputFormat: 'Gecko-compatible JSON + ML report'
  },
  task: {
    id: 'task-call-001',
    projectId: 'project-yadro-demo',
    mediaFileId: 'media-demo-audio',
    title: 'Фрагмент интервью: продукты и форматы данных',
    assigneeId: 'u-annotator',
    verifierId: 'u-verifier',
    status: 'Назначена',
    priority: 'high',
    deadline: '2026-07-15',
    listenedSeconds: 0,
    returnCount: 0
  },
  media: {
    id: 'media-demo-audio',
    projectId: 'project-yadro-demo',
    audioPath: '/demo-audio.wav',
    duration: 30,
    format: 'wav',
    uploadedAt: '2026-07-10T02:06:05+03:00'
  },
  speakers: [
    {
      id: 'spk-1',
      taskId: 'task-call-001',
      originalName: 'SPEAKER_00',
      displayName: 'Спикер 1',
      editable: false
    },
    {
      id: 'spk-2',
      taskId: 'task-call-001',
      originalName: 'SPEAKER_01',
      displayName: 'Спикер 2',
      editable: false
    }
  ],
  segments: [
    {
      id: 'seg-1',
      taskId: 'task-call-001',
      startTime: 0.32,
      endTime: 3.18,
      text: 'Добрый день, это тестовое аудио по проекту TATLIN.',
      sourceText: 'добрый день это тестовое аудио по проекту tatlin',
      speakerId: 'spk-1',
      status: 'checked',
      confidence: 0.92,
      isCrosstalk: false,
      listened: true
    },
    {
      id: 'seg-2',
      taskId: 'task-call-001',
      startTime: 3.42,
      endTime: 7.15,
      text: 'Мы проверяем json и csv выгрузки для ASR.',
      sourceText: 'мы проверяем джейсон и сиэсви выгрузки для asr',
      speakerId: 'spk-1',
      status: 'new',
      confidence: 0.72,
      isCrosstalk: false,
      listened: false
    },
    {
      id: 'seg-3',
      taskId: 'task-call-001',
      startTime: 7.5,
      endTime: 8.16,
      text: 'Да.',
      sourceText: 'да',
      speakerId: 'spk-2',
      status: 'checked',
      confidence: 0.86,
      isCrosstalk: false,
      listened: true
    },
    {
      id: 'seg-4',
      taskId: 'task-call-001',
      startTime: 8.7,
      endTime: 13.46,
      text: "Второй спикер уточняет: нужен API'шный интерфейс и CI/CD.",
      sourceText: 'второй спикер уточняет нужен апишный интерфейс и ci cd',
      speakerId: 'spk-2',
      status: 'disputed',
      confidence: 0.79,
      isCrosstalk: true,
      listened: false,
      crosstalkComment: 'На фоне слышен первый спикер, порядок реплик сохранён.'
    },
    {
      id: 'seg-5',
      taskId: 'task-call-001',
      startTime: 14.05,
      endTime: 20.4,
      text: 'VEGMAN ARCHIVE важен для резервного копирования и отчёта.',
      sourceText: 'вегман архив важен для резервного копирования и отчета',
      speakerId: 'spk-1',
      status: 'new',
      confidence: 0.58,
      isCrosstalk: false,
      listened: false
    },
    {
      id: 'seg-6',
      taskId: 'task-call-001',
      startTime: 21.05,
      endTime: 27.8,
      text: 'После проверки можно экспортировать JSON для ML-пайплайна.',
      sourceText: 'после проверки можно экспортировать json для эмэль пайплайна',
      speakerId: 'spk-1',
      status: 'new',
      confidence: 0.83,
      isCrosstalk: false,
      listened: false
    }
  ],
  terms: [
    {
      id: 'term-tatlin',
      projectId: 'project-yadro-demo',
      value: 'TATLIN',
      normalizedValue: 'TATLIN',
      type: 'product',
      status: 'approved',
      annotatorComment: 'Название продукта пишется латиницей верхним регистром.',
      verifierComment: '',
      occurrences: 1
    },
    {
      id: 'term-json',
      projectId: 'project-yadro-demo',
      value: 'json',
      normalizedValue: 'JSON',
      type: 'extension',
      status: 'review',
      annotatorComment: 'Проверить регистр для расширения и формата.',
      verifierComment: '',
      occurrences: 2
    },
    {
      id: 'term-api',
      projectId: 'project-yadro-demo',
      value: "API'шный",
      normalizedValue: "API'шный",
      type: 'slang',
      status: 'disputed',
      annotatorComment: 'Слово с апострофом из инструкции.',
      verifierComment: 'Оставить, если так произнесено.',
      occurrences: 1
    },
    {
      id: 'term-vegman',
      projectId: 'project-yadro-demo',
      value: 'VEGMAN',
      normalizedValue: 'VEGMAN',
      type: 'product',
      status: 'approved',
      annotatorComment: '',
      verifierComment: '',
      occurrences: 1
    },
    {
      id: 'term-ci',
      projectId: 'project-yadro-demo',
      value: 'CI/CD',
      normalizedValue: 'CI/CD',
      type: 'abbreviation',
      status: 'approved',
      annotatorComment: 'Термин со слешем.',
      verifierComment: '',
      occurrences: 1
    }
  ],
  comments: [
    {
      id: 'comment-1',
      taskId: 'task-call-001',
      segmentId: 'seg-4',
      authorId: 'u-verifier',
      category: 'crosstalk',
      text: 'Проверить, не потеряна ли короткая реплика первого спикера.',
      status: 'open',
      createdAt: '2026-07-10T10:14:00+03:00'
    }
  ],
  annotatorChecklist: annotatorChecklistPreset,
  verifierChecklist: verifierChecklistPreset,
  history: [
    {
      id: 'hist-1',
      at: '2026-07-10T10:10:00+03:00',
      userId: 'u-annotator',
      action: 'Исправлен регистр TATLIN',
      target: 'seg-1',
      before: 'tatlin',
      after: 'TATLIN'
    }
  ],
  auditLog: [
    {
      id: 'audit-1',
      userId: 'u-supervisor',
      entityType: 'Task',
      entityId: 'task-call-001',
      action: 'assign',
      oldValue: 'Новая',
      newValue: 'Назначена',
      createdAt: '2026-07-10T09:55:00+03:00'
    }
  ],
  versions: [
    {
      id: 'version-demo-1',
      version: 1,
      label: 'Исходная демо-предразметка',
      createdAt: '2026-07-10T10:00:00+03:00',
      authorId: 'system',
      source: 'demo',
      segments: [
        {
          id: 'seg-1',
          taskId: 'task-call-001',
          startTime: 0.32,
          endTime: 3.18,
          text: 'Добрый день, это тестовое аудио по проекту TATLIN.',
          sourceText: 'добрый день это тестовое аудио по проекту tatlin',
          speakerId: 'spk-1',
          status: 'checked',
          confidence: 0.92,
          isCrosstalk: false,
          listened: true
        },
        {
          id: 'seg-2',
          taskId: 'task-call-001',
          startTime: 3.42,
          endTime: 7.15,
          text: 'Мы проверяем json и csv выгрузки для ASR.',
          sourceText: 'мы проверяем джейсон и сиэсви выгрузки для asr',
          speakerId: 'spk-1',
          status: 'new',
          confidence: 0.72,
          isCrosstalk: false,
          listened: false
        },
        {
          id: 'seg-3',
          taskId: 'task-call-001',
          startTime: 7.5,
          endTime: 8.16,
          text: 'Да.',
          sourceText: 'да',
          speakerId: 'spk-2',
          status: 'checked',
          confidence: 0.86,
          isCrosstalk: false,
          listened: true
        },
        {
          id: 'seg-4',
          taskId: 'task-call-001',
          startTime: 8.7,
          endTime: 13.46,
          text: "Второй спикер уточняет: нужен API'шный интерфейс и CI/CD.",
          sourceText: 'второй спикер уточняет нужен апишный интерфейс и ci cd',
          speakerId: 'spk-2',
          status: 'disputed',
          confidence: 0.79,
          isCrosstalk: true,
          listened: false,
          crosstalkComment: 'На фоне слышен первый спикер, порядок реплик сохранён.'
        },
        {
          id: 'seg-5',
          taskId: 'task-call-001',
          startTime: 14.05,
          endTime: 20.4,
          text: 'VEGMAN ARCHIVE важен для резервного копирования и отчёта.',
          sourceText: 'вегман архив важен для резервного копирования и отчета',
          speakerId: 'spk-1',
          status: 'new',
          confidence: 0.58,
          isCrosstalk: false,
          listened: false
        },
        {
          id: 'seg-6',
          taskId: 'task-call-001',
          startTime: 21.05,
          endTime: 27.8,
          text: 'После проверки можно экспортировать JSON для ML-пайплайна.',
          sourceText: 'после проверки можно экспортировать json для эмэль пайплайна',
          speakerId: 'spk-1',
          status: 'new',
          confidence: 0.83,
          isCrosstalk: false,
          listened: false
        }
      ],
      comment: 'Базовая версия для демонстрации восстановления.'
    }
  ],
  version: 3,
  savedAt: '2026-07-10T10:15:00+03:00'
};
