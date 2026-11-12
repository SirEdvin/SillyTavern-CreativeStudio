import test from 'node:test';
import assert from 'node:assert/strict';
import { nanoModels, generateNanoImage, setNanoSessionKey, hasNanoSessionKey, nanoStoredKeys, nanoRequest, nanoResolution } from '../src/st/nanogpt.js';

const model = { id: 'editor', name: 'Editor', architecture: { input_modalities: ['text', 'image'] },
    supported_parameters: { resolutions: ['1k', '2k'], max_input_images: 1 },
    endpoints: '/api/v1/images/models/editor/endpoints' };
const meta = { ...model, endpoints: [{ supported_parameters: model.supported_parameters, input_reference_constraints: { max_items: 1, route: { formats: ['png', 'jpeg'], max_bytes: 1000000, min_width: 8, min_height: 8 } } }] };
const png = new Uint8Array([137,80,78,71,13,10,26,10]);
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const prepared = { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', width: 512, height: 768, mime: 'image/png', bytes: png };

function setup({ response = { data: [{ b64_json: 'iVBORw0KGgo=' }] }, metadata = meta } = {}) {
    const calls = [];
    const ctx = { extensionSettings: {}, getRequestHeaders: () => ({ 'X-CSRF-Token': 'local-csrf', 'Content-Type': 'application/json' }) };
    setNanoSessionKey('session-secret', ctx);
    const fetcher = async (url, options = {}) => {
        calls.push({ url, options });
        if (url.endsWith('/models')) return json({ data: [model, { id: 'text-only', architecture: { input_modalities: ['text'] } }] });
        if (url.endsWith('/endpoints')) return json(metadata);
        if (url.endsWith('/images')) return json(response);
        throw new Error('Unexpected request '+url);
    };
    return { calls, ctx, fetcher, run: options => generateNanoImage({ settings: { nanoModel: 'editor', nanoResolution: '1k' }, reference: png, instruction: 'Edit the reference into a rainy railway scene.', ctx, fetcher, prepare: async () => prepared, ...options }) };
}

test('discovery uses the public API and exposes actual image-input capability', async () => {
    const f = setup();
    const models = await nanoModels({ fetcher: f.fetcher });
    assert.equal(models[0].id, 'editor');
    assert.equal(models[0].canEdit, true);
    assert.equal(models[1].canEdit, false);
    assert.equal(f.calls[0].url, 'https://api.nano-gpt.com/api/v1/images/models');
    assert.equal(f.calls[0].options.credentials, 'omit');
    assert.equal(f.calls[0].options.headers?.Authorization, undefined);
});

test('session keys are context-isolated, never persisted, and can be cleared', () => {
    const a = setup(), b = { extensionSettings: {} };
    assert.equal(hasNanoSessionKey(a.ctx), true);
    assert.equal(hasNanoSessionKey(b), false);
    assert.doesNotMatch(JSON.stringify(a.ctx.extensionSettings), /session-secret/);
    setNanoSessionKey('', a.ctx);
    assert.equal(hasNanoSessionKey(a.ctx), false);
});

test('generation sends a real reference with the editing instructions and only official-host credentials', async () => {
    const f = setup();
    const r = await f.run();
    const request = f.calls.find(c => c.url.endsWith('/images'));
    const body = JSON.parse(request.options.body);
    assert.deepEqual(body.input_references, [prepared.dataUrl]);
    assert.equal(body.prompt, 'Edit the reference into a rainy railway scene.');
    assert.equal(body.n, 1);
    assert.equal(body.resolution, '1k');
    assert.equal(body.imageDataUrl, undefined);
    assert.equal(body.strength, undefined);
    assert.equal(request.options.headers.Authorization, 'Bearer session-secret');
    assert.equal(request.options.headers['X-CSRF-Token'], undefined);
    assert.equal(request.options.credentials, 'omit');
    assert.deepEqual(r.bytes, png);
    assert.equal(r.model, 'editor');
    assert.equal(f.calls.filter(c => c.url.endsWith('/images')).length, 1);
});

test('unsupported models, missing key/reference and unsupported resolutions never send a paid request', async () => {
    const f = setup({ metadata: { id: 'editor', architecture: { input_modalities: ['text'] }, endpoints: [{ supported_parameters: { resolutions: ['1k'] } }] } });
    await assert.rejects(f.run(), /image input|reference|editing/i);
    assert.ok(!f.calls.some(c => c.url.endsWith('/images')));
    const g = setup(); setNanoSessionKey('', g.ctx);
    await assert.rejects(g.run(), /key/i);
    const h = setup(); await assert.rejects(h.run({ reference: null }), /reference/i);
    assert.ok(!h.calls.some(c => c.url.endsWith('/images')));
    const i = setup(); await assert.rejects(i.run({ settings: { nanoModel: 'editor', nanoResolution: '4k' } }), /resolution/i);
    assert.ok(!i.calls.some(c => c.url.endsWith('/images')));
});

test('reference constraints are enforced before generation', async () => {
    const f = setup();
    await assert.rejects(f.run({ prepare: async () => ({ ...prepared, width: 1 }) }), /dimensions|small/i);
    await assert.rejects(f.run({ prepare: async () => ({ ...prepared, mime: 'image/webp' }) }), /format/i);
    assert.ok(!f.calls.some(c => c.url.endsWith('/images')));
});

test('errors and non-image responses are not retried or saved as image bytes', async () => {
    const f = setup({ response: { data: [{ b64_json: btoa('<svg>not trusted</svg>') }] } });
    await assert.rejects(f.run(), /image|format/i);
    assert.equal(f.calls.filter(c => c.url.endsWith('/images')).length, 1);
    const g = setup();
    const fetcher = async (url, opts) => url.endsWith('/images') ? new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }) : g.fetcher(url, opts);
    await assert.rejects(g.run({ fetcher }), /401/);
    const ac = new AbortController(); ac.abort();
    await assert.rejects(g.run({ signal: ac.signal }), /abort|cancel/i);
});

