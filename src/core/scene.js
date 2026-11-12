// A bounded, immutable view of the live conversation; never select a character by name alone.
import { hashString } from './bytes.js';

const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.trunc(Number(value)))) : fallback;
const textOf = message => String(message.mes ?? '')
    .replace(/<(think|thinking|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(think|thinking)\b[^>]*>[\s\S]*$/gi, '')
    .replace(/<[^>]*>/g, '').trim();
const visible = message => !message.is_system && !message.is_hidden && !message.extra?.isHidden;

function liveIdentity(ctx) {
    if (ctx.groupId != null && ctx.groupId !== '') throw new Error('Scene illustration currently supports one-character chats, not group chats.');
    if (ctx.characterId == null || !ctx.characters?.[ctx.characterId]?.avatar) throw new Error('Open a chat with a character first.');
    const avatar = ctx.characters[ctx.characterId].avatar;
    const chatId = ctx.getCurrentChatId?.();
    if (chatId == null || chatId === '') throw new Error('Open a saved chat before illustrating its scene.');
    return { avatar, chatId: String(chatId) };
}

function dialogue(ctx, messages, maxChars) {
    const out = [];
    let remaining = maxChars;
    for (let i = (ctx.chat?.length ?? 0) - 1; i >= 0 && out.length < messages && remaining > 0; i--) {
        const message = ctx.chat[i];
        if (!message || !visible(message)) continue;
        const text = textOf(message).slice(-Math.min(remaining, 6000));
        if (!text) continue;
        out.push({ role: message.is_user ? 'user' : 'assistant', name: String(message.name ?? '').slice(0, 120), text });
        remaining -= text.length;
    }
    return out.reverse();
}

export function captureScene(ctx, character, { messages = 12, maxChars = 18000 } = {}) {
    const identity = liveIdentity(ctx);
    const linkedAvatar = (character.origin?.kind === 'st' && character.origin.avatar) || character.stAvatar || character.portraitSource?.avatar;
    if (!linkedAvatar) throw new Error('Use the linked SillyTavern character: open it in Studio from the character panel first.');
    if (linkedAvatar !== identity.avatar) throw new Error('Open a chat with the same character as this Pictures workspace; a different character is active.');
    const limits = { messages: bounded(messages, 12, 1, 40), maxChars: bounded(maxChars, 18000, 1000, 30000) };
    const selected = dialogue(ctx, limits.messages, limits.maxChars);
    if (!selected.length) throw new Error('The current chat has no visible text messages to illustrate.');
    return { ...identity, characterId: character.id, messages: selected, limits, fingerprint: hashString(JSON.stringify(selected)) };
}

export function assertSceneCurrent(ctx, snapshot) {
    let current;
    try { current = liveIdentity(ctx); } catch { throw new Error('The active chat changed. Start scene illustration again.'); }
    if (current.avatar !== snapshot.avatar || current.chatId !== snapshot.chatId
        || hashString(JSON.stringify(dialogue(ctx, snapshot.limits.messages, snapshot.limits.maxChars))) !== snapshot.fingerprint) {
        throw new Error('The active chat changed while illustrating. Start again for the current scene.');
    }
}
