import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const serverDir = path.join(distDir, 'server');
const openaiDir = path.join(distDir, '.openai');
const hostingConfig = path.join(root, '.openai', 'hosting.json');

await mkdir(serverDir, { recursive: true });
try {
  await access(hostingConfig);
  await mkdir(openaiDir, { recursive: true });
  await copyFile(hostingConfig, path.join(openaiDir, 'hosting.json'));
} catch {
  // GitHub Pages builds do not need Codex Sites metadata.
}

await writeFile(
  path.join(serverDir, 'index.js'),
  `export default {
  async fetch(request, env) {
    const assets = env?.ASSETS;
    if (assets?.fetch) {
      const response = await assets.fetch(request);
      if (response.status !== 404) return response;
    }

    const url = new URL(request.url);
    if (!url.pathname.includes('.') && assets?.fetch) {
      const fallbackUrl = new URL('/index.html', url);
      return assets.fetch(new Request(fallbackUrl, request));
    }

    return new Response('Not found', { status: 404 });
  }
};
`,
  'utf8'
);
