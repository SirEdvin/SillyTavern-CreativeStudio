import test from 'node:test';import assert from 'node:assert/strict';
// Explicit Node raster-decoder fixture; actual malformed-raster rejection is covered in Chromium.
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
import {createProject,newCharacter,cardForSt} from '../src/core/project.js';
import {createStore} from '../src/ui/store.js';
import {importCard} from '../src/ui/importer.js';
import {exportCard,importCardFile} from '../src/core/cardio.js';
import {writeCharx} from '../src/core/charx.js';
import {blankPng,writeCardChunks} from '../src/core/png.js';
import {openingEntries,setOpeningEntry} from '../src/core/opening-illustrations.js';
import {collectOpeningExport,loadLocalOpeningImage} from '../src/ui/opening-assets.js';
function source(){const c=newCharacter('Mara');c.card.data.first_mes='A library';c.card.data.alternate_greetings=['A station'];c.card=setOpeningEntry(c.card,'first',{id:'open_first',sourceText:'A library',mediaId:'old-first',url:'/user/files/old.png'});c.card=setOpeningEntry(c.card,'alt:0',{id:'open_alt',sourceText:'A station',mediaId:'old-alt',url:'/user/files/old-alt.png'});return c}
function fixture(){const store=createStore(createProject('Destination')),files=new Map(),toasts=[];const env={toast:(...a)=>toasts.push(a),storage:{saveMedia:async(_p,id,ext,bytes)=>{const url=`/user/files/${id}.${ext}`;files.set(url,bytes);return url},loadMediaBytes:async url=>files.get(url)}};return{store,env,files,toasts}}
function archive(){return exportCard('charx',{card:source().card,image:blankPng(),openingImages:{open_first:blankPng(),open_alt:blankPng()},openingFolder:'Mara'}).bytes}
test('CHARX import restores portable opening assets as image media with fresh IDs and local URLs',async()=>{
 const f=fixture(),c=await importCard(f.store,f.env,archive(),'card.charx');assert.ok(c);const entries=openingEntries(c.card);
 assert.equal(c.card.data.first_mes,'A library');assert.equal(c.card.data.alternate_greetings[0],'A station');
 for(const e of Object.values(entries)){assert.ok(f.store.get().media.some(m=>m.id===e.mediaId&&m.kind==='image'));assert.ok(f.files.has(e.url));assert.notEqual(e.mediaId,'old-first');assert.equal(e.referenceMediaId,c.avatarMediaId)}
 const ready=cardForSt(f.store.get(),c);assert.match(ready.data.first_mes,new RegExp(entries.first.mediaId));
 const collected=await collectOpeningExport(f.env,f.store.get(),c,{sanitize:async()=> 'Mara renamed',loadLocal:url=>f.env.storage.loadMediaBytes(url)});
 const round=importCardFile(exportCard('charx',{card:ready,...collected}).bytes,'round.charx');assert.match(round.card.data.first_mes,/Mara%20renamed/);assert.doesNotMatch(round.card.data.first_mes,/\/user\/files\//);
});
test('missing and corrupt declared CHARX opening images reject import without adding a partial character',async()=>{
 const parsed=importCardFile(archive(),'card.charx'),path=openingEntries(parsed.card).first.assetPath;
 for(const corrupt of [false,true]){const f=fixture(),files={...parsed.assetFiles};if(corrupt)files[path]=writeCardChunks(blankPng(),{chara:'{}'});else delete files[path];const bad=writeCharx(parsed.card,files).bytes;assert.equal(await importCard(f.store,f.env,bad,'bad.charx'),null);assert.equal(f.store.get().characters.length,0)}
});
test('removed opening images are not accidentally included as unreferenced CHARX files',async()=>{
 const parsed=importCardFile(archive(),'card.charx');let card=parsed.card;for(const key of Object.keys(openingEntries(card)))card=setOpeningEntry(card,key,null);
 const result=importCardFile(exportCard('charx',{card,assetFiles:parsed.assetFiles}).bytes,'without.charx');assert.equal(Object.keys(result.assetFiles).filter(p=>p.startsWith('assets/openings/')).length,0);assert.equal(result.card.data.first_mes,'A library');
});
test('local PNG cards rehydrate safe own-origin links; missing links remain explicit and block apply',async()=>{
 const original=globalThis.fetch;try{
  for(const available of [true,false]){const f=fixture();globalThis.fetch=async(url,options)=>{assert.match(url,/^\/user\/files\//);assert.equal(options.credentials,'same-origin');return available?new Response(blankPng()):new Response('',{status:404})};const bytes=exportCard('png-v3',{card:source().card,image:blankPng()}).bytes;const c=await importCard(f.store,f.env,bytes,'local.png');assert.ok(c);if(available)assert.match(cardForSt(f.store.get(),c).data.first_mes,/Opening illustration/);else{assert.equal(openingEntries(c.card).first.missing,true);assert.throws(()=>cardForSt(f.store.get(),c),/missing/i)}}
 }finally{globalThis.fetch=original}
});
test('unsafe opening URLs never issue fetches; own-origin stream lengths are bounded',async()=>{
 let requests=0;for(const url of ['https://evil.invalid/a.png','/api/secrets/read','/user/files/../secret','//evil.invalid/a.png'])await assert.rejects(loadLocalOpeningImage(url,{fetcher:async()=>{requests++;return new Response(blankPng())}}),/unsafe/i);assert.equal(requests,0);
 await assert.rejects(loadLocalOpeningImage('/user/files/image.png',{fetcher:async()=>new Response('',{headers:{'content-length':'999999999'}})}),/size limit/i);
});
test('switching projects during import cannot attach imported illustration media to the replacement',async()=>{
 const f=fixture();f.env.storage.saveMedia=async()=>{f.store.reset(createProject('Replacement'));return '/user/files/x.png'};assert.equal(await importCard(f.store,f.env,archive(),'card.charx'),null);assert.equal(f.store.get().characters.length,0);
});
