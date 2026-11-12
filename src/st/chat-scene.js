// Chat More action: background project/portrait -> shared scene pipeline -> native reply attachment.
import { captureChatTarget, assertChatTarget, assertSavedTarget, attachChatImage, readSavedChat } from './chat-scene-target.js';
import { stContext } from './env.js';
import { getStudioRuntime, withDefaultCreationModel } from './studio-runtime.js';
import { createProject } from '../core/project.js';
import { createStore } from '../ui/store.js';
import { characterFromSt, pullStCharacter } from '../ui/st-pull.js';
import { ensureCharacterPortrait } from '../ui/portrait.js';
import { imageSettings, referenceImageReady } from './comfy.js';
import { generateNanoImage } from './nanogpt.js';
import { illustrateScene } from './scene-illustration.js';
let active=false;

export async function illustrateChatMessage({target=captureChatTarget(),runtime,generate=generateNanoImage,runLlm,
    readChat=readSavedChat,onStatus=()=>{}}={}) {
    if(active)throw new Error('A chat scene illustration is already in progress.');
    const controller=new AbortController(),ctx=stContext();
    const changed=()=>controller.abort();
    const types=[...new Set(['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_SENT','MESSAGE_EDITED','MESSAGE_DELETED','MESSAGE_SWIPED'].map(t=>ctx.eventTypes?.[t]).filter(Boolean))];
    types.forEach(t=>ctx.eventSource?.on?.(t,changed));
    const guard=()=>{if(controller.signal.aborted)throw new Error('The chat changed. Scene illustration cancelled.');assertChatTarget(stContext(),target)};
    const serverGuard=async()=>{guard();await assertSavedTarget(target,{readChat});guard()};
    const run=async()=>{
        guard();
        if(typeof ctx.saveChat!=='function'||typeof ctx.updateMessageBlock!=='function')throw new Error('SillyTavern message saving/rendering APIs are unavailable.');
        const settings={...imageSettings()};
        if(settings.backend!=='nanogpt'||!referenceImageReady())throw new Error('Configure NanoGPT and its key in Creative Studio → Pictures → Image settings first. No image request was started.');
        await serverGuard(); // Fail before project creation or LLM work if a saved image already exists.
        const {store:visibleStore,env}=runtime??await getStudioRuntime();guard();
        let store=visibleStore;
        let shared=!!characterFromSt(store.get(),target.snapshot.avatar);
        if(!shared){
            const home=(await env.storage.listProjects()).find(p=>(p.stAvatars??[]).includes(target.snapshot.avatar));guard();
            if(home?.id===visibleStore.get().id)shared=true;
            else {
                const project=home?await env.storage.loadProject(home.id):withDefaultCreationModel(createProject(target.characterName||'Chat scenes'));
                guard();store=createStore(project);
            }
        }
        let revision=store.get().revision??null;
        const persist=async()=>{
            if(shared){
                await env.saveNow();
                if(env.saveState().status!=='idle')throw new Error('Could not save the scene project on the server. No chat image was attached.');
            }else{
                const saved=await env.storage.saveProject(store.get(),{baseRevision:revision,activate:false,rejectConflict:true});
                if(saved.where!=='server')throw new Error('Could not save the background scene project on the server. No chat image was attached.');
                revision=saved.revision;
            }
        };
        onStatus('Preparing the character in the background…');
        const pulled=await pullStCharacter(store,env,target.snapshot.avatar,{guard:()=>{guard();return true},onStep:onStatus});guard();
        const projectId=store.get().id,characterId=pulled.character.id;
        await ensureCharacterPortrait(store,env,projectId,characterId);guard();
        await persist();guard();
        const result=await illustrateScene({store,env,projectId,characterId,signal:controller.signal,guard,onStatus,
            messages:settings.sceneMessages,runLlm,
            generate:args=>generate({...args,settings,beforeSubmit:async()=>{args.beforeSubmit();await serverGuard();args.beforeSubmit()}}),
        });
        // Preserve the paid output in its gallery even if attaching/saving the chat subsequently fails.
        await persist();
        guard();
        onStatus('Attaching the image to the latest character message…');
        await attachChatImage({target,media:result.media,scene:result.scene,readChat,guard});
        onStatus('Scene image attached to the character message and saved.');
        return {...result,projectId,characterId,messageIndex:target.index};
    };
    active=true;
    try{
        const locks=globalThis.navigator?.locks;
        return await (locks?locks.request(`creative-studio-scene:${target.snapshot.avatar}:${target.snapshot.chatId}`,{ifAvailable:true},lock=>{
            if(!lock)throw new Error('Scene illustration for this chat is already running in another tab.');return run();
        }):run());
    }finally{active=false;types.forEach(t=>ctx.eventSource?.removeListener?.(t,changed))}
}
