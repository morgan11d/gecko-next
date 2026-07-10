import { chromium } from 'playwright';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.APP_URL ?? 'http://127.0.0.1:5174/';
const outputDir = path.resolve('outputs');
const videoWorkDir = path.resolve('work/demo-video');
const finalVideo = path.join(outputDir, 'gecko-next-demo.webm');
const chromeForTesting = '/Users/mihail/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

async function caption(page, text) {
  await page.evaluate((value) => {
    let el = document.querySelector('[data-demo-caption]');
    if (!el) {
      el = document.createElement('div');
      el.setAttribute('data-demo-caption', 'true');
      Object.assign(el.style, {
        position: 'fixed',
        left: '24px',
        bottom: '24px',
        zIndex: '9999',
        maxWidth: '620px',
        padding: '14px 18px',
        color: '#fff',
        background: 'rgba(23, 33, 47, 0.92)',
        borderRadius: '8px',
        font: '700 18px/1.35 Inter, system-ui, sans-serif',
        boxShadow: '0 16px 38px rgba(0,0,0,.22)'
      });
      document.body.appendChild(el);
    }
    el.textContent = value;
  }, text);
  await page.waitForTimeout(1200);
}

async function clickText(page, text) {
  const locator = page.getByText(text, { exact: false });
  await locator.click();
  await page.waitForTimeout(600);
}

async function clickRole(page, role, name) {
  const locator = page.getByRole(role, { name });
  await locator.click();
  await page.waitForTimeout(700);
}

await mkdir(outputDir, { recursive: true });
await rm(videoWorkDir, { recursive: true, force: true });
await mkdir(videoWorkDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: existsSync(chromeForTesting) ? chromeForTesting : undefined
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: {
    dir: videoWorkDir,
    size: { width: 1440, height: 900 }
  },
  acceptDownloads: true
});
const page = await context.newPage();

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });

await caption(page, '1. Выбираем роль разметчика: это основной рабочий сценарий.');
await clickText(page, 'Анна Разметчик');

await caption(page, '2. Импортируем JSON-предразметку: сегменты сразу появляются на waveform-дорожке.');
await page.locator('label.file-button:has-text("Аннотация") input[type="file"]').setInputFiles(path.resolve('data/sample-gecko.json'));
await page.waitForSelector('.segment-row', { timeout: 15000 });
await page.waitForTimeout(1200);

await caption(page, '3. Рабочее место: waveform, source/current дорожки, список фрагментов и редактор.');
await page.waitForTimeout(1100);

await caption(page, '4. Выбираем сегмент и редактируем текст предразметки.');
await clickText(page, 'sample-2');
const textarea = page.locator('textarea').first();
await textarea.fill('Мы проверяем JSON и CSV выгрузки для ASR и ML-пайплайна.');
await page.waitForTimeout(900);

await caption(page, '5. Уточняем границы сегмента с точностью 0.01 секунды.');
const startInput = page.locator('label:has-text("Start") input');
await startInput.fill('3.40');
const endInput = page.locator('label:has-text("End") input');
await endInput.fill('7.20');
await page.waitForTimeout(900);

await caption(page, '6. AI-помощник и контроль качества показывают спорные места, но не меняют текст автоматически.');
await page.locator('.ai-panel').scrollIntoViewIfNeeded();
await page.waitForTimeout(1200);

await caption(page, '7. Термины ведутся внутри сервиса: спорные и подтверждённые значения не теряются.');
await clickRole(page, 'button', 'Термины');
await page.waitForTimeout(1200);

await caption(page, '8. Отправляем задачу на проверку после чек-листа и автоматических проверок.');
await clickRole(page, 'button', 'Разметка');
await page.locator('.checklist-panel').scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await clickRole(page, 'button', 'На проверку');
await page.waitForTimeout(1000);

await caption(page, '9. Переключаемся на роль верификатора: права доступа разделены по ролям.');
await clickRole(page, 'button', 'Выйти');
await clickText(page, 'Виктор Верификатор');
await clickRole(page, 'button', 'Верификация');
await page.waitForSelector('.comment-list', { timeout: 15000 });

await caption(page, '10. Верификатор видит сравнение с исходной предразметкой, замечания и историю.');
await page.waitForTimeout(1200);

await caption(page, '11. Задачу можно вернуть на доработку или принять.');
await clickRole(page, 'button', 'Принять');
await page.waitForTimeout(900);

await caption(page, '12. Экспортируем Gecko-compatible JSON для ML/ASR пайплайна.');
const downloadPromise = page.waitForEvent('download');
await clickRole(page, 'button', 'JSON Gecko');
const download = await downloadPromise;
await download.saveAs(path.join(outputDir, 'demo-export.json'));
await page.waitForTimeout(900);

await caption(page, '13. В аналитике видны прогресс, замечания, возвраты, качество и confidence по сегментам.');
await clickRole(page, 'button', 'Аналитика');
await page.waitForTimeout(1500);

await caption(page, 'Готово: полный сценарий загрузка -> разметка -> проверка -> экспорт показан.');
await page.waitForTimeout(1400);

await context.close();
await browser.close();

const files = await readdir(videoWorkDir);
const video = files.find((file) => file.endsWith('.webm'));
if (!video) throw new Error('Video file was not created');
await rm(finalVideo, { force: true });
await rename(path.join(videoWorkDir, video), finalVideo);

console.log(`Demo video saved: ${finalVideo}`);
