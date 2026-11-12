// Real extension/headless pipeline; ST context, persistence and remote providers are explicit TEST fixtures.
import {render,html,useState} from '/vendor/preact-htm.mjs';
import {setNanoSessionKey,hasNanoKey} from '/src/st/nanogpt.js';
import {savedNanoKey,initNanoKeyStore} from '/src/st/nano-key-store.js';
import {NanoImageSetup} from '/src/ui/nanogpt-setup.js';
// Account settings are deliberately never persisted; the key scope comes from the stable /users/me identity.
const accountState={};
window.sceneHarness.ctx.accountStorage={getItem:()=>null,setItem(){throw new Error('Credential storage must not write account settings')}};
const assert=(ok,message)=>{if(!ok)throw new Error(message)};
const waitFor=async check=>{const until=Date.now()+15000;while(Date.now()<until){if(check())return;await new Promise(r=>setTimeout(r,25))}throw new Error('Timed out waiting for headless chat action')};
window.runMoreMenuTests=async({scenario='existing'}={})=>{
    const h=window.sceneHarness,{ctx,calls,stFiles,realFetch,original,project,character}=h;
    render(null,document.querySelector('#root'));
    const initial=structuredClone(project);initial.media[0].url='/user/files/original.png';
    await realFetch('/user/files/original.png',{method:'POST',body:original});stFiles.set('/user/files/original.png',original);
    const home=structuredClone(initial),encode=value=>new TextEncoder().encode(JSON.stringify(value));
    if(scenario==='elsewhere')home.id='existing-character-project';
    if(['absent','elsewhere'].includes(scenario)){initial.characters=[];initial.media=[];initial.workspace={};}
    const entries=[{id:initial.id,name:initial.name,stAvatars:initial.characters.length?['mara.png']:[]}];
    if(scenario==='elsewhere'){entries.push({id:home.id,name:home.name,stAvatars:['mara.png']});stFiles.set('/user/files/cstudio-p-'+home.id+'.json',encode(home));}
    stFiles.set('/user/files/cstudio-index.json',encode({lastOpen:initial.id,projects:entries}));
    stFiles.set('/user/files/cstudio-p-'+initial.id+'.json',encode(initial));
    ctx.chat.push({is_user:true,name:'You',mes:'I offer her my umbrella.'});
    if(scenario==='already-image')ctx.chat[1].extra={media:[{type:'image',url:'/user/files/original.png'}]};
    h.setSavedChat(ctx.chat);h.setMode(scenario==='provider-error'?'provider-error':scenario==='save-error'?'save-error':'success');
    if(scenario==='bookkeeping'){ctx.chatMetadata={integrity:'added-locally-by-native-getChat'};ctx.chat[1].extra={token_count:123};}
    if(scenario==='saved-key')setNanoSessionKey('',ctx);
    if(scenario==='missing-key')setNanoSessionKey('',ctx);
    const chat=document.createElement('section');chat.id='fixture-chat';document.body.appendChild(chat);
    ctx.chat.forEach((m,i)=>{const article=document.createElement('article');article.id='fixture-message-'+i;article.textContent=m.name+': '+m.mes;chat.appendChild(article)});
    ctx.updateMessageBlock=(index,message)=>{
        calls.push({type:'message-render',index});const article=document.querySelector('#fixture-message-'+index);
        for(const media of message.extra?.media??[]){if(media.type==='image'){const img=document.createElement('img');img.src=media.url;img.alt='TEST generated scene';img.style.width='300px';article.appendChild(img)}}
    };
    await import('/index.js');
    const item=document.querySelector('#cs-option-illustrate-scene');assert(item?.previousElementSibling.id==='option_continue','native placement after Continue');
    document.querySelector('#options_button').click();item.click();item.click();
    if(scenario==='already-image'){
        assert(item.getAttribute('aria-disabled')==='true','existing image disables action');assert(!calls.some(c=>c.type==='llm'||c.type==='image'),'existing image blocks before LLM/image calls');
    }else if(['missing-key','provider-error'].includes(scenario)){
        await waitFor(()=>calls.some(c=>c.type==='shortcut-error')&&!item.hasAttribute('aria-busy'));
        assert(!ctx.chat[1].extra?.media?.length,'failure never attaches a placeholder');
        assert(calls.filter(c=>c.type==='image').length===(scenario==='provider-error'?1:0),'no paid retry/fallback');
    }else{
        await waitFor(()=>document.querySelector('#fixture-message-1 img')?.naturalWidth>0&&!item.hasAttribute('aria-busy'));
        assert(calls.filter(c=>c.type==='image').length===1,'exactly one paid job despite double click');
        assert(calls.filter(c=>c.type==='llm').length===1,'exactly one scene LLM call');
        assert(!ctx.chat[2].extra,'image not attached to later user message');assert(ctx.chat.length===3,'no new chat message');
        assert(item.getAttribute('aria-disabled')==='true','action disabled after embed');
        item.click();item.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        assert(calls.filter(c=>c.type==='image').length===1&&calls.filter(c=>c.type==='llm').length===1,'image blocks both click and keyboard retries');
        if(scenario==='save-error')assert(calls.some(c=>c.type==='shortcut-error'&&/persist|verif|sav/i.test(c.message)),'swallowed save error is reported');
        else{
            assert(h.getSavedChat()[1].extra.media[0].url===ctx.chat[1].extra.media[0].url,'exact target attachment read back from saved chat');
            assert(calls.some(c=>c.type==='shortcut-success'),'success only after persisted readback');
        }
        const index=JSON.parse(new TextDecoder().decode(stFiles.get('/user/files/cstudio-index.json')));
        assert(index.lastOpen===initial.id,'background save does not activate its project');
        const owned=index.projects.filter(p=>p.stAvatars?.includes('mara.png'));assert(owned.length===1,'one project owns the character');
        const savedProject=JSON.parse(new TextDecoder().decode(stFiles.get('/user/files/cstudio-p-'+owned[0].id+'.json')));
        assert(savedProject.characters.length===1,'no duplicate characters');
        assert(calls.filter(c=>c.type==='character-export').length===(scenario==='absent'?1:0),'import only if absent');
        if(scenario!=='absent')assert(savedProject.characters[0].id===character.id,'reuse existing character ID');
        const {getStudioRuntime}=await import('/src/st/studio-runtime.js');const runtime=await getStudioRuntime();assert(runtime.store.get().id===initial.id,'visible store never switched to a background project');
    }
    assert(!document.querySelector('#cs-root'),'Studio root was never created');assert(!document.body.classList.contains('cs-studio-open'),'Studio never opened');
    assert(document.querySelectorAll('#cs-option-illustrate-scene').length===1,'idempotent native item');
    const results=['PASS '+scenario+': actual More action runs without mounting/navigating Studio','PASS native menu placement and duplicate-click protection','PASS reply media/duplicate-image guard and persistence behavior for '+scenario];
    window.moreMenuResults=results;document.querySelector('#test-report').textContent=results.join('\n');return results;
};

