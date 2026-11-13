// Opening editor integration uses actual production components; LLM/provider/storage are labeled fixtures.
import {html,render,useState,useEffect} from '/vendor/preact-htm.mjs';
import {CharactersArea} from '/src/ui/areas/characters.js';
import {editArtifactField,cardForSt} from '/src/core/project.js';
import {openingEntries} from '/src/core/opening-illustrations.js';

const assert=(ok,text)=>{if(!ok)throw new Error(text)};
const waitFor=async(check)=>{for(let i=0;i<240;i++){if(check())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Opening editor timed out')};
const find=(root,label)=>[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
window.runOpeningEditorTests=async()=>{
 const h=window.sceneHarness,{store,ctx,calls,env,setMode}=h;await waitFor(()=>window.sceneHarnessReady);
 render(null,document.querySelector('#root'));
 ctx.chat=[];ctx.characterId=null;ctx.getCurrentChatId=()=>'';
 const id=store.get().characters[0].id,originalAvatar=store.get().characters[0].avatarMediaId;
 store.update(p=>{let n=editArtifactField(p,'characters',id,'card.data.first_mes','OPENING_LIBRARY: Mara opens a dusty library door.');return editArtifactField(n,'characters',id,'card.data.alternate_greetings',['OPENING_STATION: Mara waits on a railway platform.','OPENING_MARKET: Mara sells flowers.'])});
 const testEnv={...env,countTokens:async()=>0,storage:{...env.storage,saveSnapshot:async()=>{},saveMedia:async(_project,id,ext,bytes)=>{const path=`/user/files/${id}.${ext}`;h.stFiles.set(path,bytes);await h.realFetch(path,{method:'POST',body:bytes});return path}}};let mounted=false,navigate;
 function Host(){const[p,setP]=useState(store.get()),[selection,setSelection]=useState({type:'characters',id,tab:'greetings'});navigate=setSelection;useEffect(()=>{setP(store.get());mounted=true;return store.subscribe(setP)},[]);return html`<${CharactersArea} store=${store} env=${testEnv} project=${p} selection=${selection} setSelection=${setSelection} select=${()=>{}}/>`}
 render(html`<${Host}/>`,document.querySelector('#root'));await waitFor(()=>mounted&&document.querySelector('[data-opening-slot="first"]'));
 const root=key=>document.querySelector(`[data-opening-slot="${key}"]`),entries=()=>openingEntries(store.get().characters[0].card),imageJobs=()=>calls.filter(c=>c.type==='image');calls.length=0;
 find(root('first'),'Generate illustration').click();await waitFor(()=>entries().first&&find(root('first'),'Replace illustration')&&!find(root('first'),'Replace illustration').disabled);
 assert(imageJobs().length===1&&imageJobs()[0].body.input_references.length===1,'first opening uses exactly one reference edit');
 assert(/first-person user POV/.test(imageJobs()[0].body.prompt),'opening uses required user POV');
 assert(JSON.stringify(calls.find(c=>c.type==='llm').args.prompt).includes('OPENING_LIBRARY'),'selected first opening reaches LLM');
 assert(!JSON.stringify(calls.find(c=>c.type==='llm').args.prompt).includes('OPENING_STATION'),'other greetings are not scene context');
 assert(store.get().characters[0].avatarMediaId===originalAvatar,'opening generation preserves avatar');
 assert(!store.get().characters[0].card.data.first_mes.includes('cs-opening:'),'editor text stays clean');
 await waitFor(()=>root('first').querySelector('img')?.naturalWidth>0);
 calls.length=0;find(root('alt:0'),'Generate illustration').click();await waitFor(()=>entries()['alt:0']&&!find(root('alt:0'),'Replace illustration').disabled);
 assert(JSON.stringify(calls.find(c=>c.type==='llm').args.prompt).includes('OPENING_STATION'),'selected alternate reaches LLM');
 assert(!JSON.stringify(calls.find(c=>c.type==='llm').args.prompt).includes('OPENING_LIBRARY'),'first message is not alternate scene context');
 const altId=entries()['alt:0'].id,firstId=entries().first.id;
 store.update(p=>editArtifactField(p,'characters',id,'card.data.alternate_greetings',['OPENING_MARKET: Mara sells flowers.','OPENING_STATION: Mara waits on a railway platform.']));
 await waitFor(()=>entries()['alt:1']?.id===altId&&root('alt:1').querySelector('img'));
 store.update(p=>editArtifactField(p,'characters',id,'card.data.first_mes','OPENING_LIBRARY edited: The door is now closed.'));
 await waitFor(()=>root('first').textContent.includes('outdated'));
 const before=imageJobs().length;cardForSt(store.get(),store.get().characters[0]);assert(imageJobs().length===before,'render/apply preparation does not regenerate');
 find(root('first'),'Replace illustration').click();await waitFor(()=>entries().first.sourceText.includes('edited')&&!find(root('first'),'Replace illustration').disabled);
 assert(entries().first.id===firstId,'replacement preserves managed identity');
 find(root('alt:1'),'Remove illustration').click();await waitFor(()=>!entries()['alt:1']);
 assert(store.get().characters[0].card.data.alternate_greetings[1].includes('OPENING_STATION'),'remove does not erase greeting');
 store.undo();await waitFor(()=>entries()['alt:1']?.id===altId);
 // Identical greeting text must not hide an identity move or delete the other row's image.
 const duplicate=root('alt:0').closest('.cs-strlist-row').querySelector('textarea');duplicate.value=store.get().characters[0].card.data.alternate_greetings[1];duplicate.dispatchEvent(new Event('input',{bubbles:true}));
 await waitFor(()=>store.get().characters[0].card.data.alternate_greetings[0]===store.get().characters[0].card.data.alternate_greetings[1]);assert(!entries()['alt:0']&&entries()['alt:1'].id===altId,'editing duplicate text does not steal image');
 root('alt:1').closest('.cs-strlist-row').querySelector('[title="Move up"]').click();await waitFor(()=>entries()['alt:0']?.id===altId);
 root('alt:1').closest('.cs-strlist-row').querySelector('[title="Remove"]').click();await waitFor(()=>store.get().characters[0].card.data.alternate_greetings.length===1);assert(entries()['alt:0'].id===altId,'deleting identical unillustrated row retains other image');
 store.undo();await waitFor(()=>store.get().characters[0].card.data.alternate_greetings.length===2);store.undo();await waitFor(()=>entries()['alt:1']?.id===altId);store.undo();await waitFor(()=>store.get().characters[0].card.data.alternate_greetings[0].includes('MARKET'));
 setMode('slow-llm');const paid=imageJobs().length;find(root('alt:0'),'Generate illustration').click();await waitFor(()=>find(root('alt:0'),'Cancel illustration'));
 find(root('alt:0'),'Cancel illustration').click();await waitFor(()=>!find(root('alt:0'),'Cancel illustration'));assert(imageJobs().length===paid,'cancelled opening does not submit image');
 setMode('success');window.openingEditorHarness={id,store,env:testEnv,ctx,navigate};
 return ['PASS actual first/alternate editor controls without active chat','PASS portrait reference, selected-only scene context, user POV and image preview','PASS reorder, stale warning, replace/remove, undo and no regeneration on publish preparation','PASS cancel prevents image submission; avatar and greeting text preserved'];
};
