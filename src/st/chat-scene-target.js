// Chat-only ownership and native media attachment. No Studio mount/navigation dependencies.
import { captureScene, assertSceneCurrent } from '../core/scene.js';
import { stContext, stPost } from './env.js';

const visibleReply = m => m && !m.is_user && !m.is_system && !m.is_hidden && !m.extra?.isHidden && typeof m.mes === 'string' && m.mes.trim();
const latestReply = ctx => { for (let i=(ctx.chat?.length??0)-1;i>=0;i--) if(visibleReply(ctx.chat[i]))return i;return -1; };
const inlineImage = text => /<img\b|!\[[^\]]*\]\s*(?:\(|\[)/i.test(String(text??''));
const stable = value => JSON.stringify(value, (_key,item) => item && typeof item==='object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);
function chatState(messages,normalize) {
    const copy=JSON.parse(JSON.stringify(messages));
    copy.forEach(message=>{
        if(message && !message.is_user && !message.is_system)message.swipe_id??=0;
        normalize?.(message);
    });
    return stable(copy);
}
function unpackSaved(saved) {
    if(!Array.isArray(saved))throw new Error('Could not verify the saved chat.');
    const header=saved.length && saved[0] && !Object.hasOwn(saved[0],'mes') ? saved[0] : null;
    return {messages:header?saved.slice(1):saved,metadata:header?.chat_metadata??{}};
}
function assertSavedBaseline(saved,target) {
    const {messages,metadata}=unpackSaved(saved);
    if(chatState(messages,target.normalize)!==target.chatBaseline || (target.hasMetadata && stable(metadata)!==target.metadataBaseline))
        throw new Error('The saved chat changed in another tab or device. Reload this chat before illustrating; no newer messages or metadata will be overwritten.');
}
export function hasEmbeddedImage(message) {
    const extra=message?.extra??{};
    return !!(Object.getOwnPropertyDescriptor(extra,'image')?.value || extra.image_swipes?.length || extra.media?.some?.(m=>m.type==='image'&&m.url)
        || inlineImage(message?.mes) || inlineImage(extra.display_text));
}
export function captureChatTarget(ctx=stContext()) {
    const avatar=ctx.characters?.[ctx.characterId]?.avatar;
    const snapshot=captureScene(ctx,{origin:{kind:'st',avatar}},{messages:ctx.extensionSettings?.creativeStudio?.image?.sceneMessages});
    const index=latestReply(ctx);
    if(index<0)throw new Error('There is no visible character message to illustrate yet.');
    const message=ctx.chat[index];
    if(hasEmbeddedImage(message))throw new Error('The latest character message already has an image. No image request will be started.');
    const normalize=ctx.ensureMessageMediaIsArray;
    return {snapshot,index,message,text:message.mes,swipeId:message.swipe_id??0,characterName:ctx.characters[ctx.characterId].name,
        normalize,chatBaseline:chatState(ctx.chat,normalize),hasMetadata:ctx.chatMetadata!==undefined,metadataBaseline:stable(ctx.chatMetadata)};
}
export function assertChatTarget(ctx,target) {
    assertSceneCurrent(ctx,target.snapshot);
    const message=ctx.chat?.[target.index];
    if(message!==target.message || latestReply(ctx)!==target.index || message.mes!==target.text || (message.swipe_id??0)!==target.swipeId)
        throw new Error('The latest character message changed or was swiped. Start again for the current reply.');
    if(hasEmbeddedImage(message))throw new Error('The latest character message already has an image. No further image request will be started.');
    if(chatState(ctx.chat,target.normalize)!==target.chatBaseline || (target.hasMetadata && stable(ctx.chatMetadata)!==target.metadataBaseline))
        throw new Error('The chat changed while illustrating. Start again for the current conversation.');
    return message;
}
export async function readSavedChat(target) {
    return stPost('/api/chats/get',{avatar_url:target.snapshot.avatar,ch_name:target.characterName,file_name:target.snapshot.chatId});
}
function savedMessage(saved,target) {
    const {messages}=unpackSaved(saved);
    const message=messages[target.index];
    if(!message || message.is_user || message.is_system || message.mes!==target.text || (message.swipe_id??0)!==target.swipeId)
        throw new Error('The saved character message changed or is not saved yet. Wait for chat saving, then try again.');
    return message;
}
export async function assertSavedTarget(target,{readChat=readSavedChat}={}) {
    const saved=await readChat(target);
    if(hasEmbeddedImage(savedMessage(saved,target)))throw new Error('The saved character message already has an image, possibly from another tab. No image request will be started.');
    assertSavedBaseline(saved,target);
}
export async function attachChatImage({target,media,scene='',getContext=stContext,readChat=readSavedChat,guard=()=>{}}) {
    guard();
    await assertSavedTarget(target,{readChat});
    guard();
    const ctx=getContext(),message=assertChatTarget(ctx,target);
    if(typeof ctx.saveChat!=='function'||typeof ctx.updateMessageBlock!=='function')throw new Error('This SillyTavern version cannot save and render message attachments.');
    if(!media?.url?.startsWith('/user/files/'))throw new Error('The scene image was not saved as a SillyTavern user file.');
    ctx.ensureMessageMediaIsArray?.(message);
    message.extra??={};
    const attachment={type:'image',url:media.url,title:scene,source:'generated'};
    message.extra.media=[...(message.extra.media??[]),attachment];
    message.extra.inline_image=true;
    message.extra.media_display??='list';
    message.extra.media_index=message.extra.media.length-1;
    ctx.updateMessageBlock(target.index,message,{rerenderMessage:false});
    const expectedChat=chatState(ctx.chat,target.normalize),expectedMetadata=stable(ctx.chatMetadata);
    await ctx.saveChat();
    // Native saveChat swallows errors: read the exact avatar/chat/message back before reporting success.
    const savedChat=await readChat(target),saved=savedMessage(savedChat,target),state=unpackSaved(savedChat);
    if(!saved.extra?.media?.some(m=>m.type==='image'&&m.url===media.url) || chatState(state.messages,target.normalize)!==expectedChat
        || (target.hasMetadata && stable(state.metadata)!==expectedMetadata))
        throw new Error('The image is attached in this tab, but chat persistence could not be verified. Save the chat again; the image is also kept in Studio’s gallery.');
    return attachment;
}