window.runBrowserKeyTests=async({phase='save'}={})=>{
    const {ctx}=window.sceneHarness;setNanoSessionKey('',ctx);
    await initNanoKeyStore(ctx);
    function Setup(){const[s,set]=useState(ctx.extensionSettings.creativeStudio.image);return html`<${NanoImageSetup} s=${s} set=${patch=>{Object.assign(ctx.extensionSettings.creativeStudio.image,patch);set({...s,...patch})}} />`}
    render(html`<${Setup}/>`,document.querySelector('#root'));
    const find=label=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
    await waitFor(()=>find('Save key'));
    if(phase==='save'){
        const input=document.querySelector('input[aria-label="NanoGPT API key"]');
        input.value='fixture-browser-persistent-key';input.dispatchEvent(new Event('input',{bubbles:true}));
        await waitFor(()=>!find('Save key').disabled);find('Save key').click();
        await waitFor(()=>document.body.innerText.includes('Key saved in this browser.'));
        assert(savedNanoKey(ctx)==='fixture-browser-persistent-key','key persisted');
        assert(!JSON.stringify(ctx.extensionSettings).includes('fixture-browser-persistent-key'),'no secret in extension settings');
        assert(!JSON.stringify(accountState).includes('fixture-browser-persistent-key'),'no secret in ST account settings');
    }else if(phase==='restore'){
        assert(hasNanoKey(ctx)&&savedNanoKey(ctx)==='fixture-browser-persistent-key','key restored after full navigation with no session key');
        assert(!find('Forget saved key').disabled,'restored key visible to UI');
    }else if(phase==='forget'){
        assert(hasNanoKey(ctx),'key exists before deletion');find('Forget saved key').click();await waitFor(()=>!hasNanoKey(ctx));
    }else if(phase==='forgotten'){
        assert(!hasNanoKey(ctx),'forgotten key stays absent after reload');assert(find('Forget saved key').disabled,'UI reflects removed key');
    }
    return {passed:true,phase};
};
