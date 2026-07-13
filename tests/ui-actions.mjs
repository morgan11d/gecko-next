import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.APP_URL ?? 'http://127.0.0.1:5174/';
const realJson = process.env.GECKO_JSON ?? '/Users/mihail/Downloads/14.json';
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
await page.getByRole('button', { name: /Админ Gecko/ }).click();
await page.locator('label.file-button:has-text("Аннотация") input[type="file"]').setInputFiles(existsSync(realJson) ? realJson : path.resolve('data/sample-gecko.json'));
await page.waitForSelector('.segment-row', { timeout: 20000 });
await page.waitForTimeout(1200);

const initialTerms = await page.evaluate(() => JSON.parse(localStorage.getItem('gecko-next-mvp-state') || '{}').terms?.length ?? 0);
const aiAddButton = page.locator('.hint-row', { hasText: 'Добавить термин' }).first();
await aiAddButton.waitFor({ timeout: 15000 });
await aiAddButton.click();
await page.waitForFunction(
  (count) => (JSON.parse(localStorage.getItem('gecko-next-mvp-state') || '{}').terms?.length ?? 0) > count,
  initialTerms,
  { timeout: 5000 }
);
await page.getByRole('button', { name: /Термины/ }).click();
await page.waitForSelector('.term-row', { timeout: 15000 });
const termsAfterAi = await page.evaluate(() => JSON.parse(localStorage.getItem('gecko-next-mvp-state') || '{}').terms?.length ?? 0);
assert(termsAfterAi === initialTerms + 1, `AI add term must add one term: before=${initialTerms}, after=${termsAfterAi}`);

await page.getByPlaceholder('Новый или спорный термин').fill('CodexSmokeTerm');
await page.getByRole('button', { name: /^Добавить$/ }).click();
await page.waitForFunction(
  (count) => (JSON.parse(localStorage.getItem('gecko-next-mvp-state') || '{}').terms?.length ?? 0) > count,
  termsAfterAi,
  { timeout: 5000 }
);
const termsAfterManual = await page.evaluate(() => JSON.parse(localStorage.getItem('gecko-next-mvp-state') || '{}').terms?.length ?? 0);
assert(termsAfterManual === termsAfterAi + 1, `Manual add term must add one term: before=${termsAfterAi}, after=${termsAfterManual}`);

await page.getByRole('button', { name: /Верификация/ }).click();
await page.waitForSelector('.verifier-segment-panel .segment-row', { timeout: 15000 });
const secondSegmentId = (await page.locator('.verifier-segment-panel .segment-row').nth(1).locator('.segment-id').innerText()).trim();
await page.locator('.verifier-segment-panel .segment-row').nth(1).click();
await page.waitForTimeout(200);
const selectedHeading = await page.locator('.verifier-segment-panel h2').innerText();
assert(selectedHeading.includes(secondSegmentId.replace('#', 'seg-')) || selectedHeading.includes(secondSegmentId), `Verifier segment picker must select ${secondSegmentId}, heading=${selectedHeading}`);
await page.getByRole('button', { name: /Все сегменты/ }).click();
await page.waitForFunction(() => document.querySelector('.ai-transcript-row .badge.good, .ai-transcript-row .badge.warning, .ai-transcript-row .badge.danger'), null, { timeout: 5000 });
assert((await page.locator('.ai-transcript-row').count()) > 0, 'AI-ASR panel must render segment-level transcript rows');
assert(await page.locator('.verification-grid .ai-quality-list').evaluate((element) => element.scrollHeight >= element.clientHeight), 'Verification AI quality list must be scrollable or constrained');

await page.getByRole('button', { name: /Админ/ }).click();
await page.waitForSelector('.admin-user-row', { timeout: 15000 });
const firstRole = page.locator('.admin-user-row').first().locator('select').first();
await firstRole.selectOption('verifier');
await page.locator('.admin-user-row').first().getByRole('button').click();
await page.waitForFunction(() => {
  const saved = JSON.parse(localStorage.getItem('gecko-next-mvp-state') || '{}');
  return saved.users?.[0]?.role === 'verifier' && saved.users?.[0]?.status === 'blocked';
}, null, { timeout: 5000 });
const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem('gecko-next-mvp-state') || '{}'));
assert(savedState.users?.[0]?.role === 'verifier', `Admin role change must persist, got ${savedState.users?.[0]?.role}`);
assert(savedState.users?.[0]?.status === 'blocked', `Admin status toggle must persist, got ${savedState.users?.[0]?.status}`);
const availableRoles = await firstRole.locator('option').evaluateAll((options) => options.map((option) => option.value));
assert(!availableRoles.includes('ml') && !availableRoles.includes('customer'), `Removed roles must not be available, got ${availableRoles.join(',')}`);

await page.getByPlaceholder('Новое правило проекта').fill('Smoke rule for admin');
await page.getByRole('button', { name: /^Добавить$/ }).last().click();
await page.waitForFunction(() => JSON.parse(localStorage.getItem('gecko-next-mvp-state') || '{}').project?.rules?.[0] === 'Smoke rule for admin', null, { timeout: 5000 });
const savedWithRule = await page.evaluate(() => JSON.parse(localStorage.getItem('gecko-next-mvp-state') || '{}'));
assert(savedWithRule.project?.rules?.[0] === 'Smoke rule for admin', 'Admin rule add must persist');

await page.getByRole('button', { name: /Выйти/ }).click();
const blockedLogin = page.getByRole('button', { name: /Анна Разметчик.*Заблокирован/ });
await blockedLogin.waitFor({ timeout: 5000 });
assert(await blockedLogin.isDisabled(), 'Blocked user login card must be disabled');

await browser.close();
console.log('UI actions test passed: terms, verifier picker, scroll lists and admin controls work');
