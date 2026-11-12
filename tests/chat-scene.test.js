import test from 'node:test';
import assert from 'node:assert/strict';
import { captureChatTarget, assertChatTarget, hasEmbeddedImage, attachChatImage, assertSavedTarget } from '../src/st/chat-scene-target.js';

function context() {
    return {characterId:0,characters:[{avatar:'mara.png',name:'Mara'}],getCurrentChatId:()=> 'chat-a',chat:[
        {mes:'Old reply',is_user:false},{mes:'Rainy platform',is_user:false,swipe_id:0},
        {mes:'I offer my umbrella.',is_user:true},{mes:'hidden',is_system:true},
    ]};
}
test('targets the latest visible character reply, never the user or a system message',()=>{
    const ctx=context(),target=captureChatTarget(ctx);assert.equal(target.index,1);assert.equal(target.message,ctx.chat[1]);assertChatTarget(ctx,target);
    ctx.chat[1].swipe_id=1;assert.throws(()=>assertChatTarget(ctx,target),/changed|swip/i);
});
test('all native, legacy and inline image forms block before generation',()=>{
    for(const patch of [{extra:{media:[{type:'image',url:'/a.png'}]}},{extra:{image:'/a.png'}},{extra:{image_swipes:['/a.png']}},{mes:'<img src="/a.png">'},{mes:'![scene](/a.png)'},{extra:{display_text:'![scene][image]'}}]){
        const ctx=context();Object.assign(ctx.chat[1],patch);assert.equal(hasEmbeddedImage(ctx.chat[1]),true);assert.throws(()=>captureChatTarget(ctx),/already.*image/i);
    }
});
test('the initial swipe may be unnumbered in saved greetings without implying a different reply',async()=>{
    const ctx=context(),target=captureChatTarget(ctx),saved=structuredClone(ctx.chat);delete saved[1].swipe_id;
    await assertSavedTarget(target,{readChat:async()=>saved});
    saved[1].swipe_id=1;await assert.rejects(assertSavedTarget(target,{readChat:async()=>saved}),/changed/i);
});
test('an image added while preparing, replacement of the message, and new replies invalidate the target',()=>{
    for(const change of [c=>c.chat[1].extra={media:[{type:'image',url:'/a.png'}]},c=>c.chat[1]={...c.chat[1]},c=>c.chat.push({mes:'New reply'})]){
        const ctx=context(),target=captureChatTarget(ctx);change(ctx);assert.throws(()=>assertChatTarget(ctx,target),/image|changed|latest/i);
    }
});
test('attaches as native message media, preserves text/user messages and verifies the saved exact target',async()=>{
    const ctx=context(),target=captureChatTarget(ctx);let saved=structuredClone(ctx.chat),rendered;
    ctx.updateMessageBlock=(index,msg)=>{rendered=[index,msg]};ctx.saveChat=async()=>{saved=structuredClone(ctx.chat)};
    const media={id:'scene-1',url:'/user/files/scene.png'};
    await attachChatImage({target,media,scene:'Rainy platform',getContext:()=>ctx,readChat:async()=>[{chat_metadata:{}},...saved]});
    assert.equal(rendered[0],1);assert.equal(ctx.chat[1].mes,'Rainy platform');assert.equal(ctx.chat[2].extra,undefined);
    assert.deepEqual(ctx.chat[1].extra.media[0],{type:'image',url:media.url,title:'Rainy platform',source:'generated'});
    assert.equal(ctx.chat.length,4);assert.throws(()=>captureChatTarget(ctx),/already.*image/i);
});
test('remote appended turns, edits outside the target and metadata changes never get overwritten',async()=>{
    for(const kind of ['append','edit','metadata']){
        const ctx=context();ctx.chatMetadata={integrity:'same-slug',note:'original'};
        const target=captureChatTarget(ctx),saved=structuredClone(ctx.chat),metadata={...ctx.chatMetadata};let saves=0;
        ctx.saveChat=async()=>{saves++};ctx.updateMessageBlock=()=>{};
        if(kind==='append')saved.push({mes:'New remote turn',is_user:false});
        if(kind==='edit')saved[0].mes='Remote edit to an earlier message';
        if(kind==='metadata')metadata.note='Remote metadata change';
        await assert.rejects(attachChatImage({target,media:{url:'/user/files/scene.png'},getContext:()=>ctx,
            readChat:async()=>[{chat_metadata:metadata},...saved]}),/saved chat changed/i);
        assert.equal(saves,0);assert.equal(ctx.chat[1].extra,undefined);
    }
});
test('a swallowed native save failure is not reported as persisted success',async()=>{
    const ctx=context(),target=captureChatTarget(ctx),old=structuredClone(ctx.chat);
    ctx.updateMessageBlock=()=>{};ctx.saveChat=async()=>{};
    await assert.rejects(attachChatImage({target,media:{url:'/user/files/scene.png'},getContext:()=>ctx,readChat:async()=>old}),/sav|persist|verif/i);
    assert.equal(hasEmbeddedImage(ctx.chat[1]),true); // Keep visible output and block another paid generation.
});
