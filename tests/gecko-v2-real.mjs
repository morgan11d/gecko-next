import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.APP_URL ?? 'http://127.0.0.1:5174/';
const realJson = process.env.GECKO_JSON ?? '/Users/mihail/Downloads/14.json';
const realVideo = process.env.GECKO_VIDEO ?? '/Users/mihail/Downloads/14.mp4';
const outputDir = path.resolve('outputs');
const fixtureName = path.basename(realJson).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const chromeForTesting = '/Users/mihail/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (!existsSync(realJson)) throw new Error(`Real Gecko JSON fixture is missing: ${realJson}`);
if (!existsSync(realVideo)) throw new Error(`Real video fixture is missing: ${realVideo}`);

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: existsSync(chromeForTesting) ? chromeForTesting : undefined
});
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, acceptDownloads: true });

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /Анна Разметчик/ }).click();

await page.locator('label.file-button:has-text("Видео") input[type="file"]').setInputFiles(realVideo);
await page.locator('label.file-button:has-text("Аннотация") input[type="file"]').setInputFiles(realJson);
await page.waitForSelector('.segment-row', { timeout: 20000 });
await page.waitForTimeout(2500);

const source = JSON.parse(await readFile(realJson, 'utf8'));
const expectedCount = source.monologues.length;
const sourceDuration = Math.max(
  ...source.monologues.flatMap((monologue) => (monologue.terms ?? []).map((term) => Number(term.end) || 0)),
  1
);
const rowCount = await page.locator('.segment-row').count();
const waveformRegions = await page.locator('.waveform-region').count();
assert(rowCount === expectedCount, `Expected ${expectedCount} rows from Gecko v2, got ${rowCount}`);
assert(waveformRegions === expectedCount, `Expected ${expectedCount} waveform regions, got ${waveformRegions}`);
assert((await page.locator('.segment-rail').count()) === 0, 'Lower segment rail must be removed');
assert((await page.locator('.waveform-synthetic-bar').count()) === 0, 'Synthetic waveform overlay must be removed');
const waveSurferCanvasCount = await page.locator('.waveform').evaluate((element) => element.firstElementChild?.shadowRoot?.querySelectorAll('canvas').length ?? 0);
assert(waveSurferCanvasCount > 0, 'WaveSurfer must render its own canvas waveform');

const sourceSpeakers = new Set(
  source.monologues.map((monologue) => monologue.speaker?.id ?? monologue.speaker?.name ?? 'unknown')
);
const visibleRegionColors = await page.locator('.waveform-region').evaluateAll((regions) =>
  Array.from(new Set(regions.slice(0, 80).map((region) => getComputedStyle(region).borderColor)))
);
const visibleSpeakerBadges = await page.locator('.segment-speaker').evaluateAll((badges) =>
  Array.from(new Set(badges.slice(0, 80).map((badge) => getComputedStyle(badge).borderColor)))
);
assert(sourceSpeakers.size > 1, 'Fixture must contain more than one speaker for color validation');
assert(visibleRegionColors.length >= 2, `Expected multiple waveform speaker colors, got ${visibleRegionColors.length}`);
assert(visibleSpeakerBadges.length >= 2, `Expected multiple segment-table speaker colors, got ${visibleSpeakerBadges.length}`);

const timelineWidthBeforeZoom = await page.locator('.waveform-stack').evaluate((element) => element.getBoundingClientRect().width);
assert(timelineWidthBeforeZoom >= sourceDuration * 45, `Timeline must cover full Gecko duration before zoom: width=${timelineWidthBeforeZoom}, sourceDuration=${sourceDuration}`);
const zoomSlider = page.locator('label:has-text("Масштаб") input[type="range"]');
await zoomSlider.focus();
for (let index = 0; index < 20; index += 1) {
  await page.keyboard.press('ArrowRight');
}
await page.waitForTimeout(250);
const timelineWidthAfterZoom = await page.locator('.waveform-stack').evaluate((element) => element.getBoundingClientRect().width);
assert(timelineWidthAfterZoom > timelineWidthBeforeZoom, `Zoom must increase timeline width: before=${timelineWidthBeforeZoom}, after=${timelineWidthAfterZoom}`);

