import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const outputDir = path.resolve('outputs');
const chromeForTesting = '/Users/mihail/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const browser = await chromium.launch({
  executablePath: existsSync(chromeForTesting) ? chromeForTesting : undefined
});
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, acceptDownloads: true });

await mkdir(outputDir, { recursive: true });
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });

await page.getByRole('button', { name: /Виктор Верификатор/ }).click();
await page.locator('label.file-button:has-text("Аннотация") input[type="file"]').setInputFiles(path.resolve('data/sample-gecko.json'));
await page.waitForSelector('.segment-row', { timeout: 15000 });
await page.waitForTimeout(1500);

const segmentCount = await page.locator('.segment-row').count();
assert(segmentCount === 4, `Expected 4 imported segments, got ${segmentCount}`);

const waveform = page.locator('.waveform').first();
await waveform.waitFor({ timeout: 15000 });
const box = await waveform.boundingBox();
assert(box && box.width > 300 && box.height > 80, 'Waveform area is not visible enough');

const waveformRegionCount = await page.locator('.waveform-region').count();
assert(waveformRegionCount >= 4, `Expected waveform overlay regions, got ${waveformRegionCount}`);

await page.screenshot({ path: path.join(outputDir, 'smoke-workspace.png'), fullPage: false });

const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: /JSON Gecko/ }).click();
const download = await downloadPromise;
const exportPath = path.join(outputDir, 'smoke-export.json');
await download.saveAs(exportPath);

const exported = JSON.parse(await readFile(exportPath, 'utf8'));
assert(Array.isArray(exported.segments), 'Exported file must include segments');
assert(exported.segments.length === 4, 'Exported JSON has wrong segment count');
assert(exported.metadata.status, 'Exported JSON must include task status');

await browser.close();

console.log(`Smoke test passed: ${segmentCount} segments, export ${exported.segments.length} segments`);
