// NanoGPT's normalized Image API. Credentials are browser-local (or ST vault), never project/settings fields.
import { stContext } from './env.js';
import { savedNanoKey, saveNanoKey, forgetSavedNanoKey, initNanoKeyStore } from './nano-key-store.js';
export { saveNanoKey };
import { bytesToBase64, base64ToBytes } from '../core/bytes.js';
import { sniffImageMime } from '../ui/media.js';

export const NANO_ORIGIN = 'https://api.nano-gpt.com';
export const NANO_SECRET = 'api_key_nanogpt';
const sessionKeys = new WeakMap();
const MAX_JSON_BYTES = 48 * 1024 * 1024;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

// Key the session by extensionSettings: getContext() returns a fresh wrapper in ST, but settings are shared.
const scope = ctx => ctx.extensionSettings ?? ctx;
export function setNanoSessionKey(value, ctx = stContext()) {
    const key = String(value ?? '').trim();
    if (key) sessionKeys.set(scope(ctx), key); else sessionKeys.delete(scope(ctx));
}
export const hasNanoSessionKey = (ctx = stContext()) => sessionKeys.has(scope(ctx));
export const hasNanoKey = (ctx = stContext()) => !!savedNanoKey(ctx) || hasNanoSessionKey(ctx);
export async function forgetNanoKey(ctx = stContext()) { await forgetSavedNanoKey(ctx); setNanoSessionKey('',ctx); }

function deadline(signal, timeoutMs) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason ?? new DOMException('Cancelled', 'AbortError'));
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('NanoGPT request timed out. Check the provider before retrying; a submitted image may still be billed.')), timeoutMs);
    return { signal: controller.signal, close() { clearTimeout(timer); signal?.removeEventListener('abort', abort); } };
}

async function limitedBytes(response, maxBytes) {
    const size = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(size) && size > maxBytes) throw new Error('NanoGPT response exceeds the size limit.');
    if (!response.body?.getReader) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > maxBytes) throw new Error('NanoGPT response exceeds the size limit.');
        return bytes;
    }
    const reader = response.body.getReader();
    const parts = []; let sizeRead = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            sizeRead += value.length;
            if (sizeRead > maxBytes) throw new Error('NanoGPT response exceeds the size limit.');
            parts.push(value);
        }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    const out = new Uint8Array(sizeRead); let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
}

/** Fixed origin; no ST cookies/CSRF and no credential forwarding through redirects. No automatic paid retries. */
export async function nanoRequest(path, { body, key = '', signal, fetcher = globalThis.fetch, timeoutMs = 180000 } = {}) {
    if (!/^\/api\/v1\/images(?:\/|$)/.test(path)) {
        // Convenience for internal callers/tests; never accept an arbitrary URL.
        if (/^\/images(?:\/|$)/.test(path)) path = '/api/v1' + path;
        else throw new Error('Invalid NanoGPT API path.');
    }
    const request = deadline(signal, timeoutMs);
    try {
        if (request.signal.aborted) throw request.signal.reason;
        const response = await fetcher(NANO_ORIGIN + path, { method: body === undefined ? 'GET' : 'POST',
            headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { Authorization: `Bearer ${key}` } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }), credentials: 'omit', redirect: 'error', signal: request.signal });
        // Provider bodies may echo request fields or secrets: never surface them in UI/logs.
        if (!response.ok) { await response.body?.cancel?.().catch(() => {}); throw new Error(`NanoGPT request failed (HTTP ${response.status}). Check model, credits, key and provider content policy. No automatic retry was made.`); }
        const text = new TextDecoder().decode(await limitedBytes(response, MAX_JSON_BYTES));
        let data; try { data = JSON.parse(text); } catch { throw new Error('NanoGPT returned an invalid JSON response.'); }
        if (data?.error) throw new Error('NanoGPT rejected the request. Check model settings, credits and provider policy.');
        return data;
    } catch (error) {
        if (request.signal.aborted) throw request.signal.reason;
        if (error instanceof TypeError) throw new Error('Cannot reach NanoGPT. Check the network and browser CORS/CSP policy.');
        throw error;
    } finally { request.close(); }
}

export function nanoCanEdit(metadata) {
    const declarations = [metadata, ...(Array.isArray(metadata?.endpoints) ? metadata.endpoints : [])];
    // Generic route limits can exist even for explicitly text-only models. Never treat limits as capability.
    if (declarations.some(item => item?.capabilities?.image_to_image === false
        || (Array.isArray(item?.architecture?.input_modalities) && !item.architecture.input_modalities.includes('image')))) return false;
    return declarations.some(item => item?.capabilities?.image_to_image === true || item?.architecture?.input_modalities?.includes('image'));
}