test('stored-key selector discards secret values even when ST exposes them', async () => {
    const f = setup();
    const keys = await nanoStoredKeys({ ctx: f.ctx, fetcher: async () => json({ api_key_nanogpt: [{ id: 'key-id', label: 'NanoGPT', active: true, value: 'do-not-copy' }] }) });
    assert.deepEqual(keys, [{ id: 'key-id', label: 'NanoGPT', active: true }]);
    assert.doesNotMatch(JSON.stringify(keys), /do-not-copy/);
});

test('model-specific resolution defaults support enum and array metadata without invented sizes', () => {
    assert.equal(nanoResolution('auto', meta), '1k');
    assert.equal(nanoResolution('auto', { supported_parameters: { resolution: { values: ['2048*2048'], default: '2048*2048' } } }), '2048*2048');
    assert.throws(() => nanoResolution('4k', meta), /resolution/i);
});

test('explicit text-only declarations override generic reference limits', async () => {
    const { nanoCanEdit } = await import('../src/st/nanogpt.js');
    const textOnly = { ...meta, architecture: { input_modalities: ['text'] }, endpoints: [{
        ...meta.endpoints[0], capabilities: { image_to_image: false },
    }] };
    assert.equal(nanoCanEdit(textOnly), false);
    assert.equal(nanoCanEdit({ capabilities: { image_to_image: false }, supported_parameters: { max_input_images: 10 } }), false);
    assert.equal(nanoCanEdit({ endpoints: [{ input_reference_constraints: { max_items: 10 } }] }), false);
    const f = setup({ metadata: textOnly });
    await assert.rejects(f.run(), /editing/i);
    assert.ok(!f.calls.some(c => c.url.endsWith('/images')));
});

test('a final ownership guard runs after metadata/reference preparation and before the paid POST', async () => {
    const f = setup();
    let prepared = false;
    await assert.rejects(f.run({
        prepare: async () => { prepared = true; return { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', width: 512, height: 768, mime: 'image/png', bytes: png }; },
        beforeSubmit: () => { assert.equal(prepared, true); throw new Error('The reference portrait changed'); },
    }), /portrait changed/);
    assert.ok(!f.calls.some(c => c.url.endsWith('/images')));
});

test('session keys survive fresh getContext wrappers sharing the same settings object', () => {
    const f = setup();
    assert.equal(hasNanoSessionKey({ ...f.ctx }), true);
});

test('vault-key denial is explicit, never rotates keys and never reaches the image provider', async () => {
    const f = setup();
    const seen = [];
    const fetcher = async (url, options) => { seen.push({ url, body: JSON.parse(options.body) }); return new Response('', { status: 403 }); };
    await assert.rejects(f.run({ settings: { nanoModel: 'editor', nanoSecretId: 'stored-id' }, fetcher }), /session-only key/i);
    assert.deepEqual(seen.map(c => c.url), ['/api/secrets/find']);
    assert.deepEqual(seen[0].body, { key: 'api_key_nanogpt', id: 'stored-id' });
});

test('output URLs cannot receive credentials or access local/unsafe targets', async () => {
    const f = setup({ response: { data: [{ url: 'https://cdn.example.org/output.png' }] } });
    const fetcher = async (url, options) => {
        if (url.startsWith('https://cdn.example.org/')) {
            assert.equal(options.headers, undefined);
            assert.equal(options.credentials, 'omit');
            assert.equal(options.redirect, 'error');
            return new Response(png);
        }
        return f.fetcher(url, options);
    };
    assert.deepEqual((await f.run({ fetcher })).bytes, png);
    for (const url of ['https://127.0.0.1/private', 'https://localhost/private', 'http://cdn.example.org/output.png', 'https://user:password@cdn.example.org/output.png', 'data:image/svg+xml;base64,AAAA']) {
        const g = setup({ response: { data: [{ url }] } });
        await assert.rejects(g.run(), /unsafe|invalid|image/i);
    }
});

test('network requests have a bounded timeout and redact credentials from provider errors', async () => {
    const f = setup();
    const fetcher = async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    await assert.rejects(nanoRequest('/images/models', { fetcher, timeoutMs: 15 }), /timeout|timed out|abort/i);
    const bad = async () => new Response('session-secret', { status: 400 });
    await assert.rejects(f.run({ fetcher: bad }), error => !error.message.includes('session-secret'));
});
