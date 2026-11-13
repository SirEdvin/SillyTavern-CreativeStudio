// Managed opening illustrations: canonical text stays clean; native Markdown is materialized at publish time.
import {stableStringify} from './bytes.js';
const ID=/^[A-Za-z0-9_-]{1,100}$/;
const SLOT=/^(first|alt:(?:0|[1-9][0-9]*))$/;
export function openingSlots(card){
    return [{key:'first',label:'First message',text:String(card?.data?.first_mes??'')},
        ...(card?.data?.alternate_greetings??[]).map((text,i)=>({key:`alt:${i}`,label:`Alternate greeting ${i+1}`,text:String(text??'')}))];
}
export function openingEntries(card){
    const state=card?.data?.extensions?.creative_studio?.openingIllustrations;
    if(state?.version!==1||!state.entries||typeof state.entries!=='object'||Array.isArray(state.entries))return {};
    return Object.fromEntries(Object.entries(state.entries).filter(([key,e])=>SLOT.test(key)&&e&&ID.test(e.id)&&typeof e.sourceText==='string'));
}
export function stripOpeningMarkup(text,ids){
    return String(text??'').replace(/(?:\n\n)?<!-- cs-opening:([A-Za-z0-9_-]{1,100}) -->\n!\[Opening illustration\]\(<([^>\r\n]+)>\)\n<!-- \/cs-opening:\1 -->/g,(all,id)=>ids.has(id)?'':all);
}
export function normalizeOpeningCard(card){
    const ids=new Set(Object.values(openingEntries(card)).map(e=>e.id));if(!ids.size)return card;
    const c=structuredClone(card);c.data.first_mes=stripOpeningMarkup(c.data.first_mes,ids);
    c.data.alternate_greetings=(c.data.alternate_greetings??[]).map(text=>stripOpeningMarkup(text,ids));return c;
}
export function setOpeningEntry(card,key,entry){
    if(!SLOT.test(key))throw new Error('Invalid opening slot.');
    const c=structuredClone(normalizeOpeningCard(card)),entries={...openingEntries(c)};
    const previous=entries[key];
    if(entry){if(!ID.test(entry.id)||typeof entry.sourceText!=='string')throw new Error('Invalid opening illustration.');entries[key]=structuredClone(entry)}else delete entries[key];
    if(previous?.assetPath&&(!entry||previous.mediaId!==entry.mediaId)&&!Object.values(entries).some(e=>e.assetPath===previous.assetPath))c.data.assets=(c.data.assets??[]).filter(a=>a.uri!==`embeded://${previous.assetPath}`);
    c.data.extensions??={};const ns={...(c.data.extensions.creative_studio??{})};
    if(Object.keys(entries).length)ns.openingIllustrations={version:1,entries};else delete ns.openingIllustrations;
    if(Object.keys(ns).length)c.data.extensions.creative_studio=ns;else delete c.data.extensions.creative_studio;
    return c;
}
export function openingStale(character,key){
    const entry=openingEntries(character.card)[key],slot=openingSlots(character.card).find(s=>s.key===key);
    return !!entry&&(!slot||slot.text!==entry.sourceText||entry.staleReference===true
        || (!!entry.referenceMediaId&&entry.referenceMediaId!==character.avatarMediaId));
}
export function reconcileOpeningCards(before,after){
    const entries=openingEntries(after);if(!Object.keys(entries).length)return after;
    const old=normalizeOpeningCard(before)?.data?.alternate_greetings??[],next=normalizeOpeningCard(after)?.data?.alternate_greetings??[];
    if(JSON.stringify(old)===JSON.stringify(next))return after;
    const ids=map=>JSON.stringify(Object.fromEntries(Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([key,e])=>[key,e.id])));
    if(ids(openingEntries(before))!==ids(entries))return after; // Explicit row operations already carried identities.
    if(old.length===next.length&&JSON.stringify([...old].sort())!==JSON.stringify([...next].sort()))return after;
    const used=new Set(),matches=next.map(text=>{const i=old.findIndex((v,i)=>!used.has(i)&&v===text);if(i>=0)used.add(i);return i});
    // Exact matches reserve their old slots first; only an unmatched same-position edit retains stale art.
    matches.forEach((value,i)=>{if(value<0&&i<old.length&&!used.has(i)){matches[i]=i;used.add(i)}});
    let c=after;for(const key of Object.keys(entries))if(key.startsWith('alt:'))c=setOpeningEntry(c,key,null);
    matches.forEach((from,i)=>{if(from>=0&&entries[`alt:${from}`])c=setOpeningEntry(c,`alt:${i}`,entries[`alt:${from}`])});
    if(after.data.assets){const previous=new Set(Object.values(entries).map(e=>`embeded://${e.assetPath}`)),kept=new Set(Object.values(openingEntries(c)).map(e=>`embeded://${e.assetPath}`));c.data.assets=after.data.assets.filter(a=>!previous.has(a.uri)||kept.has(a.uri))}
    return c;
}
export function safeOpeningImageUrl(url){
    if(typeof url!=='string'||/[\s<>"'()\\?#]/.test(url))return false;
    if(/^embeded:\/\/assets\/openings\/[A-Za-z0-9_-]+\.png$/.test(url))return true;
    if(!/^\/user\/(?:files|images)\//.test(url))return false;
    try{return !decodeURIComponent(url).split('/').some(p=>p==='..'||p==='.')&&!/[\x00-\x1f]/.test(decodeURIComponent(url))}catch{return false}
}
/** Explicit row identity operations also work when two greetings contain identical text. */
export function reorderOpeningAlternates(card,order){
    const c=structuredClone(normalizeOpeningCard(card)),old=c.data.alternate_greetings??[];
    if(order.some(i=>!Number.isInteger(i)||i<0||i>=old.length)||new Set(order).size!==order.length)throw new Error('Invalid alternate greeting order.');
    c.data.alternate_greetings=order.map(i=>old[i]);const entries=openingEntries(c);
    if(Object.keys(entries).length){
        const next={...(entries.first?{first:entries.first}:{})};order.forEach((from,to)=>{if(entries[`alt:${from}`])next[`alt:${to}`]=entries[`alt:${from}`]});
        c.data.extensions.creative_studio.openingIllustrations.entries=next;
        const previous=new Set(Object.values(entries).map(e=>`embeded://${e.assetPath}`)),kept=new Set(Object.values(next).map(e=>`embeded://${e.assetPath}`));
        if(c.data.assets)c.data.assets=c.data.assets.filter(a=>!previous.has(a.uri)||kept.has(a.uri));
    }
    return c;
}
export function decorateOpeningCard(card,resolve=entry=>entry.url){
    const entries=openingEntries(card);if(!Object.keys(entries).length)return card;
    const c=normalizeOpeningCard(card);
    for(const slot of openingSlots(c)){
        const entry=entries[slot.key];if(!entry)continue;
        const url=resolve(entry,slot);if(!url)throw new Error(`Opening illustration missing for ${slot.label}.`);
        if(!safeOpeningImageUrl(url))throw new Error('Invalid or unsafe opening illustration URL.');
        c.data.extensions.creative_studio.openingIllustrations.entries[slot.key]={...entry,url};
        const text=slot.text+`\n\n<!-- cs-opening:${entry.id} -->\n![Opening illustration](<${url}>)\n<!-- /cs-opening:${entry.id} -->`;
        if(slot.key==='first')c.data.first_mes=text;else c.data.alternate_greetings[Number(slot.key.slice(4))]=text;
    }
    return c;
}
export function clearOpeningMedia(card,gone){
    let c=card;for(const [key,e] of Object.entries(openingEntries(card)))if(gone.has(e.mediaId))c=setOpeningEntry(c,key,null);return c;
}

/** Return a verification error so callers can retain the live backup before reporting it. */
export function openingStorageError(card,stored,before){
    const state=c=>c?.data?.extensions?.creative_studio?.openingIllustrations??null;
    if(stableStringify(state(card))!==stableStringify(state(stored)))return 'SillyTavern wrote the character, but opening illustration metadata could not be verified. Inspect the stored card before retrying.';
    const keys=new Set([...Object.keys(openingEntries(card)),...Object.keys(openingEntries(before))]);
    for(const key of keys){
        const wanted=key==='first'?card.data.first_mes:card.data.alternate_greetings?.[Number(key.slice(4))];
        const actual=key==='first'?stored?.data?.first_mes:stored?.data?.alternate_greetings?.[Number(key.slice(4))];
        if(wanted!==actual||(key==='first'&&stored?.first_mes!==undefined&&stored.first_mes!==wanted))return 'SillyTavern wrote the character, but the illustrated opening could not be verified. Inspect the stored card before retrying.';
    }
    return '';
}
