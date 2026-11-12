import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, newCharacter } from '../src/core/project.js';
import { createStore } from '../src/ui/store.js';
import { blankPng, writeCardChunks } from '../src/core/png.js';
import { pullStCharacter } from '../src/ui/st-pull.js';
import { createSceneShortcut } from '../src/ui/scene-shortcut.js';

function fixture() {
    const store = createStore(createProject('Shortcut import'));
    const card = newCharacter('Mara').card;
    const png = writeCardChunks(blankPng(), { chara: JSON.stringify(card.data) });
    const calls = [];
    globalThis.SillyTavern = { getContext: () => ({ extensionSettings: {}, getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }) };
    globalThis.fetch = async (url, options) => {
        calls.push(url);
        if (url === '/api/characters/export') return new Response(png);
        if (url.startsWith('/api/sprites/get?')) return Response.json([]);
        throw new Error('Unexpected endpoint '+url);
    };
    const env = { storage: { saveMedia: async (pid, mid, ext) => `user/files/${pid}-${mid}.${ext}` } };
    return { store, env, calls };
}

test('the shortcut import adds an absent character once and reuses it without replacing the chosen portrait', async () => {
    const f = fixture();
    try {
        const first = await pullStCharacter(f.store, f.env, 'mara.png');
        assert.equal(f.store.get().characters.length, 1);
        assert.equal(first.character.origin.avatar, 'mara.png');
        const id = first.character.id;
        f.store.get().characters[0].avatarMediaId = 'user-selected-portrait';
        const second = await pullStCharacter(f.store, f.env, 'mara.png');
        assert.equal(second.existing, true);
        assert.equal(second.character.id, id);
        assert.equal(second.character.avatarMediaId, 'user-selected-portrait');
        assert.equal(f.calls.filter(x => x === '/api/characters/export').length, 1);
        assert.equal(f.store.get().characters.length, 1);
    } finally { delete globalThis.SillyTavern; }
});

test('concurrent imports of the same ST character cannot add duplicates', async () => {
    const f = fixture();
    try {
        const [a,b] = await Promise.all([pullStCharacter(f.store,f.env,'mara.png'),pullStCharacter(f.store,f.env,'mara.png')]);
        assert.equal(f.store.get().characters.length, 1);
        assert.equal(a.character.id, b.character.id);
        assert.equal(f.calls.filter(x => x === '/api/characters/export').length, 1);
    } finally { delete globalThis.SillyTavern; }
});

test('a project switch during character export cannot import into the replacement project', async () => {
    const f = fixture();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => { const response = await originalFetch(...args); if (args[0] === '/api/characters/export') f.store.reset(createProject('Other project')); return response; };
    try {
        await assert.rejects(pullStCharacter(f.store,f.env,'mara.png'), /project.*changed/i);
        assert.equal(f.store.get().characters.length, 0);
    } finally { delete globalThis.SillyTavern; }
});

test('a delayed import that expires without a retry cannot attach a character', async () => {
    const f = fixture();
    const ctx = { characterId:0, characters:[{avatar:'mara.png'}], getCurrentChatId:()=> 'chat', chat:[{mes:'Rainy platform'}], extensionSettings:{} };
    const request = createSceneShortcut(ctx,{timeoutMs:10});
    const originalFetch=globalThis.fetch;let release;
    globalThis.fetch=async(...args)=>{if(args[0]==='/api/characters/export')await new Promise(resolve=>{release=resolve});return originalFetch(...args)};
    const importing=pullStCharacter(f.store,f.env,'mara.png',{guard:()=>request.state!=='finished'});
    importing.catch(()=>{});
    try {
        await assert.rejects(request.promise,/Pictures|time/i);release();
        await assert.rejects(importing,/expired|cancelled/i);
        assert.equal(f.store.get().characters.length,0);
    } finally { request.fail(new Error('test cleanup'));delete globalThis.SillyTavern; }
});

test('expiry then retry shares a delayed export and adds exactly one character for the live request', async () => {
    const f = fixture();
    const ctx = { characterId:0, characters:[{avatar:'mara.png'}], getCurrentChatId:()=> 'chat', chat:[{mes:'Rainy platform'}], extensionSettings:{} };
    const firstRequest = createSceneShortcut(ctx,{timeoutMs:10});
    const originalFetch=globalThis.fetch;let release;
    globalThis.fetch=async(...args)=>{if(args[0]==='/api/characters/export')await new Promise(resolve=>{release=resolve});return originalFetch(...args)};
    const first=pullStCharacter(f.store,f.env,'mara.png',{guard:()=>firstRequest.state!=='finished'});first.catch(()=>{});
    let retry;
    try {
        await assert.rejects(firstRequest.promise,/Pictures|time/i);
        retry=createSceneShortcut(ctx);
        const second=pullStCharacter(f.store,f.env,'mara.png',{guard:()=>retry.state!=='finished'});
        release();const[a,b]=await Promise.all([first,second]);
        assert.equal(a.character.id,b.character.id);
        assert.equal(f.store.get().characters.length,1);
        assert.equal(f.calls.filter(x=>x==='/api/characters/export').length,1);
        retry.complete('ready');await retry.promise;
    } finally { retry?.fail(new Error('test cleanup'));delete globalThis.SillyTavern; }
});
