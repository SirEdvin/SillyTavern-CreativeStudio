// In-memory handoff from the chat More menu to the character Pictures view; never persisted into projects.
import { captureScene, assertSceneCurrent } from '../core/scene.js';
import { stContext } from '../st/env.js';

let active = null;

export function createSceneShortcut(ctx = stContext(), { timeoutMs = 30000 } = {}) {
    if (active) throw new Error('A scene illustration shortcut is already in progress.');
    const avatar = ctx.characters?.[ctx.characterId]?.avatar;
    const snapshot = captureScene(ctx, { id: 'chat-shortcut', origin: { kind: 'st', avatar } }, {
        messages: ctx.extensionSettings?.creativeStudio?.image?.sceneMessages ?? 12,
    });
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    // Opening Studio is asynchronous; handle a timeout even before the caller starts awaiting this promise.
    promise.catch(() => {});
    const request = { snapshot, promise, state: 'opening', projectId: '', characterId: '' };
    const finish = (error, value) => {
        if (request.state === 'finished') return;
        clearTimeout(timer);
        request.state = 'finished';
        if (active === request) active = null;
        if (error) reject(error instanceof Error ? error : new Error(String(error))); else resolve(value);
    };
    request.complete = value => finish(null, value);
    request.fail = error => finish(error);
    const timer = setTimeout(() => request.fail(new Error('Pictures did not become ready in time. Open the character in Studio and try again. No image request was started.')), timeoutMs);
    request.claim = () => clearTimeout(timer);
    active = request;
    return request;
}

export function queueSceneShortcut(request, projectId, characterId, ctx) {
    if (request !== active || request.state !== 'opening') throw new Error('This scene shortcut has expired or finished.');
    if (ctx) assertSceneCurrent(ctx, request.snapshot);
    Object.assign(request, { projectId, characterId, state: 'queued' });
    globalThis.dispatchEvent?.(new CustomEvent('cs-scene-shortcut'));
}

export function takeSceneShortcut(projectId, characterId) {
    if (!active || active.state !== 'queued' || active.projectId !== projectId || active.characterId !== characterId) return null;
    const request = active;
    request.state = 'running';
    request.claim();
    // Once claimed, the existing scene pipeline owns cancellation/timeouts. Its provider job may exceed 30s.
    // Completing/rejecting the same request is idempotent.
    return request;
}
