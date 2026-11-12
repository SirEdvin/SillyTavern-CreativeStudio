import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject,newCharacter } from '../src/core/project.js';
import { createStore } from '../src/ui/store.js';
import { blankPng,writeCardChunks } from '../src/core/png.js';
import { setNanoSessionKey } from '../src/st/nanogpt.js';
import { illustrateChatMessage } from '../src/st/chat-scene.js';

function fixture(){
    const project=createProject('Visible project'),character=newCharacter('Mara');
    character.origin={kind:'st',avatar:'mara.png'};character.avatarMediaId='original';project.characters=[character];project.media=[{id:'original',kind:'image',url:'/portrait.png'}];
    const ctx={getRequestHeaders:()=>({'Content-Type':'application/json'}),characterId:0,characters:[{avatar:'mara.png',name:'Mara'}],getCurrentChatId:()=> 'chat-a',chat:[{mes:'She waits on the rainy platform.',name:'Mara',is_user:false}],extensionSettings:{creativeStudio:{image:{backend:'nanogpt',nanoModel:'editing-model'}}},updateMessageBlock:()=>{}};
    let savedChat=structuredClone(ctx.chat);ctx.saveChat=async()=>{savedChat=structuredClone(ctx.chat)};
    globalThis.SillyTavern={getContext:()=>({...ctx})};setNanoSessionKey('fixture-only-not-a-real-key',ctx);
    const calls={llm:0,paid:0,exports:0,saves:[]},store=createStore(project),png=blankPng();
    const env={toast:()=>{},saveNow:async()=>{},saveState:()=>({status:'idle'}),storage:{listProjects:async()=>[],saveProject:async(p,opts)=>{calls.saves.push({project:structuredClone(p),opts});return {where:'server',revision:'revision-'+calls.saves.length}},saveMedia:async(pid,mid)=>`user/files/${pid}-${mid}.png`,loadMediaBytes:async()=>png}};
    globalThis.fetch=async url=>{if(url==='/api/characters/export'){calls.exports++;return new Response(writeCardChunks(png,{chara:JSON.stringify(character.card.data)}))}if(url.startsWith('/api/sprites/get?'))return Response.json([]);throw new Error('Unexpected request '+url)};
    const llm=async()=>{calls.llm++;return {value:{scene:'Rainy railway platform',instruction:'Use the portrait as identity reference; put her in a black coat on the rainy platform.'}}};
    const generate=async args=>{await args.beforeSubmit();calls.paid++;return {bytes:png,model:'editing-model'}};
    const readChat=async()=>structuredClone(savedChat);
    const run=opts=>illustrateChatMessage({runtime:{store,env},generate,runLlm:llm,readChat,...opts});
    return {project,character,ctx,store,env,calls,run,generate,llm,setSaved:chat=>{savedChat=chat},saved:()=>savedChat};
}
test('headless action reuses a character, generates once and attaches/persists on the character reply',async()=>{
    const f=fixture();try{
        const result=await f.run();assert.equal(result.messageIndex,0);assert.equal(f.calls.exports,0);assert.equal(f.calls.llm,1);assert.equal(f.calls.paid,1);
        assert.equal(f.store.get().characters.length,1);assert.equal(f.ctx.chat.length,1);assert.equal(f.saved()[0].extra.media[0].url,result.media.url);
        await assert.rejects(f.run(),/already.*image/i);assert.equal(f.calls.paid,1);
    }finally{delete globalThis.SillyTavern}
});
test('an absent character is imported into a background project without switching the visible project',async()=>{
    const f=fixture();f.store.get().characters=[];f.store.get().media=[];
    try{
        const result=await f.run();assert.notEqual(result.projectId,f.project.id);assert.equal(f.store.get().id,f.project.id);assert.equal(f.store.get().characters.length,0);
        assert.equal(f.calls.exports,1);assert.equal(f.calls.saves.at(-1).project.characters.length,1);assert.ok(f.calls.saves.every(x=>x.opts.activate===false));
    }finally{delete globalThis.SillyTavern}
});
test('a saved character in another project is reused without importing or changing the visible project',async()=>{
    const f=fixture(),home=structuredClone(f.project);home.id='existing-home';home.revision='base';f.store.get().characters=[];
    f.env.storage.listProjects=async()=>[{id:home.id,stAvatars:['mara.png']}];f.env.storage.loadProject=async()=>home;
    try{const result=await f.run();assert.equal(result.projectId,home.id);assert.equal(result.characterId,f.character.id);assert.equal(f.calls.exports,0);assert.equal(f.store.get().id,f.project.id);assert.equal(f.calls.saves.at(-1).opts.activate,false)}finally{delete globalThis.SillyTavern}
});
test('a saved image from another tab blocks before imports, LLM or paid generation',async()=>{
    const f=fixture();f.setSaved([{...f.ctx.chat[0],extra:{media:[{type:'image',url:'/existing.png'}]}}]);
    try{await assert.rejects(f.run(),/already.*image/i);assert.equal(f.calls.llm,0);assert.equal(f.calls.paid,0);assert.equal(f.calls.exports,0);assert.equal(f.calls.saves.length,0)}finally{delete globalThis.SillyTavern}
});
test('an image arriving during provider preparation blocks the paid submission',async()=>{
    const f=fixture();try{
        await assert.rejects(f.run({generate:async args=>{f.setSaved([{...f.ctx.chat[0],extra:{image:'/existing.png'}}]);return f.generate(args)}}),/already.*image/i);
        assert.equal(f.calls.paid,0);assert.equal(f.ctx.chat[0].extra,undefined);
    }finally{delete globalThis.SillyTavern}
});
test('edits during LLM generation invalidate the target before image generation',async()=>{
    const f=fixture();try{await assert.rejects(f.run({runLlm:async()=>{const r=await f.llm();f.ctx.chat[0].mes='Changed reply';return r}}),/changed/i);assert.equal(f.calls.paid,0)}finally{delete globalThis.SillyTavern}
});
test('concurrent action is refused, and provider errors never retry or attach a placeholder',async()=>{
    const f=fixture();let release;try{
        const first=f.run({runLlm:async()=>{await new Promise(resolve=>{release=resolve});return f.llm()}});
        while(!release)await new Promise(resolve=>setTimeout(resolve,1));
        await assert.rejects(f.run(),/already.*progress/i);release();await first;assert.equal(f.calls.paid,1);
    }finally{delete globalThis.SillyTavern}
    const g=fixture();try{await assert.rejects(g.run({generate:async()=>{g.calls.paid++;throw new Error('Provider failed')}}),/Provider failed/);assert.equal(g.calls.paid,1);assert.equal(g.ctx.chat[0].extra,undefined)}finally{delete globalThis.SillyTavern}
});
test('remote turns added after image generation are preserved and never overwritten by attachment',async()=>{
    const f=fixture();try{
        await assert.rejects(f.run({generate:async args=>{const image=await f.generate(args);f.saved().push({mes:'Remote new reply',is_user:false});return image}}),/saved chat changed/i);
        assert.equal(f.saved().length,2);assert.equal(f.ctx.chat[0].extra,undefined);assert.equal(f.calls.paid,1);
        assert.equal(f.store.get().media.length,2); // Paid output retained in gallery.
        await assert.rejects(f.run(),/saved chat changed/i);assert.equal(f.calls.paid,1);
    }finally{delete globalThis.SillyTavern}
});
test('unverified chat persistence reports failure but keeps the visible image and blocks a second payment',async()=>{
    const f=fixture();f.ctx.saveChat=async()=>{};
    try{await assert.rejects(f.run(),/persist|sav|verif/i);assert.equal(f.ctx.chat[0].extra.media.length,1);await assert.rejects(f.run(),/already.*image/i);assert.equal(f.calls.paid,1)}finally{delete globalThis.SillyTavern}
});
