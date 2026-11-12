import test from 'node:test';
import assert from 'node:assert/strict';
import {savedNanoKey,saveNanoKey,forgetSavedNanoKey,initNanoKeyStore} from '../src/st/nano-key-store.js';
import {hasNanoKey} from '../src/st/nanogpt.js';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),data}};
const context=handle=>({extensionSettings:{},getRequestHeaders:()=>({'x-fixture-account':handle}),accountStorage:{getItem:()=>null,setItem:()=>{throw new Error('Must not write account settings')}}});
function fixture(){
    const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),fetch=globalThis.fetch,browser=storage(),ctx=context('account-a');
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:browser});
    globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/users/me');return Response.json({handle:options.headers['x-fixture-account']})};
    return {ctx,browser,restore:()=>{globalThis.fetch=fetch;if(old)Object.defineProperty(globalThis,'localStorage',old);else delete globalThis.localStorage}};
}
test('key survives a fresh module/session with only the stable server account identity restored',async()=>{
    const f=fixture();try{
        await saveNanoKey(' fixture-browser-key ',f.ctx);assert.equal(savedNanoKey(f.ctx),'fixture-browser-key');assert.equal(hasNanoKey(f.ctx),true);
        assert.doesNotMatch(JSON.stringify(f.ctx.extensionSettings),/fixture-browser-key/);
        const fresh=await import('../src/st/nano-key-store.js?new-browser-session'),restored=context('account-a');
        await fresh.initNanoKeyStore(restored);assert.equal(fresh.savedNanoKey(restored),'fixture-browser-key');
        await forgetSavedNanoKey(f.ctx);assert.equal(fresh.savedNanoKey(restored),'');assert.equal(f.browser.data.size,0);
    }finally{f.restore()}
});
test('different SillyTavern accounts never select each other’s browser key',async()=>{
    const f=fixture(),other=context('account-b');try{
        await saveNanoKey('account-a-key',f.ctx);assert.equal(savedNanoKey(other),'');
        await saveNanoKey('account-b-key',other);assert.equal(savedNanoKey(f.ctx),'account-a-key');assert.equal(savedNanoKey(other),'account-b-key');
        await forgetSavedNanoKey(other);assert.equal(savedNanoKey(f.ctx),'account-a-key');
    }finally{f.restore()}
});
test('first-save persistence is independent of any deferred or failed native account settings save',async()=>{
    const f=fixture();try{
        await saveNanoKey('first-save-key',f.ctx); // accountStorage.setItem would throw if invoked.
        const restored=context('account-a');await initNanoKeyStore(restored);
        assert.equal(savedNanoKey(restored),'first-save-key');
    }finally{f.restore()}
});
test('unavailable storage fails visibly rather than pretending the key was saved',async()=>{
    const f=fixture();try{
        Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{throw new Error('quota')},removeItem:()=>{throw new Error('blocked')}}});
        await assert.rejects(saveNanoKey('new-key',f.ctx),/could not save/i);assert.equal(savedNanoKey(f.ctx),'');
        await assert.rejects(forgetSavedNanoKey(f.ctx),/could not remove/i);
    }finally{f.restore()}
});
test('identity lookup failure stores no key and can be retried without guessing an account',async()=>{
    const f=fixture();try{
        globalThis.fetch=async()=>new Response('',{status:503});
        await assert.rejects(saveNanoKey('new-key',f.ctx),/identify.*account/i);assert.equal(f.browser.data.size,0);
        globalThis.fetch=async()=>Response.json({handle:'account-a'});await saveNanoKey('new-key',f.ctx);assert.equal(savedNanoKey(f.ctx),'new-key');
    }finally{f.restore()}
});
