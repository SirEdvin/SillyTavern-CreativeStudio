// Actual Pictures UI and creation-pipeline tests with explicitly synthetic image-service fixtures.
import {newCharacter} from '/src/core/project.js';
import {makeRunTask,startingSteps} from '/src/ui/generator.js';
import {newRun,runPipeline} from '/src/ai/pipeline.js';
import {NanoImageSetup} from '/src/ui/nanogpt-setup.js';
import {html,render} from '/vendor/preact-htm.mjs';
const assert=(ok,message)=>{if(!ok)throw new Error(message)};
const waitFor=async(check)=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Timed out waiting for portrait UI')};
const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
window.runPortraitTests=async({scenario='dual'}={})=>{
    await waitFor(()=>window.sceneHarnessReady===true);
    const {store,ctx,calls,env,setMode}=window.sceneHarness;
    const ch=newCharacter('Nia');ch.appearance='An adult anime character with silver hair and amber eyes.';
    ch.pictureDraft={purpose:'avatar',prompt:'Anime-style portrait, soft purple cardigan, friendly expression.',negative:'watermark, lettering',reference:true};
    ch.imagePrompts=[{purpose:'avatar',prompt:ch.pictureDraft.prompt,negative:ch.pictureDraft.negative}];
    Object.assign(ctx.extensionSettings.creativeStudio.image,{backend:'nanogpt',nanoModel:scenario==='text-only'?'fixture-text-only':'bytedance/seedream-v5.5',nanoResolution:'auto'});
    setMode(scenario.includes('provider-error')?'provider-error':'success');
    store.update(p=>({...p,settings:{...p.settings,content:'sfw'},characters:[ch],media:[],generationRuns:[],workspace:{characterId:ch.id}}),'test new character',{history:false});
    calls.length=0;const jobs=()=>calls.filter(c=>c.type==='image');
    await waitFor(()=>button('Generate picture')&&!button('Generate picture').disabled);
    assert(!store.get().characters[0].avatarMediaId,'new character has no reference portrait');
    assert(button('Illustrate current scene').disabled,'scene editing still requires a portrait and linked chat');
    if(scenario.startsWith('pipeline')){
        assert(startingSteps().includes('art'),'NanoGPT enables the optional portrait step');
        const run=newRun({steps:['art']});run.state.characterId=ch.id;
        const selectedEnv=scenario==='pipeline-save-error'?{...env,storage:{...env.storage,saveMedia:async()=>{throw new Error('fixture file-save failure')}}}:env;
        const result=await runPipeline({getProject:()=>store.get(),update:(fn,label)=>store.update(fn,label),runTask:makeRunTask(store,selectedEnv),run});
        assert(jobs().length===1,'pipeline never automatically retries a billed image job');
        assert(!('input_references' in jobs()[0].body),'pipeline generates its first portrait from text');
        if(scenario==='pipeline'){
            assert(result.status==='done'&&result.steps.art.status==='done','real art pipeline step completes');
            assert(result.steps.art.model==='NanoGPT','pipeline reports the actual image backend');
            assert(store.get().media.length===1&&store.get().characters[0].avatarMediaId===store.get().media[0].id,'pipeline saves and selects first portrait');
        }else assert(result.steps.art.status==='failed'&&store.get().media.length===0&&!store.get().characters[0].avatarMediaId,'failed pipeline generation/save attaches no fake image');
        return ['PASS '+scenario+': real art step → NanoGPT text generation, persistence and single-request behavior'];
    }
    button('Generate picture').click();
    if(scenario==='provider-error'){
        await waitFor(()=>document.body.innerText.includes('HTTP 502')&&button('Generate picture')&&!button('Generate picture').disabled);
        assert(jobs().length===1&&store.get().media.length===0&&!store.get().characters[0].avatarMediaId,'first-picture failure has no fallback, retry or fake avatar');
        assert(store.get().characters[0].pictureDraft.prompt===ch.pictureDraft.prompt,'failed generation retains the draft');
        return ['PASS first-portrait error: one request, no fake image, draft retained'];
    }
    await waitFor(()=>store.get().media.length===1&&button('Generate picture')&&!button('Generate picture').disabled);
    const first=store.get().characters[0].avatarMediaId;
    assert(first===store.get().media[0].id,'first generated portrait is selected as avatar');
    assert(!('input_references' in jobs()[0].body),'no reference field on the first image request');
    assert(/anime/i.test(jobs()[0].body.prompt)&&/watermark, lettering/.test(jobs()[0].body.prompt),'appearance/style and explicit negatives reach provider');
    assert(!/first-person user POV|lowres, blurry, cartoon/i.test(jobs()[0].body.prompt),'regular portraits do not inherit scene camera rules or SDXL style negatives');
    assert(store.get().media[0].prompt===jobs()[0].body.prompt,'saved provenance matches the submitted prompt');
    if(scenario==='missing-reference'){
        store.update(p=>({...p,media:[]}),'test missing reference',{history:false});
        await waitFor(()=>button('Generate picture')&&!button('Generate picture').disabled);button('Generate picture').click();
        await waitFor(()=>document.body.innerText.includes('selected reference portrait is missing'));
        assert(jobs().length===1,'missing selected reference cannot silently become another text generation');
        return ['PASS missing selected portrait: no silent text-only fallback or extra image request'];
    }
    button('Generate picture').click();
    if(scenario==='text-only'){
        await waitFor(()=>document.body.innerText.includes('does not advertise reference-image editing')&&button('Generate picture')&&!button('Generate picture').disabled);
        assert(jobs().length===1&&store.get().media.length===1,'text-only model cannot silently drop a requested reference');
    }else{
        await waitFor(()=>store.get().media.length===2&&button('Generate picture')&&!button('Generate picture').disabled);
        assert(jobs()[1].body.input_references?.length===1,'next ordinary picture uses the generated portrait as reference');
        assert(/watermark, lettering/.test(jobs()[1].body.prompt)&&/Content rating: SFW/.test(jobs()[1].body.prompt),'reference edits preserve exclusions and project content rating');
        assert(store.get().characters[0].avatarMediaId===first,'reference edit preserves selected avatar');
    }
    button('Appearance & picture options').click();
    const toggle=()=>[...document.querySelectorAll('label.cs-toggle')].find(l=>l.textContent.includes('Use this character’s portrait'))?.querySelector('input');
    await waitFor(()=>toggle());toggle().click();await waitFor(()=>store.get().characters[0].pictureDraft.reference===false);
    const before=jobs().length;button('Generate picture').click();
    await waitFor(()=>jobs().length===before+1&&button('Generate picture')&&!button('Generate picture').disabled&&store.get().media.length===(scenario==='text-only'?2:3));
    assert(!('input_references' in jobs().at(-1).body),'explicit reference opt-out uses text generation even with an avatar');
    assert(/watermark, lettering/.test(jobs().at(-1).body.prompt)&&/Content rating: SFW/.test(jobs().at(-1).body.prompt),'reference opt-out also preserves exclusions and rating');
    assert(store.get().characters[0].avatarMediaId===first,'explicit fresh generation does not replace selected avatar');
    if(scenario==='text-only'){
        const root=document.createElement('div');document.body.append(root);
        render(html`<${NanoImageSetup} s=${ctx.extensionSettings.creativeStudio.image} set=${patch=>Object.assign(ctx.extensionSettings.creativeStudio.image,patch)}/>`,root);
        await waitFor(()=>button('Load image models'));button('Load image models').click();
        await waitFor(()=>root.querySelector('datalist option[value="fixture-text-only"]'));
        assert(!root.innerText.includes('Choose another model'),'setup accepts supported text-only models');render(null,root);root.remove();
    }
    return ['PASS '+scenario+': first portrait without reference; selected reference respected; explicit opt-out; exact prompt saved'];
};