export async function nanoModels(options = {}) {
    const result = await nanoRequest('/api/v1/images/models', options);
    if (!Array.isArray(result.data)) throw new Error('NanoGPT returned no model catalog.');
    return result.data.filter(m => typeof m?.id === 'string').map(m => ({ ...m, canEdit: nanoCanEdit(m) }));
}

export async function nanoModelMetadata(model, options = {}) {
    if (typeof model !== 'string' || !model.trim() || model.length > 200 || !/^[a-zA-Z0-9_.\/-]+$/.test(model) || model.split('/').some(x => !x || x === '.' || x === '..')) throw new Error('Enter a valid NanoGPT image model ID.');
    return nanoRequest(`/api/v1/images/models/${model}/endpoints`, options);
}

export function nanoResolutions(metadata) {
    const supported = metadata?.endpoints?.[0]?.supported_parameters ?? metadata?.supported_parameters ?? {};
    return supported.resolutions ?? supported.resolution?.values ?? supported.resolution?.enum ?? [];
}
export function nanoResolution(value, metadata) {
    const supported = metadata?.endpoints?.[0]?.supported_parameters ?? metadata?.supported_parameters ?? {};
    const sizes = nanoResolutions(metadata);
    if (!sizes.length) {
        if (!value || value === 'auto') return undefined;
        throw new Error('This model does not advertise a resolution control. Choose Auto.');
    }
    if (!value || value === 'auto') return supported.resolution?.default ?? (sizes.includes('1k') ? '1k' : sizes[0]);
    if (!sizes.includes(value)) throw new Error('The selected resolution is not supported by this model. Choose Auto or reload its supported sizes.');
    return value;
}

async function localPost(ctx, path, body, fetcher = globalThis.fetch, signal) {
    const request = deadline(signal, 30000);
    try {
        if (request.signal.aborted) throw request.signal.reason;
        const response = await fetcher(path, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body), signal: request.signal });
        if (!response.ok) throw new Error(response.status === 403
            ? 'This SillyTavern server does not allow reading stored API keys. Save a browser key instead; no server setting was changed.'
            : `SillyTavern secret access failed (HTTP ${response.status}).`);
        return await response.json();
    } catch (error) { if (request.signal.aborted) throw request.signal.reason; throw error; }
    finally { request.close(); }
}
export async function nanoStoredKeys({ ctx = stContext(), fetcher = globalThis.fetch } = {}) {
    const state = await localPost(ctx, '/api/secrets/read', {}, fetcher);
    return (Array.isArray(state[NANO_SECRET]) ? state[NANO_SECRET] : []).map(({ id, label, active }) => ({ id, label: label || 'NanoGPT key', active: !!active }));
}
async function credential(settings, ctx, fetcher, signal) {
    if (settings.nanoSecretId) {
        const data = await localPost(ctx, '/api/secrets/find', { key: NANO_SECRET, id: settings.nanoSecretId }, fetcher, signal);
        if (typeof data.value !== 'string' || !data.value.trim()) throw new Error('The selected NanoGPT key is missing from the SillyTavern vault.');
        return data.value.trim();
    }
    if (!hasNanoSessionKey(ctx)) await initNanoKeyStore(ctx, { fetcher });
    const key = savedNanoKey(ctx) || sessionKeys.get(scope(ctx));
    if (!key) throw new Error('Save a NanoGPT key in Image settings. It stays in this browser, not in project or extension settings.');
    return key;
}

/** Re-encode the portrait so PNG character-card metadata is never sent to the image provider. */
export async function prepareNanoReference(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('The reference portrait is missing or too large.');
    const bitmap = await createImageBitmap(new Blob([bytes]));
    try {
        const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Could not prepare the reference portrait.');
        const clean = new Uint8Array(await blob.arrayBuffer());
        return { dataUrl: `data:image/png;base64,${bytesToBase64(clean)}`, bytes: clean, width: canvas.width, height: canvas.height, mime: 'image/png' };
    } finally { bitmap.close(); }
}

