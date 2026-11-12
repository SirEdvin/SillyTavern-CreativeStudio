import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../src/st/storage.js';
import { createProject, newCharacter, upsertArtifact } from '../src/core/project.js';
import { base64ToBytes, utf8Decode } from '../src/core/bytes.js';

function fakeServer({ failUploads = false } = {}) {
    const files = new Map();
    const transport = {
        upload: async (name, b64) => {
            if (failUploads) throw new Error('server down');
            if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error(`illegal name ${name}`);
            files.set(`user/files/${name}`, base64ToBytes(b64));
            return `user/files/${name}`;
        },
        fetch: async path => {
            const f = files.get(path);
            if (!f) return { ok: false, status: 404 };
            return { ok: true, status: 200, json: async () => JSON.parse(utf8Decode(f)), arrayBuffer: async () => f.buffer };
        },
        remove: async path => { files.delete(path); },
    };
    const mem = new Map();
    transport.cache = { getItem: async k => mem.get(k) ?? null, setItem: async (k, v) => { mem.set(k, structuredClone(v)); }, removeItem: async k => { mem.delete(k); } };
    return { files, transport };
}

test('save/load/list; snapshots survive later saves', async () => {
    const { transport } = fakeServer();
    const s = createStorage(transport);
    let p = upsertArtifact(createProject('A'), 'characters', newCharacter('Mira'));
    await s.saveProject(p);
    await s.saveSnapshot(p, 'first');
    p = { ...p, name: 'A2', modified: new Date(Date.now() + 1000).toISOString() };
    await s.saveProject(p);
    const list = await s.listProjects();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'A2');
    const snaps = await s.listSnapshots(p.id);
    assert.equal(snaps.length, 1, 'snapshot entry kept after a later save');
    const loaded = await s.loadProject(p.id);
    assert.equal(loaded.characters[0].card.data.name, 'Mira');
    const snap = await s.loadSnapshot(p.id, snaps[0].id);
    assert.equal(snap.project.name, 'A');
});

test('concurrent save from another tab is detected and preserved as a snapshot', async () => {
    const { transport } = fakeServer();
    const tabA = createStorage(transport);
    const tabB = createStorage(transport);
    const p = createProject('Shared');
    const first = await tabA.saveProject(p);
    const loadedB = await tabB.loadProject(p.id);
    const b = await tabB.saveProject({ ...loadedB, notes: 'from B' }, { baseRevision: loadedB.revision });
    assert.equal(b.conflict, undefined);
    const a = await tabA.saveProject({ ...p, notes: 'from A' }, { baseRevision: first.revision });
    assert.ok(a.conflict, 'conflict reported');
    const snaps = await tabA.listSnapshots(p.id);
    const kept = await tabA.loadSnapshot(p.id, snaps.find(x => x.kind === 'conflict').id);
    assert.equal(kept.project.notes, 'from B');
});

test('server failure falls back to browser cache and reload prefers the newer copy', async () => {
    const srv = fakeServer();
    const s = createStorage(srv.transport);
    const p = createProject('Offline');
    await s.saveProject(p);
    const down = createStorage({ ...srv.transport, upload: async () => { throw new Error('down'); } });
    const r = await down.saveProject({ ...p, notes: 'unsynced', modified: new Date(Date.now() + 5000).toISOString() });
    assert.equal(r.where, 'browser');
    const loaded = await s.loadProject(p.id);
    assert.equal(loaded.notes, 'unsynced');
    assert.match(loaded._loadedFrom, /browser cache/);
});

test('concurrent background and foreground saves retain both index entries',async()=>{
    const {transport}=fakeServer();const s=createStorage(transport),a=createProject('A'),b=createProject('B');
    await Promise.all([s.saveProject(a),s.saveProject(b,{activate:false})]);
    assert.deepEqual(new Set((await s.listProjects()).map(p=>p.id)),new Set([a.id,b.id]));
    assert.equal((await s.loadLastProject()).id,a.id);
});

test('strict background saves fail closed on revision read errors and deleted projects with zero uploads',async()=>{
    const {transport}=fakeServer();let uploads=0;
    const counted={...transport,upload:async(...args)=>{uploads++;return transport.upload(...args)}};
    const failed=createStorage({...counted,fetch:async()=>{throw new Error('temporary GET failure')}});
    await assert.rejects(failed.saveProject(createProject('Old'),{baseRevision:'old',rejectConflict:true,activate:false}),/verify.*revision/i);
    assert.equal(uploads,0);
    const missing=createStorage({...counted,fetch:async()=>({ok:false,status:404})});
    await assert.rejects(missing.saveProject(createProject('Deleted'),{baseRevision:'old',rejectConflict:true,activate:false}),/deleted/i);
    assert.equal(uploads,0);
});
test('background saves preserve lastOpen and reject stale revisions without overwriting another tab',async()=>{
    const {transport}=fakeServer();const s=createStorage(transport),visible=createProject('Visible'),background=createProject('Background');
    await s.saveProject(visible);const first=await s.saveProject(background,{activate:false});
    assert.equal((await s.loadLastProject()).id,visible.id);
    await s.saveProject({...background,notes:'newer remote edit'},{baseRevision:first.revision,activate:false});
    await assert.rejects(s.saveProject({...background,notes:'stale overwrite'},{baseRevision:first.revision,activate:false,rejectConflict:true}),/changed.*tab/i);
    assert.equal((await s.loadProject(background.id)).notes,'newer remote edit');
});
