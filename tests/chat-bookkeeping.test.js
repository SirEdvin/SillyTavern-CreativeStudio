import test from 'node:test';
import assert from 'node:assert/strict';
import {captureChatTarget,assertChatTarget,assertSavedTarget} from '../src/st/chat-scene-target.js';

test('native in-memory integrity/cache bookkeeping does not imply another tab or device',async()=>{
    const ctx={characterId:0,characters:[{avatar:'mara.png',name:'Mara'}],getCurrentChatId:()=> 'chat-a',
        chat:[{mes:'Rainy platform',is_user:false,extra:{token_count:12}}],chatMetadata:{integrity:'added-by-getChat-in-this-tab'}};
    const saved=[{chat_metadata:{}},{mes:'Rainy platform',is_user:false,extra:{}}];
    const target=captureChatTarget(ctx);
    await assertSavedTarget(target,{readChat:async()=>saved});
    ctx.chatMetadata.extra_bookkeeping='updated';ctx.chat[0].extra.token_count=13;
    assertChatTarget(ctx,target);
});
