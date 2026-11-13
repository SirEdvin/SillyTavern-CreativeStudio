// Per-opening image controls, shared by the main opening and each alternate greeting editor row.
import {html,useState,useRef,useEffect,Button} from './kit.js';
import {openingSlots,openingEntries,openingStale,setOpeningEntry,safeOpeningImageUrl} from '../core/opening-illustrations.js';
import {editArtifactField} from '../core/project.js';
import {illustrateOpening} from '../st/opening-illustration.js';
import {imageSettings,referenceImageReady} from '../st/comfy.js';
import {generateNanoImage} from '../st/nanogpt.js';
import {stContext} from '../st/env.js';
export function OpeningIllustrationControls({store,env,project,ch,slotKey}){
    const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
    const controller=useRef(null),mounted=useRef(true);
    useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort()}},[project.id,ch.id,slotKey]);
    const slot=openingSlots(ch.card).find(s=>s.key===slotKey),entry=openingEntries(ch.card)[slotKey];
    let settings=null,ready=false;try{settings=imageSettings();ready=settings.backend==='nanogpt'&&referenceImageReady()}catch{}
    const portrait=project.media.find(m=>m.id===ch.avatarMediaId&&m.kind==='image');
    const media=entry?.mediaId?project.media.find(m=>m.id===entry.mediaId):null;
    const url=media?.url??entry?.url,preview=!entry?.missing&&safeOpeningImageUrl(url)&&!url.startsWith('embeded:')?url:'';
    const run=async()=>{
        if(controller.current)return;const stop=new AbortController();controller.current=stop;setBusy(true);setError('');
        try{
            const ctx=stContext(),selected={...imageSettings(ctx)};
            await illustrateOpening({store,env,projectId:project.id,characterId:ch.id,key:slotKey,ctx,signal:stop.signal,
                onStatus:text=>{if(mounted.current)setStatus(text)},
                generate:args=>generateNanoImage({...args,settings:selected,ctx})});
        }catch(e){if(mounted.current){setError(e.message);setStatus('')}env.toast(`Opening illustration stopped: ${e.message}`,'error',7000)}
        finally{controller.current=null;if(mounted.current)setBusy(false)}
    };
    const remove=()=>{
        store.update(p=>{const current=p.characters.find(c=>c.id===ch.id);if(p.id!==project.id||!current)throw new Error('The character changed.');return editArtifactField(p,'characters',ch.id,'card',setOpeningEntry(current.card,slotKey,null),{summary:'Removed opening illustration'})},'remove opening illustration',{merge:false});
        setStatus('Illustration removed from this opening. Apply the card to update future chats.');setError('');
    };
    return html`<section class="cs-opening-illustration" data-opening-slot=${slotKey} aria-label=${`${slot?.label??'Opening'} illustration`}>
        <div class="cs-row">
            <${Button} small icon="image" label=${busy?'Illustrating opening…':entry?'Replace illustration':'Generate illustration'} onClick=${run} disabled=${busy||!ready||!portrait||!slot?.text.trim()} />
            ${entry&&html`<${Button} small icon="trash" label="Remove illustration" onClick=${remove} disabled=${busy} />`}
            ${busy&&html`<${Button} small icon="stop" label="Cancel illustration" onClick=${()=>controller.current?.abort()} />`}
        </div>
        ${!ready?html`<p class="cs-muted cs-small">Configure NanoGPT reference editing in Image settings to illustrate this opening.</p>`:!portrait?html`<p class="cs-muted cs-small">Choose or generate a portrait in Pictures first.</p>`:null}
        ${entry&&openingStale(ch,slotKey)&&html`<p class="cs-warn-text cs-small" role="status">Illustration may be outdated: the opening or reference portrait changed. It stays saved until you replace or remove it.</p>`}
        ${entry&&!preview&&html`<p class="cs-warn-text cs-small">The saved illustration is missing or needs asset relinking. Import its CHARX file or replace/remove it.</p>`}
        ${preview&&html`<figure style="margin:8px 0"><img src=${preview} alt=${entry.scene||`${slot.label} illustration`} style="max-width:360px;max-height:360px;object-fit:contain" /><figcaption class="cs-small cs-muted">${entry.scene}</figcaption></figure>`}
        ${status&&html`<p class="cs-small cs-muted" role="status">${status}</p>`}
        ${error&&html`<p class="cs-err-text cs-small" role="alert">${error}</p>`}
    </section>`;
}
