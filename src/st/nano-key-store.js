// Browser-only credentials, scoped by the server's stable current-account handle. No settings writes.
import { stContext } from './env.js';
const PREFIX='creative-studio:nanogpt-key:';
const accounts=new WeakMap();
const scope=ctx=>ctx.extensionSettings??ctx.accountStorage??ctx;
export async function initNanoKeyStore(ctx=stContext(),{fetcher=globalThis.fetch}={}){
    const owner=scope(ctx);
    let entry=accounts.get(owner);
    if(!entry){
        entry={namespace:'',promise:null};
        entry.promise=(async()=>{
            const response=await fetcher('/api/users/me',{method:'GET',credentials:'same-origin',headers:ctx.getRequestHeaders()});
            if(!response.ok)throw new Error('Could not identify the SillyTavern account for browser key storage.');
            const user=await response.json();
            if(typeof user.handle!=='string'||!user.handle)throw new Error('SillyTavern returned no account identity for browser key storage.');
            entry.namespace=PREFIX+encodeURIComponent(user.handle);
            return entry.namespace;
        })().catch(error=>{accounts.delete(owner);throw error});
        accounts.set(owner,entry);
    }
    return entry.promise;
}
export function savedNanoKey(ctx=stContext()){
    try{const id=accounts.get(scope(ctx))?.namespace;return id?globalThis.localStorage?.getItem(id)||'':''}catch{return ''}
}
export async function saveNanoKey(value,ctx=stContext()){
    const key=String(value??'').trim();
    if(!key)throw new Error('Enter a NanoGPT API key to save.');
    const id=await initNanoKeyStore(ctx);
    try{
        const storage=globalThis.localStorage;if(!storage)throw new Error('unavailable');
        storage.setItem(id,key);
        if(storage.getItem(id)!==key)throw new Error('verification failed');
    }catch{throw new Error('Could not save the NanoGPT key in this browser. Allow site storage; the key was not saved to server settings or exports.')}
}
export async function forgetSavedNanoKey(ctx=stContext()){
    const id=await initNanoKeyStore(ctx);
    try{
        globalThis.localStorage.removeItem(id);
        if(globalThis.localStorage.getItem(id)!==null)throw new Error('verification failed');
    }catch{throw new Error('Could not remove the browser-saved NanoGPT key. Check this site’s storage permissions.')}
}
