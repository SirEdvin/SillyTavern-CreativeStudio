import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, newCharacter } from '../src/core/project.js';
import { createStore } from '../src/ui/store.js';
import { illustrateScene } from '../src/st/scene-illustration.js';

function fixture() {
    const project = createProject('Scene test');
    const character = newCharacter('Mara');
    character.origin = { kind: 'st', avatar: 'mara.png' };
    character.avatarMediaId = 'original';
    project.characters = [character];
    project.media = [{ id: 'original', kind: 'image', url: '/mara.png' }];
    const store = createStore(project);
    const calls = [];
    const png = new Uint8Array([137,80,78,71,13,10,26,10]);
    const env = { storage: {
        loadMediaBytes: async () => { calls.push('portrait'); return png; },
        saveMedia: async () => { calls.push('save'); return 'user/files/scene.png'; },
    } };
    const ctx = { characterId: 0, characters: [{ avatar: 'mara.png' }], getCurrentChatId: () => 'chat-a', chat: [{ name: 'Mara', mes: 'She waits at the rainy platform in a black coat.' }] };
    const llm = async (_ctx, args) => { calls.push('llm'); assert.match(args.user, /rainy platform/); return { value: { scene: 'Rainy railway platform.', instruction: 'Use the attached portrait as the identity reference. Put her in a black coat at the rainy platform.' }, meta: { model: 'text-model' } }; };
    const generate = async args => { calls.push('image'); assert.deepEqual(args.reference, png); assert.match(args.instruction, /black coat/); return { bytes: png, positive: args.instruction, model: 'image-model' }; };
    const run = options => illustrateScene({ projectId: project.id, characterId: character.id, store, env, ctx, runLlm: llm, generate, ...options });
    return { project, character, store, env, ctx, calls, run, llm, png };
}

test('one action loads the original portrait, runs the LLM, edits with its instructions and saves a scene, not an avatar', async () => {
    const f = fixture();
    const result = await f.run();
    assert.deepEqual(f.calls, ['portrait', 'llm', 'image', 'save']);
    assert.equal(f.store.get().characters[0].avatarMediaId, 'original');
    assert.equal(result.media.purpose, 'scene');
    assert.equal(result.media.referenceMediaId, 'original');
    assert.equal(result.media.scene.chatId, 'chat-a');
    assert.equal(result.media.scene.description, 'Rainy railway platform.');
    assert.equal(f.store.get().media.length, 2);
    f.store.undo();
    assert.equal(f.store.get().media.length, 1);
    assert.equal(f.store.get().characters[0].avatarMediaId, 'original');
});

test('the final image instruction enforces user POV and keeps the user entirely unseen, even if LLM staging conflicts',async()=>{
    const f=fixture();let sent;
    const result=await f.run({runLlm:async(_ctx,args)=>{
        assert.match(args.system,/first-person user POV/i);
        return {value:{scene:'Mara hands the viewer an umbrella.',instruction:'Use the portrait as identity reference. Show Mara and the user from behind the user.'}};
    },generate:async args=>{sent=args.instruction;return {bytes:f.png}}});
    assert.match(sent,/first-person user POV/i);assert.match(sent,/user.*entirely off-screen/i);
    assert.match(sent,/hands.*reflections.*shadows/i);assert.match(sent,/overrides conflicting/i);
    assert.equal(result.instruction,sent);assert.equal(result.media.prompt,sent);assert.ok(sent.length<=12000);
    assert.equal(f.store.get().characters[0].avatarMediaId,'original');
});

test('maximum valid LLM instructions still fit the image API bound with the fixed POV rule appended',async()=>{
    const f=fixture();let length;
    await f.run({runLlm:async()=>({value:{scene:'Platform',instruction:'x'.repeat(8000)}}),generate:async args=>{length=args.instruction.length;assert.match(args.instruction,/first-person user POV/);return {bytes:f.png}}});
    assert.ok(length>8000&&length<=12000);
});

test('missing portrait or changed chat fails before a paid image request', async () => {
    const f = fixture();
    f.store.get().characters[0].avatarMediaId = '';
    await assert.rejects(f.run(), /portrait/i);
    assert.deepEqual(f.calls, []);
    const g = fixture();
    await assert.rejects(g.run({ runLlm: async (...args) => { const r = await g.llm(...args); g.ctx.chat.push({ mes: 'The scene changed.' }); return r; } }), /chat.*changed/i);
    assert.deepEqual(g.calls, ['portrait', 'llm']);
});

test('invalid or whitespace-only LLM output is never submitted to the image provider', async () => {
    for (const value of [{}, { scene: 'x', instruction: '  ' }, { scene: 'x', instruction: 'x'.repeat(8001) }]) {
        const f = fixture();
        await assert.rejects(f.run({ runLlm: async () => ({ value }) }), /instruction|scene/i);
        assert.deepEqual(f.calls, ['portrait']);
    }
});

test('cancelled jobs and portrait changes do not generate or attach an unrelated result', async () => {
    const f = fixture();
    const ac = new AbortController(); ac.abort();
    await assert.rejects(f.run({ signal: ac.signal }), /cancel/i);
    assert.deepEqual(f.calls, []);
    const g = fixture();
    await assert.rejects(g.run({ runLlm: async (...args) => { const r = await g.llm(...args); g.store.get().characters[0].avatarMediaId = 'new'; return r; } }), /portrait.*changed/i);
    assert.deepEqual(g.calls, ['portrait', 'llm']);
    const h = fixture();
    await assert.rejects(h.run({ generate: async () => { h.ctx.getCurrentChatId = () => 'chat-b'; return { bytes: h.png }; } }), /chat.*changed/i);
    assert.equal(h.store.get().media.length, 1);
});

test('ownership checks refresh the real ST context instead of retaining its snapshot wrapper', async () => {
    const f = fixture();
    let active = f.ctx;
    globalThis.SillyTavern = { getContext: () => ({ ...active }) };
    try {
        await assert.rejects(f.run({ ctx: undefined, runLlm: async (...args) => {
            const result = await f.llm(...args);
            active = { ...f.ctx, characterId: 1, characters: [{ avatar: 'mara.png' }, { avatar: 'other.png' }] };
            return result;
        } }), /chat.*changed/i);
        assert.ok(!f.calls.includes('image'));
    } finally { delete globalThis.SillyTavern; }
});

test('the provider receives a live ownership guard for changes during its own preparation', async () => {
    const f = fixture();
    let submitted = false;
    await assert.rejects(f.run({ generate: async args => {
        await Promise.resolve(); // Simulate metadata/portrait encoding after the LLM stage.
        f.store.get().characters[0].avatarMediaId = 'replacement';
        args.beforeSubmit();
        submitted = true;
        return { bytes: f.png };
    } }), /portrait.*changed/i);
    assert.equal(submitted, false);
});

test('a chat change during file upload cannot attach the result to the gallery', async () => {
    const f = fixture();
    f.env.storage.saveMedia = async () => { f.ctx.getCurrentChatId = () => 'chat-b'; return 'user/files/orphan.png'; };
    await assert.rejects(f.run(), /chat.*changed/i);
    assert.equal(f.store.get().media.length, 1);
    assert.equal(f.store.get().characters[0].avatarMediaId, 'original');
});

test('provider failures never fall back to text-to-image or save a fake success', async () => {
    const f = fixture();
    await assert.rejects(f.run({ generate: async () => { throw new Error('Reference unsupported'); } }), /Reference unsupported/);
    assert.equal(f.store.get().media.length, 1);
    assert.ok(!f.calls.includes('save'));
});
