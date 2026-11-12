// Chat-only ownership and native media attachment. No Studio mount/navigation dependencies.
import { captureScene, assertSceneCurrent } from '../core/scene.js';
import { stContext, stPost } from './env.js';

const visibleReply = m => m && !m.is_user && !m.is_system && !m.is_hidden && !m.extra?.isHidden && typeof m.mes === 'string' && m.mes.trim();
const latestReply = ctx => { for (let i=(ctx.chat?.length??0)-1;i>=0;i--) if(visibleReply(ctx.chat[i]))return i;return -1; };
const inlineImage = text => /<img\b|!\[[^\]]*\]\s*(?:\(|\[)/i.test(String(text??''));
function savedMessages(saved) {
    if(!Array.isArray(saved))throw new Error('Could not verify the saved chat.');
    return saved.length && saved[0] && !Object.hasOwn(saved[0],'mes') ? saved.slice(1) : saved;
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
    return {snapshot,index,message,text:message.mes,swipeId:message.swipe_id??0,characterName:ctx.characters[ctx.characterId].name};
}
export function assertChatTarget(ctx,target) {
    assertSceneCurrent(ctx,target.snapshot);
    const message=ctx.chat?.[target.index];
    if(message!==target.message || latestReply(ctx)!==target.index || message.mes!==target.text || (message.swipe_id??0)!==target.swipeId)
        throw new Error('The latest character message changed or was swiped. Start again for the current reply.');
    if(hasEmbeddedImage(message))throw new Error('The latest character message already has an image. No further image request will be started.');
    return message;
}
export async function readSavedChat(target) {
    return stPost('/api/chats/get',{avatar_url:target.snapshot.avatar,ch_name:target.characterName,file_name:target.snapshot.chatId});
}
function sameSavedReply(message,target) {
    return message && !message.is_user && !message.is_system && message.mes===target.text && (message.swipe_id??0)===target.swipeId;
}
export async function assertSavedTarget(target,{readChat=readSavedChat}={}) {
    // Only prevent a second image on this same reply. Do NOT compare whole chat/metadata snapshots:
    // ST legitimately updates integrity/cache/plugin bookkeeping in memory before saving it.
    const message=savedMessages(await readChat(target))[target.index];
    if(sameSavedReply(message,target)&&hasEmbeddedImage(message))throw new Error('This character reply already has a saved image. No image request will be started.');
}
export async function attachChatImage({target,media,scene='',getContext=stContext,readChat=readSavedChat,guard=()=>{}}) {
    guard();await assertSavedTarget(target,{readChat});guard();
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
    await ctx.saveChat();
    // Native saveChat swallows errors: verify only our exact attachment, not unrelated bookkeeping.
    const saved=savedMessages(await readChat(target))[target.index];
    if(!sameSavedReply(saved,target)||!saved.extra?.media?.some(m=>m.type==='image'&&m.url===media.url))
        throw new Error('The image is attached in this tab, but chat persistence could not be verified. Save the chat again; the image is also kept in Studio’s gallery.');
    return attachment;
}
