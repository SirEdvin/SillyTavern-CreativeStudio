// Local-only browser harness server. Service responses are TEST FIXTURES, never real NanoGPT generations.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const media = new Map();
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
    try {
        const path = new URL(req.url, 'http://localhost').pathname;
        if (path.startsWith('/__test_media/') || path.startsWith('/user/files/') || path.startsWith('/user/images/')) {
            if (req.method === 'POST') {
                const chunks = []; let size = 0;
                for await (const chunk of req) { size += chunk.length; if (size > 16 * 1024 * 1024) throw new Error('Too large'); chunks.push(chunk); }
                media.set(path, Buffer.concat(chunks)); res.writeHead(204).end(); return;
            }
            if (media.has(path)) { res.writeHead(200, { 'Content-Type': 'image/png' }).end(media.get(path)); return; }
        }
        const file = resolve(root, '.' + path);
        if (!file.startsWith(root) || path.includes('/.')) { res.writeHead(403).end(); return; }
        const bytes = await readFile(file);
        res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes);
    } catch { res.writeHead(404).end('Not found'); }
});
server.listen(Number(process.env.PORT || 8769), '127.0.0.1', () => console.log(`Scene UI TEST harness: http://127.0.0.1:${server.address().port}/tests/browser/scene.html`));