function validateReference(reference, metadata) {
    const constraints = metadata?.endpoints?.[0]?.input_reference_constraints ?? metadata?.supported_parameters?.input_image_constraints ?? {};
    const route = constraints.route ?? {};
    const provider = constraints.provider ?? {};
    if (Number(constraints.max_items) === 0) throw new Error('This model does not accept reference images.');
    for (const limits of [route, provider]) {
        if ((limits.formats ?? []).length && !limits.formats.includes(reference.mime.replace('image/', '').replace('jpg', 'jpeg'))) throw new Error('The reference image format is not supported by this model.');
        if (limits.max_bytes && reference.bytes.length > limits.max_bytes) throw new Error('The reference portrait exceeds this model’s image size limit.');
        if (reference.width < (limits.min_width ?? 1) || reference.height < (limits.min_height ?? 1)
            || reference.width > (limits.max_width ?? 16384) || reference.height > (limits.max_height ?? 16384)) throw new Error('The reference portrait dimensions are outside the model’s supported range.');
    }
}

function validateImage(bytes) {
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(sniffImageMime(bytes))) throw new Error('NanoGPT did not return a supported raster image.');
    return bytes;
}
function safeOutputUrl(value) {
    let url; try { url = new URL(value); } catch { throw new Error('NanoGPT returned an invalid image URL.'); }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || host === 'localhost' || host.includes(':')
        || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || /\.(?:localhost|local|internal|home)$/.test(host)) throw new Error('NanoGPT returned an unsafe image URL.');
    return url.href;
}
async function outputBytes(data, { signal, fetcher }) {
    const first = data?.data?.[0] ?? data?.images?.[0] ?? data?.image;
    const source = typeof first === 'string' ? first : first?.b64_json ?? first?.url ?? first?.image_url?.url;
    if (typeof source !== 'string' || !source) throw new Error('NanoGPT returned no image.');
    if (!source.startsWith('https:') && !source.startsWith('http:')) {
        const b64 = source.replace(/^data:image\/(?:png|jpeg|webp|gif);base64,/i, '');
        if (b64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) || !/^[A-Za-z0-9+/\s]*={0,2}$/.test(b64)) throw new Error('NanoGPT returned invalid image data.');
        try { return validateImage(base64ToBytes(b64)); } catch { throw new Error('NanoGPT returned invalid or unsupported image data.'); }
    }
    const request = deadline(signal, 60000);
    try {
        if (request.signal.aborted) throw request.signal.reason;
        const response = await fetcher(safeOutputUrl(source), { credentials: 'omit', redirect: 'error', signal: request.signal });
        if (!response.ok) throw new Error(`Could not retrieve the generated image (HTTP ${response.status}). The generation may already be billed.`);
        return validateImage(await limitedBytes(response, MAX_IMAGE_BYTES));
    } finally { request.close(); }
}

export async function generateNanoImage({ settings, reference, instruction, signal, beforeSubmit, ctx = stContext(), fetcher = globalThis.fetch, prepare = prepareNanoReference }) {
    if (signal?.aborted) throw signal.reason ?? new Error('Cancelled');
    const prompt = String(instruction ?? '').trim();
    if (!prompt || prompt.length > 12000) throw new Error('A bounded image editing instruction is required.');
    if (!reference?.length) throw new Error('A reference portrait is required; text-only fallback is disabled.');
    const key = await credential(settings, ctx, fetcher, signal);
    const metadata = await nanoModelMetadata(settings.nanoModel, { signal, fetcher });
    if (!nanoCanEdit(metadata)) throw new Error('This NanoGPT model does not advertise reference-image editing. Choose an image-input model.');
    const resolution = nanoResolution(settings.nanoResolution, metadata);
    const prepared = await prepare(reference);
    validateReference(prepared, metadata);
    if (signal?.aborted) throw signal.reason ?? new Error('Cancelled');
    const body = { model: settings.nanoModel, prompt, n: 1, input_references: [prepared.dataUrl], ...(resolution ? { resolution } : {}) };
    if (new TextEncoder().encode(JSON.stringify(body)).length > 12 * 1024 * 1024) throw new Error('The prepared portrait is too large for this image request.');
    await beforeSubmit?.(); // Recheck ownership (including async persisted-chat checks) immediately before spending credits.
    const data = await nanoRequest('/api/v1/images', { body, key, signal, fetcher });
    const bytes = await outputBytes(data, { signal, fetcher });
    if (signal?.aborted) throw signal.reason ?? new Error('Cancelled');
    return { bytes, positive: prompt, negative: '', seed: null, model: settings.nanoModel };
}