await page.locator('.wave-shell').evaluate((element) => {
  element.scrollLeft = 0;
});
const farSegmentIndex = Math.min(120, expectedCount - 1);
const farSegmentRow = page.locator('.segments-panel .segment-row').nth(farSegmentIndex);
const farSegmentId = (await farSegmentRow.locator('.segment-id').innerText()).trim();
await farSegmentRow.click();
await page.waitForFunction(() => document.querySelector('.wave-shell')?.scrollLeft > 50, null, { timeout: 5000 });
const waveScrollAfterSegmentPick = await page.locator('.wave-shell').evaluate((element) => element.scrollLeft);
const activeRowId = (await page.locator('.segments-panel .segment-row.active .segment-id').innerText()).trim();
assert(activeRowId === farSegmentId, `Selecting far segment must activate it: expected=${farSegmentId}, got=${activeRowId}`);
assert(waveScrollAfterSegmentPick > 50, `Selecting far segment must scroll waveform, got scrollLeft=${waveScrollAfterSegmentPick}`);

await page.locator('.segments-panel .segment-row').first().click();
await page.waitForFunction(() => (document.querySelector('.wave-shell')?.scrollLeft ?? 9999) < 25, null, { timeout: 5000 });
await page.locator('.waveform-region').first().click();
const firstEndBefore = Number(await page.locator('label:has-text("End") input').inputValue());
const endHandle = await page.locator('.waveform-region').first().locator('.waveform-resize-handle.end').boundingBox();
assert(endHandle, 'Expected end resize handle on waveform segment');
await page.mouse.move(endHandle.x + endHandle.width / 2, endHandle.y + endHandle.height / 2);
await page.mouse.down();
await page.mouse.move(endHandle.x + endHandle.width / 2 + 48, endHandle.y + endHandle.height / 2);
await page.mouse.up();
await page.waitForTimeout(250);
const firstEndAfter = Number(await page.locator('label:has-text("End") input').inputValue());
assert(firstEndAfter > firstEndBefore, `Dragging segment end must increase End field: before=${firstEndBefore}, after=${firstEndAfter}`);

const layerBox = await page.locator('.waveform-create-layer').boundingBox();
assert(layerBox, 'Expected waveform creation layer');
const timelineScale = timelineWidthAfterZoom / sourceDuration;
const createStartX = layerBox.x + 5 * timelineScale;
const createEndX = layerBox.x + 6 * timelineScale;
const createY = layerBox.y + layerBox.height / 2;
await page.mouse.move(createStartX, createY);
await page.mouse.down();
await page.mouse.move(createEndX, createY);
await page.mouse.up();
await page.waitForTimeout(350);
const rowCountAfterCreate = await page.locator('.segment-row').count();
assert(rowCountAfterCreate === expectedCount + 1, `Dragging on waveform must create one segment, got ${rowCountAfterCreate}`);

const screenshotPath = path.join(outputDir, `gecko-v2-${fixtureName}-waveform-speakers.png`);
await page.screenshot({ path: screenshotPath, fullPage: false });

await page.locator('.segment-row').first().click();
await page.locator('textarea').fill('Привет, это изменённый текст для проверки экспорта Gecko v2.');
await page.waitForFunction(
  (count) => {
    const saved = JSON.parse(localStorage.getItem('gecko-next-mvp-state') || '{}');
    return saved.sourceSchemaVersion === '2.0' && saved.segments?.length === count;
  },
  expectedCount + 1,
  { timeout: 5000 }
);
const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem('gecko-next-mvp-state') || '{}'));
assert(savedState.sourceSchemaVersion === '2.0', `App state must remain Gecko v2 before export, got ${savedState.sourceSchemaVersion}`);
assert(savedState.segments?.length === expectedCount + 1, `App state must keep ${expectedCount + 1} segments before export, got ${savedState.segments?.length}`);

const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: /JSON Gecko/ }).click();
const download = await downloadPromise;
const exportPath = path.join(outputDir, `gecko-v2-${fixtureName}-export.json`);
await download.saveAs(exportPath);

const exported = JSON.parse(await readFile(exportPath, 'utf8'));
assert(exported.schemaVersion === '2.0', 'Export must preserve Gecko v2 schemaVersion');
assert(Array.isArray(exported.monologues), 'Export must include monologues');
assert(exported.monologues.length === expectedCount + 1, `Expected ${expectedCount + 1} exported monologues after creating one segment, got ${exported.monologues.length}`);
assert(exported.monologues[0].terms.some((term) => term.text === 'изменённый'), 'Exported Gecko v2 terms must contain edited text');

await browser.close();
console.log(`Gecko v2 real-file test passed: ${expectedCount} monologues imported, shown on waveform, edited and exported`);
