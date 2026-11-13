import test from 'node:test';import assert from 'node:assert/strict';
// Explicit Node raster-decoder fixture; actual malformed-raster rejection is covered in Chromium.
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
import {applyCardToSt} from '../src/st/live.js';
import {emptyCardV3,toSillyTavernShape} from '../src/core/card.js';
import {setOpeningEntry,decorateOpeningCard,openingStorageError} from '../src/core/opening-illustrations.js';
import {blankPng} from '../src/core/png.js';
import {nativeMergeUpdate} from './helpers/native-merge.js';
function fixture({lost=false,missing=false,readbackError=false}={}){const oldST=globalThis.SillyTavern,oldFetch=globalThis.fetch,calls=[];let stored=toSillyTavernShape(emptyCardV3('Mara')),gets=0;
 globalThis.SillyTavern={getContext:()=>({getRequestHeaders:()=>({'Content-Type':'application/json'}),characters:[]})};
 globalThis.fetch=async(url,options={})=>{calls.push({url,options});if(url==='/user/files/scene.png')return missing?new Response('',{status:404}):new Response(blankPng());if(url==='/api/characters/get'){if(readbackError&&++gets>1)throw new Error('Readback network failure');return Response.json(stored)}if(url==='/api/characters/merge-attributes'){const payload=JSON.parse(options.body);stored=nativeMergeUpdate(stored,payload);if(lost){stored.data.first_mes='Image lost';stored.first_mes='Image lost'}return Response.json({})}throw new Error('Unexpected fixture request '+url)};
 let card=emptyCardV3('Mara');card.data.first_mes='Opening text';card=decorateOpeningCard(setOpeningEntry(card,'first',{id:'open_one',sourceText:'Opening text',url:'/user/files/scene.png'}));
 return {calls,card,get stored(){return stored},restore(){globalThis.fetch=oldFetch;globalThis.SillyTavern=oldST}};
}
test('apply preflights owned images and verifies native greeting/mirror with a live backup',async()=>{const f=fixture();try{const r=await applyCardToSt('mara.png',f.card);assert.equal(r.openingError,'');assert.ok(r.backup.data);assert.equal(f.stored.first_mes,f.card.data.first_mes);assert.equal(f.stored.data.first_mes,f.card.data.first_mes);assert.ok(f.calls.findIndex(c=>c.url==='/user/files/scene.png')<f.calls.findIndex(c=>c.url==='/api/characters/merge-attributes'))}finally{f.restore()}});
test('missing images prevent card writes, while readback loss remains an explicit error with backup retained',async()=>{
 const a=fixture({missing:true});try{await assert.rejects(applyCardToSt('mara.png',a.card),/unavailable/);assert.ok(!a.calls.some(c=>c.url==='/api/characters/merge-attributes'))}finally{a.restore()}
 const b=fixture({lost:true});try{const r=await applyCardToSt('mara.png',b.card);assert.match(r.openingError,/could not be verified/);assert.ok(r.backup.data)}finally{b.restore()}
});
test('post-write readback exceptions retain the live backup with an explicit unverified result',async()=>{
 const f=fixture({readbackError:true});try{const r=await applyCardToSt('mara.png',f.card);assert.ok(r.backup.data);assert.match(r.error,/could not be verified/);assert.equal(f.stored.data.first_mes,f.card.data.first_mes);assert.equal(f.calls.filter(c=>c.url==='/api/characters/merge-attributes').length,1)}finally{f.restore()}
});
test('native deep merge removes obsolete managed entries and replacement fields',async()=>{
 const f=fixture();try{
  let card=structuredClone(f.card);card.data.alternate_greetings=['Alternate'];card=setOpeningEntry(card,'alt:0',{id:'open_alt',sourceText:'Alternate',url:'/user/files/scene.png',assetName:'obsolete'});card=decorateOpeningCard(card);await applyCardToSt('mara.png',card);
  card=decorateOpeningCard(setOpeningEntry(card,'alt:0',null));const removed=await applyCardToSt('mara.png',card);assert.equal(removed.openingError,'');assert.equal(openingStorageError(card,f.stored),'');assert.equal(f.stored.data.extensions.creative_studio.openingIllustrations.entries['alt:0'],undefined);
  card=decorateOpeningCard(setOpeningEntry(card,'first',{...card.data.extensions.creative_studio.openingIllustrations.entries.first,assetName:'old-name'}));await applyCardToSt('mara.png',card);
  const entry={...card.data.extensions.creative_studio.openingIllustrations.entries.first};delete entry.assetName;card=decorateOpeningCard(setOpeningEntry(card,'first',entry));await applyCardToSt('mara.png',card);assert.equal(f.stored.data.extensions.creative_studio.openingIllustrations.entries.first.assetName,undefined);
 }finally{f.restore()}
});
test('removing a managed illustration is also verified against old stored managed slots',()=>{const old=fixture();try{const plain=emptyCardV3('Mara');plain.data.first_mes='Opening text';assert.match(openingStorageError(plain,{data:old.card.data},old.card),/could not be verified/)}finally{old.restore()}});
