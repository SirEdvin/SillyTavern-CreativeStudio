// Editor-only illustration: selected card opening + original portrait, with no live-chat dependency.
import {uid,stableStringify} from '../core/bytes.js';
import {pictureTarget} from '../core/pictures.js';
import {openingSlots,openingEntries,setOpeningEntry,normalizeOpeningCard} from '../core/opening-illustrations.js';
import {SCENE_POV_RULE} from '../core/scene-composition.js';
import {contentOf,imageRating} from '../core/content.js';
import {buildTask,getTask} from '../ai/tasks.js';
import {runStructured} from '../ai/gateway.js';
import {stContext} from './env.js';
import {promptOverrides} from './prompt-store.js';
import {saveMedia,mediaBytes} from '../ui/media.js';
import {editArtifactField} from '../core/project.js';
const active=new WeakMap();
export async function illustrateOpening({store,env,projectId,characterId,key,ctx=stContext(),generate,
    signal,onStatus=()=>{},runLlm=runStructured}){
    let jobs=active.get(store);if(!jobs)active.set(store,jobs=new Set());const job=`${projectId}/${characterId}`;
    if(jobs.has(job))throw new Error('An opening illustration is already in progress for this character.');
    jobs.add(job);
    try{
        const project=store.get(),character=pictureTarget(project,projectId,characterId);
        const slot=openingSlots(character.card).find(s=>s.key===key);
        if(!slot?.text.trim())throw new Error('Write a non-empty opening before illustrating it.');
        const portrait=project.media.find(m=>m.id===character.avatarMediaId&&m.kind==='image');
        if(!portrait)throw new Error('Choose or upload the character’s original portrait before illustrating an opening.');
        if(typeof generate!=='function')throw new Error('Configure NanoGPT reference editing first.');
        const token=stableStringify(normalizeOpeningCard(character.card)),portraitId=portrait.id;
        const check=()=>{
            if(signal?.aborted)throw new Error('Opening illustration cancelled.');
            const latest=pictureTarget(store.get(),projectId,characterId);
            if(latest.avatarMediaId!==portraitId||!store.get().media.some(m=>m.id===portraitId))throw new Error('The reference portrait changed. Start the illustration again.');
            if(stableStringify(normalizeOpeningCard(latest.card))!==token)throw new Error('The character or opening changed. Start the illustration again.');
        };
        check();onStatus('Loading the original portrait…');const reference=await mediaBytes(env,portrait);check();
        if(!reference?.length)throw new Error('The reference portrait could not be read.');
        // Do not send other openings, extension metadata, assets or unlimited card fields as scene context.
        const d=character.card.data,card={data:{name:String(d.name??'').slice(0,120),description:String(d.description??'').slice(0,6000),personality:String(d.personality??'').slice(0,2000),scenario:String(d.scenario??'').slice(0,3000)}};
        const prompt=buildTask('media.scene',{card,messages:[{role:'assistant',name:card.data.name,text:slot.text.slice(0,12000)}]},
            {overrides:promptOverrides(ctx),content:contentOf(project)});
        prompt.system+='\nIllustrate only the selected opening supplied below. This is a character editor, not a live chat. The selected opening takes precedence over the card’s general scenario for the visible moment. Other greetings are not scene context.';
        const task=getTask('media.scene');onStatus(`Reading ${slot.label.toLowerCase()} and writing image instructions…`);
        const result=await runLlm(ctx,{...prompt,schema:task.schema,schemaName:task.schemaName,maxTokens:task.maxTokens,
            profileId:project.settings?.creationProfileId??'',signal,onStatus});check();
        const scene=typeof result?.value?.scene==='string'?result.value.scene.trim():'';
        const raw=typeof result?.value?.instruction==='string'?result.value.instruction.trim():'';
        if(!scene||scene.length>3000||!raw||raw.length>8000)throw new Error('The LLM did not return valid scene instructions. No image request was sent.');
        const instruction=`${raw}\n\nContent rating: ${imageRating(contentOf(project))}.\n\n${SCENE_POV_RULE}`;
        onStatus('Generating the opening illustration with NanoGPT…');
        const image=await generate({reference,instruction,signal,beforeSubmit:check});check();
        if(!image?.bytes?.length)throw new Error('The image provider returned no image.');
        onStatus('Saving the opening illustration…');
        const saved=await saveMedia(env,store.get(),image.bytes,{name:`${d.name} — ${slot.label}`,role:'opening'});check();
        const entry={id:openingEntries(character.card)[key]?.id??uid('open'),mediaId:saved.media.id,url:saved.media.url,
            sourceText:slot.text,referenceMediaId:portraitId,scene,instruction,imageModel:image.model??'',textModel:result.meta?.model??'',createdAt:new Date().toISOString()};
        saved.media.purpose='opening';saved.media.prompt=instruction;
        store.update(p=>{
            check();let n=saved.apply(p);const latest=pictureTarget(n,projectId,characterId);
            n=editArtifactField(n,'characters',characterId,'card',setOpeningEntry(latest.card,key,entry),{actor:'ai',summary:`Illustrated ${slot.label}`});
            return editArtifactField(n,'characters',characterId,'links.media',[...new Set([...(latest.links?.media??[]),saved.media.id])],{actor:'ai',summary:'Linked opening illustration'});
        },'illustrate opening',{merge:false});
        onStatus('Opening illustration saved. Apply the card to use it in new chats.');return {media:saved.media,entry,scene,instruction};
    }finally{jobs.delete(job)}
}
