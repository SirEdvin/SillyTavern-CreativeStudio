import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneShortcut, queueSceneShortcut, takeSceneShortcut } from '../src/ui/scene-shortcut.js';

const context = () => ({ characterId: 0, characters: [{ avatar: 'mara.png' }], getCurrentChatId: () => 'chat-a', chat: [{ name: 'Mara', mes: 'She waits in the rain.' }], extensionSettings: {} });

test('a shortcut captures the clicked chat and can only be claimed once by its intended Pictures view', async () => {
    const request = createSceneShortcut(context());
    assert.equal(request.snapshot.avatar, 'mara.png');
    queueSceneShortcut(request, 'project', 'character');
    assert.equal(takeSceneShortcut('other', 'character'), null);
    assert.equal(takeSceneShortcut('project', 'other'), null);
    assert.equal(takeSceneShortcut('project', 'character'), request);
    assert.equal(takeSceneShortcut('project', 'character'), null);
    request.complete({ media: { id: 'scene' } });
    assert.deepEqual(await request.promise, { media: { id: 'scene' } });
});

test('duplicate shortcuts are rejected while a request is pending or generating, then allowed after completion', async () => {
    const request = createSceneShortcut(context());
    assert.throws(() => createSceneShortcut(context()), /already|progress/i);
    queueSceneShortcut(request, 'p', 'c'); takeSceneShortcut('p', 'c');
    assert.throws(() => createSceneShortcut(context()), /already|progress/i);
    request.fail(new Error('Cancelled'));
    await assert.rejects(request.promise, /Cancelled/);
    const next = createSceneShortcut(context()); next.complete('done'); assert.equal(await next.promise, 'done');
});

test('missing/group chat is rejected before opening Studio or creating a job', () => {
    assert.throws(() => createSceneShortcut({ ...context(), groupId: 'group' }), /group/i);
    assert.throws(() => createSceneShortcut({ ...context(), chat: [] }), /message/i);
});

test('a shortcut never moves to a different chat while Studio is loading', async () => {
    const ctx = context(); const request = createSceneShortcut(ctx);
    ctx.getCurrentChatId = () => 'chat-b';
    assert.throws(() => queueSceneShortcut(request, 'p', 'c', ctx), /chat.*changed/i);
    request.fail(new Error('Chat changed')); await assert.rejects(request.promise, /Chat changed/);
});

test('the opening timeout is cleared after Pictures claims the request', async () => {
    const request = createSceneShortcut(context(), { timeoutMs: 10 });
    queueSceneShortcut(request, 'p', 'c'); takeSceneShortcut('p', 'c');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(request.state, 'running');
    request.complete('done'); assert.equal(await request.promise, 'done');
});

test('an unclaimed shortcut times out without ever becoming runnable', async () => {
    const request = createSceneShortcut(context(), { timeoutMs: 15 });
    await assert.rejects(request.promise, /Pictures|timed out/i);
    assert.equal(takeSceneShortcut('p', 'c'), null);
    assert.throws(() => queueSceneShortcut(request, 'p', 'c'), /expired|finished/i);
});
