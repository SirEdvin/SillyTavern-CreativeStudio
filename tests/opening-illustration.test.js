import test from 'node:test';
import assert from 'node:assert/strict';
import {illustrateOpening} from '../src/st/opening-illustration.js';
import {createProject,newCharacter,editArtifactField} from '../src/core/project.js';
import {openingEntries} from '../src/core/opening-illustrations.js';
import {createStore} from '../src/ui/store.js';
function fixture(){const p=createProject('Draft'),c=newCharacter('Mara');c.card.data.first_mes='Mara opens the library door.';c.card.data.alternate_greetings=['Mara waits at the station.'];c.avatarMediaId='portrait';p.characters=[c];p.media=[{id:'portrait',kind:'image',url:'/user/files/portrait.png'}];const store=createStore(p),calls=[],bytes=new Uint8Array([137,80,78,71,13,10,26,10]);const env={storage:{loadMediaBytes:async()=>bytes,saveMedia:async()=>'/user/files/illustration.png'}};const ctx={extensionSettings:{}};
 return {p,c,store,env,ctx,calls,bytes,run:opts=>illustrateOpening({store,env,ctx,projectId:p.id,characterId:c.id,key:'first',runLlm:async(_ctx,args)=>{calls.push(['llm',args]);return {value:{scene:'At the library door.',instruction:'Use the original portrait; show Mara opening the door.'},meta:{model:'fixture'}}},generate:async args=>{calls.push(['image',args]);await args.beforeSubmit();return {bytes,model:'fixture-image'}},...opts})}}
test('no-chat opening generation saves the selected slot, exact submitted user-POV prompt and keeps avatar/text unchanged',async()=>{
 const f=fixture(),out=await f.run();const e=openingEntries(f.store.get().characters[0].card).first;
 assert.equal(e.mediaId,out.media.id);assert.equal(e.sourceText,f.c.card.data.first_mes);assert.equal(e.instruction,f.calls.find(x=>x[0]==='image')[1].instruction);assert.match(e.instruction,/first-person user POV/);assert.match(f.calls[0][1].user,/library door/);assert.match(f.calls[0][1].system,/selected opening/i);assert.equal(f.store.get().characters[0].avatarMediaId,'portrait');assert.equal(f.store.get().characters[0].card.data.first_mes,f.c.card.data.first_mes);
 f.store.undo();assert.equal(openingEntries(f.store.get().characters[0].card).first,undefined);
});
test('alternate generation uses only the selected opening as scene data and leaves the first entry alone',async()=>{
 const f=fixture();await f.run({key:'alt:0'});assert.equal(openingEntries(f.store.get().characters[0].card).first,undefined);assert.equal(openingEntries(f.store.get().characters[0].card)['alt:0'].sourceText,'Mara waits at the station.');assert.match(f.calls[0][1].user,/station/);
});
test('missing portraits and empty/deleted slots fail before text or image requests',async()=>{
 for(const patch of [{avatarMediaId:''},{card:{...fixture().c.card,data:{...fixture().c.card.data,first_mes:''}}}]){const f=fixture();f.store.update(p=>({...p,characters:[{...p.characters[0],...patch}]}));await assert.rejects(f.run(),/portrait|opening|empty/i);assert.equal(f.calls.length,0)}
});
test('edits, portrait switches, slot deletion and cancellation during LLM preparation prevent image payment',async()=>{
 for(const change of [f=>f.store.update(p=>editArtifactField(p,'characters',f.c.id,'card.data.first_mes','Changed opening')),f=>f.store.update(p=>({...p,characters:[]})),f=>f.store.update(p=>editArtifactField(p,'characters',f.c.id,'avatarMediaId','another'))]){
  const f=fixture();await assert.rejects(f.run({runLlm:async()=>{change(f);return {value:{scene:'Scene',instruction:'Edit'}}}}),/changed|character|project|portrait/i);assert.equal(f.calls.filter(x=>x[0]==='image').length,0);
 }
 const f=fixture(),ac=new AbortController();await assert.rejects(f.run({signal:ac.signal,runLlm:async()=>{ac.abort();return {value:{scene:'Scene',instruction:'Edit'}}}}),/cancel|abort/i);
});
test('pre-submit and upload-time ownership checks prevent stale attachment; providers are never retried',async()=>{
 const f=fixture();await assert.rejects(f.run({generate:async args=>{f.store.update(p=>editArtifactField(p,'characters',f.c.id,'card.data.first_mes','changed'));await args.beforeSubmit();return {bytes:f.bytes}}}),/changed/i);assert.equal(f.store.get().media.length,1);
 const g=fixture();g.env.storage.saveMedia=async()=>{g.store.reset(createProject('Different'));return '/user/files/illustration.png'};await assert.rejects(g.run(),/project|changed/i);
 const h=fixture();let count=0;await assert.rejects(h.run({generate:async()=>{count++;throw new Error('fixture provider failure')}}),/provider failure/);assert.equal(count,1);
});
test('one active opening job per character rejects double clicks before duplicate paid work',async()=>{
 const f=fixture();let release;const wait=new Promise(r=>release=r);const first=f.run({runLlm:async()=>{await wait;return {value:{scene:'Scene',instruction:'Edit'}}}});await assert.rejects(f.run(),/already|progress|busy/i);release();await first;assert.equal(f.calls.filter(x=>x[0]==='image').length,1);
});
