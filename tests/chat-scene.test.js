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
test('saved duplicate-image protection applies only to the same message/swipe',async()=>{
    const ctx=context(),target=captureChatTarget(ctx),saved=structuredClone(ctx.chat);delete saved[1].swipe_id;
    await assertSavedTarget(target,{readChat:async()=>saved});
    saved[1].extra={image:'/existing.png'};await assert.rejects(assertSavedTarget(target,{readChat:async()=>saved}),/already.*image/i);
    saved[1].swipe_id=1;await assertSavedTarget(target,{readChat:async()=>saved});
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
test('saved metadata, non-target edits and appended turns no longer trigger a whole-chat guard',async()=>{
    const ctx=context();ctx.chatMetadata={integrity:'local'};const target=captureChatTarget(ctx),saved=structuredClone(ctx.chat);
    saved[0].extra={token_count:99};saved.push({mes:'Extra saved turn',is_user:false});
    await assertSavedTarget(target,{readChat:async()=>[{chat_metadata:{integrity:'other'}},...saved]});
});
test('a swallowed native save failure is not reported as persisted success',async()=>{
    const ctx=context(),target=captureChatTarget(ctx),old=structuredClone(ctx.chat);
    ctx.updateMessageBlock=()=>{};ctx.saveChat=async()=>{};
    await assert.rejects(attachChatImage({target,media:{url:'/user/files/scene.png'},getContext:()=>ctx,readChat:async()=>old}),/sav|persist|verif/i);
    assert.equal(hasEmbeddedImage(ctx.chat[1]),true); // Keep visible output and block another paid generation.
});
