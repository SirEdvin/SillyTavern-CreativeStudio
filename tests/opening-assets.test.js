import test from 'node:test';import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {sha256Hex} from '../src/core/sha256.js';
import {withOpeningAssets} from '../src/core/opening-assets.js';
import {blankPng} from '../src/core/png.js';
import {emptyCardV3} from '../src/core/card.js';
import {setOpeningEntry,openingEntries} from '../src/core/opening-illustrations.js';
import {exportCard,importCardFile} from '../src/core/cardio.js';
import {zipSync} from '../vendor/fflate.mjs';
import {buildBundle} from '../src/core/bundle.js';
import {createProject,newCharacter} from '../src/core/project.js';
function fixture(){let c=emptyCardV3('Mara (v2)');c.data.first_mes='At the library';c.data.alternate_greetings=['At the station'];c=setOpeningEntry(c,'first',{id:'open_first',sourceText:c.data.first_mes,mediaId:'local1',url:'/user/files/old-server.png',referenceMediaId:'portrait'});c=setOpeningEntry(c,'alt:0',{id:'open_alt',sourceText:c.data.alternate_greetings[0],mediaId:'local2',url:'/user/files/other-old.png'});return c}
test('oversized CHARX entry counts are rejected before unbounded expansion',()=>{
 const files=Object.fromEntries(Array.from({length:513},(_,i)=>['extra/'+i,new Uint8Array()]));assert.throws(()=>importCardFile(zipSync(files),'many.charx'),/expansion limit/);
});
test('project bundles retain distinct CHARX/PNG files for duplicate display names',()=>{
 const p=createProject('Duplicate names'),a=newCharacter('Mara'),b=newCharacter('Mara');p.characters=[a,b];
 const result=buildBundle(p,{includeCharx:true});assert.equal(result.manifest.entries.filter(e=>e.type==='character-charx').length,2);assert.ok(result.files['characters/Mara.charx']);assert.ok(result.files['characters/Mara-2.charx']);
});
test('portable SHA-256 matches native crypto across padding boundaries and large inputs',()=>{for(const size of [0,1,3,55,56,63,64,65,128,1000,100000]){const bytes=randomBytes(size);assert.equal(sha256Hex(bytes),createHash('sha256').update(bytes).digest('hex'))}});
test('CHARX opening assets use immutable content-hashed misc names and native-importable local links',()=>{
 const c=fixture(),images={open_first:blankPng(),open_alt:blankPng()},out=withOpeningAssets(c,images,'Mara (v2)',{referenceMediaId:'portrait'});
 assert.match(out.card.data.first_mes,/\/user\/images\/Mara%20%28v2%29\/cs_opening_[a-f0-9]{64}\.png/);
 assert.doesNotMatch(JSON.stringify(out.card),/old-server|other-old|local1|local2|"referenceMediaId"/);
 assert.equal(out.card.data.assets.filter(a=>a.type==='other').length,1);assert.equal(Object.keys(out.files).length,1);
 assert.ok(Object.values(openingEntries(out.card)).every(e=>e.assetPath&&e.contentHash));
});
test('bundled CHARX round-trip keeps both illustrations without old server dependencies',()=>{
 const c=fixture(),r=exportCard('charx',{card:c,openingImages:{open_first:blankPng(),open_alt:blankPng()},openingFolder:'Mara (v2)'});
 const imported=importCardFile(r.bytes,'card.charx');assert.equal(imported.card.data.alternate_greetings.length,1);assert.match(imported.card.data.first_mes,/Opening illustration/);assert.doesNotMatch(imported.card.data.first_mes,/old-server/);
 for(const e of Object.values(openingEntries(imported.card)))assert.deepEqual(imported.assetFiles[e.assetPath],blankPng());
});
test('missing/invalid opening bytes and unsafe or absent native folders fail rather than export broken images',()=>{
 for(const images of [{},{open_first:new Uint8Array([1,2]),open_alt:blankPng()}])assert.throws(()=>withOpeningAssets(fixture(),images,'Mara'),/missing|PNG|image/i);
 for(const folder of ['', '../Mara','Mara/name'])assert.throws(()=>withOpeningAssets(fixture(),{open_first:blankPng(),open_alt:blankPng()},folder),/folder|sanitized/i);
});
test('plain PNG/JSON exports materialize local images but explicitly warn they do not carry illustration files',()=>{
 for(const kind of ['png-st','png-v3','json-v3','json-v2','json-st']){const r=exportCard(kind,{card:fixture()});assert.ok(r.notes.some(n=>/opening.*CHARX|CHARX.*opening/i.test(n)));const c=importCardFile(r.bytes,'c.'+r.ext);assert.match(c.card.data.first_mes,/old-server.png/)}
});
