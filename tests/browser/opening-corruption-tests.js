// Real Chromium raster decoding; only storage/native services are synthetic fixtures.
import {blankPng,extractChunks,encodeChunks} from '/src/core/png.js';
import {validateOpeningPng} from '/src/core/opening-assets.js';
import {emptyCardV3} from '/src/core/card.js';
import {createProject,cardForSt} from '/src/core/project.js';
import {setOpeningEntry,openingEntries} from '/src/core/opening-illustrations.js';
import {exportCard} from '/src/core/cardio.js';
import {importCard} from '/src/ui/importer.js';
import {createStore} from '/src/ui/store.js';
import {decodeOpeningPng,verifyOpeningImages} from '/src/ui/opening-assets.js';
const assert=(v,m)=>{if(!v)throw new Error(m)};
window.runOpeningCorruptionTests=async()=>{
 const bad=encodeChunks(extractChunks(blankPng()).map(c=>({name:c.name,data:c.name==='IDAT'?new Uint8Array([0,1,2,3]):c.data})));validateOpeningPng(bad);
 let rejected=false;try{await decodeOpeningPng(bad)}catch(e){rejected=/decode/.test(e.message)}assert(rejected,'actual browser raster decoder rejects corrupt IDAT despite valid CRCs');
 let card=emptyCardV3('Mara');card.data.first_mes='Illustrated opening';card=setOpeningEntry(card,'first',{id:'open_bad',sourceText:card.data.first_mes,url:'/user/files/invalid-raster.png'});
 const env={toast:()=>{},storage:{saveMedia:async(_p,id)=>'/user/files/'+id+'.png'}},archive=exportCard('charx',{card,image:blankPng(),openingImages:{open_bad:bad},openingFolder:'Mara'}).bytes;
 const charxStore=createStore(createProject('Corrupt CHARX'));assert(await importCard(charxStore,env,archive,'bad.charx')===null,'corrupt raster CHARX import fails');assert(charxStore.get().characters.length===0,'no partial healthy character on failed import');
 const previousFetch=globalThis.fetch;globalThis.fetch=async(url,opts)=>url==='/user/files/invalid-raster.png'?new Response(bad):previousFetch(url,opts);
 try{
  const localStore=createStore(createProject('Corrupt local PNG')),png=exportCard('png-v3',{card,image:blankPng()}).bytes,imported=await importCard(localStore,env,png,'local.png');assert(imported&&openingEntries(imported.card).first.missing===true,'local PNG decoding failure becomes explicit missing illustration');
  let blocked=false;try{cardForSt(localStore.get(),imported)}catch{blocked=true}assert(blocked,'missing decoded image blocks apply');
  rejected=false;try{await verifyOpeningImages(card)}catch(e){rejected=/decode/.test(e.message)}assert(rejected,'apply preflight rejects corrupt raster');
 }finally{globalThis.fetch=previousFetch}
 return ['PASS real browser decoder rejects valid-CRC corrupt IDAT','PASS corrupt CHARX raster cannot become a healthy imported illustration','PASS corrupt local PNG marks missing and blocks apply','PASS native apply preflight rejects undecodable PNG'];
};
