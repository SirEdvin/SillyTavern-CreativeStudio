// Export/apply/import integration. Native ST persistence/extraction routes below are explicitly TEST FIXTURES.
import {html,render,useState,useEffect} from '/vendor/preact-htm.mjs';
import {CharactersArea} from '/src/ui/areas/characters.js';
import {importCardFile} from '/src/core/cardio.js';
import {importCard} from '/src/ui/importer.js';
import {createProject,editArtifactField,cardForSt} from '/src/core/project.js';
import {createStore} from '/src/ui/store.js';
import {toSillyTavernShape} from '/src/core/card.js';
import {openingEntries,setOpeningEntry} from '/src/core/opening-illustrations.js';
import {nativeMergeUpdate} from '/tests/helpers/native-merge.js';
const assert=(value,message)=>{if(!value)throw new Error(message)};
const waitFor=async(check)=>{for(let i=0;i<240;i++){if(check())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Opening portability test timed out')};
const button=(root,label)=>[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
window.runOpeningPortabilityTests=async()=>{
 if(!window.openingEditorHarness)await window.runOpeningEditorTests();
 const h=window.sceneHarness,{store,env,id,navigate,ctx}=window.openingEditorHarness,root=document.querySelector('#root');
 const native=new Map([['mara.png',toSillyTavernShape(store.get().characters[0].card)]]),downloads=[];let failReadback=false,failAfterWrite=false;
 const previousFetch=globalThis.fetch,previousCreate=URL.createObjectURL,previousClick=HTMLAnchorElement.prototype.click;
 const clean=value=>{if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!=='__@@UNSET@@__').map(([k,v])=>[k,clean(v)]));return value};
 globalThis.fetch=async(url,options={})=>{
  if(url==='/api/files/sanitize-filename'){const body=JSON.parse(options.body);return Response.json({fileName:body.fileName.replace(/[/?<>\\:*|"\x00-\x1f]/g,'')})}
  if(url==='/api/characters/get'){if(failReadback){failReadback=false;throw new Error('Fixture post-write readback failure')}return Response.json(native.get(JSON.parse(options.body).avatar_url));}
  if(url==='/api/characters/merge-attributes'){const body=JSON.parse(options.body),old=native.get(body.avatar);native.set(body.avatar,nativeMergeUpdate(old,body));if(failAfterWrite)failReadback=true;return Response.json({})}
  if(url==='/api/characters/import'){const file=options.body.get('avatar'),parsed=importCardFile(new Uint8Array(await file.arrayBuffer()),file.name);native.set('created-opening.png',toSillyTavernShape(parsed.card));return Response.json({file_name:'created-opening'})}
  return previousFetch(url,options);
 };
 URL.createObjectURL=blob=>{downloads.push(blob);return previousCreate.call(URL,blob)};
 HTMLAnchorElement.prototype.click=function(){if(!this.download)return previousClick.call(this)};
 try{
  // Spaces and Markdown-sensitive parentheses must survive the exact native destination folder mapping.
  store.update(p=>editArtifactField(p,'characters',id,'card.data.name','Mara (illustrated)'));
  navigate({type:'characters',id,tab:'publish'});await waitFor(()=>button(root,'Download CHARX'));const paid=h.calls.filter(c=>c.type==='image').length;
  button(root,'Download CHARX').click();await waitFor(()=>downloads.length===1);
  const bytes=new Uint8Array(await downloads[0].arrayBuffer()),parsed=importCardFile(bytes,'opening.charx'),portable=openingEntries(parsed.card);
  assert(Object.keys(portable).length===2,'first and alternate illustrations exported');
  assert(!JSON.stringify(parsed.card).includes('/user/files/'),'portable card has no source-server file URLs');
  for(const e of Object.values(portable)){
   assert(e.url.startsWith('/user/images/Mara%20%28illustrated%29/'),'native sanitized display-name folder encoded exactly');
   assert(parsed.assetFiles[e.assetPath],'declared opening PNG is bundled');
   // Native ST 1.19 persists type:other image assets to user/images/<sanitized display name>/<normalized name>.png.
   const asset=parsed.card.data.assets.find(a=>a.uri===`embeded://${e.assetPath}`);assert(asset.type==='other','native misc-image category');
   h.stFiles.set(e.url,parsed.assetFiles[e.assetPath]);await h.realFetch(e.url,{method:'POST',body:parsed.assetFiles[e.assetPath]});
  }
  const firstUrl=parsed.card.data.first_mes.match(/!\[Opening illustration\]\(<([^>]+)>\)/)?.[1];assert(firstUrl,'native-compatible managed Markdown image');
  const visible=document.createElement('img');visible.src=firstUrl;visible.alt='Synthetic native-extraction fixture';root.append(visible);await waitFor(()=>visible.naturalWidth>0);visible.remove();
  // Actual review/apply component and actual applyCardToSt client, against labeled ST route fixtures.
  button(root,'Review & apply to SillyTavern…').click();await waitFor(()=>[...document.querySelectorAll('.cs-modal button')].some(b=>/^Apply \d+ change/.test(b.textContent.trim())));
  const apply=[...document.querySelectorAll('button')].find(b=>/^Apply \d+ change/.test(b.textContent.trim()));assert(apply,'apply review button');apply.click();
  await waitFor(()=>native.get('mara.png').data.first_mes.includes('cs-opening:')&&!apply.isConnected);
  const expected=cardForSt(store.get(),store.get().characters[0]);assert(native.get('mara.png').data.first_mes===expected.data.first_mes,'native card stores decorated greeting');
  assert(native.get('mara.png').first_mes===expected.data.first_mes,'V1 opening mirror updated too');
  const removedKey=Object.keys(openingEntries(expected)).find(k=>k!=='first');store.update(p=>editArtifactField(p,'characters',id,'card',setOpeningEntry(p.characters[0].card,removedKey,null)));
  await waitFor(()=>button(root,'Review & apply to SillyTavern…'));button(root,'Review & apply to SillyTavern…').click();await waitFor(()=>[...document.querySelectorAll('.cs-modal button')].some(b=>/^Apply \d+ change/.test(b.textContent.trim())));
  const second=[...document.querySelectorAll('.cs-modal button')].find(b=>/^Apply \d+ change/.test(b.textContent.trim()));second.click();await waitFor(()=>!second.isConnected);
  assert(!openingEntries(native.get('mara.png'))[removedKey],'native recursive merge really deletes removed opening metadata');
  const backupCount=(store.get().liveBackups??[]).length;failAfterWrite=true;
  store.update(p=>editArtifactField(p,'characters',id,'card.data.first_mes',p.characters[0].card.data.first_mes+'\n'));
  await waitFor(()=>button(root,'Review & apply to SillyTavern…'));button(root,'Review & apply to SillyTavern…').click();await waitFor(()=>[...document.querySelectorAll('.cs-modal button')].some(b=>/^Apply \d+ change/.test(b.textContent.trim())));
  const third=[...document.querySelectorAll('.cs-modal button')].find(b=>/^Apply \d+ change/.test(b.textContent.trim()));third.click();await waitFor(()=>(store.get().liveBackups??[]).length===backupCount+1&&!third.disabled);
  assert(native.get('mara.png').data.first_mes!==store.get().liveBackups.at(-1).data.data.first_mes,'post-write readback exception retains prior live data');
  document.querySelector('.cs-modal [title="Close (Esc)"]').click();failAfterWrite=false;
  const importedStore=createStore(createProject('Another installation'));
  const imported=await importCard(importedStore,env,bytes,'opening.charx');assert(imported,'extension CHARX import succeeds');
  assert(!imported.card.data.first_mes.includes('cs-opening:'),'import restores clean editing text');
  const local=openingEntries(imported.card);assert(local.first.mediaId!==portable.first.mediaId&&local.first.url!==portable.first.url,'import relinks fresh local image identities/URLs');
  let mounted=false;const destination=document.createElement('div');destination.className='cs-studio';document.body.append(destination);
  function Host(){const[p,setP]=useState(importedStore.get()),[selection,setSelection]=useState({type:'characters',id:imported.id,tab:'publish'});useEffect(()=>{mounted=true;return importedStore.subscribe(setP)},[]);return html`<${CharactersArea} store=${importedStore} env=${env} project=${p} selection=${selection} setSelection=${setSelection} select=${()=>{}}/>`}
  render(html`<${Host}/>`,destination);await waitFor(()=>mounted&&button(destination,'Create as new SillyTavern character'));
  button(destination,'Create as new SillyTavern character').click();await waitFor(()=>importedStore.get().characters[0].stAvatar==='created-opening.png');
  assert(native.get('created-opening.png').data.first_mes.includes(local.first.url),'creating a native card retains rehydrated illustration');
  assert(h.calls.filter(c=>c.type==='image').length===paid,'export/apply/import/create never regenerate images');
  render(null,destination);destination.remove();window.openingPortableBytes=bytes;
  return ['PASS actual CHARX download bundles first+alternate PNGs and has native-import-compatible URLs','PASS encoded native destination links resolve after extraction fixture','PASS native apply/readback, recursive removal and backup retention after readback exception','PASS isolated CHARX import relinks IDs/URLs and new native card retains illustrations','PASS publishing, importing and card creation make no image requests'];
 }finally{globalThis.fetch=previousFetch;URL.createObjectURL=previousCreate;HTMLAnchorElement.prototype.click=previousClick}
};
