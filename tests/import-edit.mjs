import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.APP_URL ?? 'http://127.0.0.1:5174/';
const chromeForTesting = '/Users/mihail/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({
  executablePath: existsSync(chromeForTesting) ? chromeForTesting : undefined
});
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, acceptDownloads: true });

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /Анна Разметчик/ }).click();

const annotationInput = page.locator('label.file-button:has-text("Аннотация") input[type="file"]');
await annotationInput.setInputFiles(path.resolve('data/sample-gecko.json'));
await page.waitForSelector('.segment-row', { timeout: 15000 });
await page.waitForTimeout(1200);

const rowCount = await page.locator('.segment-row').count();
const waveformRegionCount = await page.locator('.waveform-region').count();
assert(rowCount === 4, `Expected 4 imported rows, got ${rowCount}`);
assert(waveformRegionCount === 4, `Expected 4 waveform overlay regions, got ${waveformRegionCount}`);

await page.getByText('sample-2', { exact: false }).click();
await page.locator('label:has-text("Start") input').fill('3.55');
await page.locator('button[aria-label="Удалить"]').click();
await page.waitForTimeout(800);

const afterDeleteRows = await page.locator('.segment-row').count();
assert(afterDeleteRows === 3, `Expected delete to leave 3 rows, got ${afterDeleteRows}`);

await browser.close();
console.log('Import/edit test passed: imported JSON segments are visible and editable');
