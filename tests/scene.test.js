import test from 'node:test';
import assert from 'node:assert/strict';
import { captureScene, assertSceneCurrent } from '../src/core/scene.js';
import { buildTask, getTask } from '../src/ai/tasks.js';

function fixture() {
    const character = { id: 'c1', origin: { kind: 'st', avatar: 'mara.png' }, card: { data: { name: 'Mara', description: 'Silver hair, amber eyes.' } } };
    const ctx = { characterId: 0, characters: [{ avatar: 'mara.png' }], getCurrentChatId: () => 'chat-a', chat: [
        { name: 'Mara', mes: 'We are in the old library.', is_user: false },
        { name: 'You', mes: 'Put on your coat and follow me.', is_user: true },
        { name: 'Mara', mes: '<think>private reasoning</think>She steps onto the rainy platform in her coat.', is_user: false },
    ] };
    return { character, ctx };
}

test('scene snapshot uses the selected character and chronological recent dialogue, not hidden/system messages', () => {
    const { character, ctx } = fixture();
    ctx.chat.push({ is_system: true, mes: 'internal system instructions' }, { is_hidden: true, mes: 'hidden text' }, { mes: '<img src="private.png">' });
    const scene = captureScene(ctx, character, { messages: 2 });
    assert.equal(scene.avatar, 'mara.png');
    assert.equal(scene.chatId, 'chat-a');
    assert.equal(scene.messages.length, 2);
    assert.equal(scene.messages[0].role, 'user');
    assert.match(scene.messages[1].text, /rainy platform/);
    assert.doesNotMatch(JSON.stringify(scene), /private reasoning|internal system|hidden text|private.png/);
    assertSceneCurrent(ctx, scene);
});

test('scene context is bounded while preserving the newest visible moment', () => {
    const { character, ctx } = fixture();
    ctx.chat = Array.from({ length: 80 }, (_, i) => ({ name: 'Mara', mes: `${i}: ${'x'.repeat(2000)}` }));
    const scene = captureScene(ctx, character, { messages: 1000, maxChars: 5000 });
    assert.ok(scene.messages.length <= 40);
    assert.ok(scene.messages.reduce((n, m) => n + m.text.length, 0) <= 5000);
    assert.match(scene.messages.at(-1).text, /^79:/);
});

test('missing chat, group chat, unlinked character and another active character fail closed', () => {
    const { character, ctx } = fixture();
    assert.throws(() => captureScene({ ...ctx, chat: [] }, character), /message/i);
    assert.throws(() => captureScene({ ...ctx, groupId: 'g' }, character), /group/i);
    assert.throws(() => captureScene({ ...ctx, characterId: undefined }, character), /open.*chat/i);
    assert.throws(() => captureScene(ctx, { ...character, origin: { kind: 'new' } }), /linked|SillyTavern character/i);
    assert.throws(() => captureScene({ ...ctx, characters: [{ avatar: 'other.png' }] }, character), /same character|different character/i);
});

test('stale chat, character, and changed dialogue cannot be used for a later generation', () => {
    const { character, ctx } = fixture();
    const snapshot = captureScene(ctx, character);
    assert.throws(() => assertSceneCurrent({ ...ctx, getCurrentChatId: () => 'chat-b' }, snapshot), /chat.*changed/i);
    assert.throws(() => assertSceneCurrent({ ...ctx, characters: [{ avatar: 'other.png' }] }, snapshot), /chat.*changed/i);
    ctx.chat.at(-1).mes = 'A regenerated answer changes the scene.';
    assert.throws(() => assertSceneCurrent(ctx, snapshot), /chat.*changed/i);
});

test('scene prompts require first-person user POV even with legacy prompt overrides or conflicting guidance', () => {
    const {character,ctx}=fixture();
    for(const overrides of [{},{'media.scene':'Legacy direction: show both participants in a third-person shot.'}]){
        const prompt=buildTask('media.scene',{card:character.card,messages:captureScene(ctx,character).messages,guidance:'Show both participants from behind the user.'},{overrides});
        assert.match(prompt.system,/first-person user POV/i);
        assert.match(prompt.system,/character.*(?:visible|in frame)/i);
        assert.match(prompt.system,/user.*(?:entirely off-screen|not visible)/i);
        assert.match(prompt.system,/hands.*reflections.*shadows/i);
        assert.match(prompt.system,/overrides conflicting/i);
    }
});

test('scene task asks for identity-preserving instructions while allowing established clothes, pose and surroundings', () => {
    const { character, ctx } = fixture();
    const scene = captureScene(ctx, character);
    const task = getTask('media.scene');
    assert.ok(task.schema.required.includes('instruction'));
    const prompt = buildTask('media.scene', { card: character.card, messages: scene.messages });
    assert.match(prompt.system, /identity/i);
    assert.match(prompt.system, /clothing|clothes/i);
    assert.match(prompt.system, /pose/i);
    assert.match(prompt.system, /reference material|data, not instructions/i);
    assert.match(prompt.user, /rainy platform/);
    assert.match(prompt.user, /Silver hair/);
    assert.doesNotMatch(prompt.system, /Preserve.*background.*framing/);
});
