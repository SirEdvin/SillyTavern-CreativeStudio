// One transaction-like user action: live scene -> LLM direction -> portrait edit -> owned gallery image.
import { captureScene, assertSceneCurrent } from '../core/scene.js';
import { SCENE_POV_RULE } from '../core/scene-composition.js';
import { pictureTarget } from '../core/pictures.js';
import { findArtifact } from '../core/project.js';
import { contentOf } from '../core/content.js';
import { buildTask, getTask } from '../ai/tasks.js';
import { runStructured } from '../ai/gateway.js';
import { mediaBytes, saveCharacterPicture } from '../ui/media.js';
import { stContext } from './env.js';
import { promptOverrides } from './prompt-store.js';

export async function illustrateScene({ store, env, projectId, characterId, ctx, generate,
    signal, onStatus = () => {}, messages = 12, guidance = '', runLlm = runStructured, guard = () => {} }) {
    // ST getContext() returns a snapshot wrapper: refresh it for ownership checks, not just once at job start.
    const context = () => ctx ?? stContext();
    const startedContext = context();
    const project = store.get();
    const character = pictureTarget(project, projectId, characterId);
    const reference = findArtifact(project, 'media', character.avatarMediaId);
    if (!reference || reference.kind !== 'image') throw new Error('Choose or load this character’s original portrait before illustrating.');
    if (typeof generate !== 'function') throw new Error('Configure a reference-image editing backend first.');
    const snapshot = captureScene(startedContext, character, { messages });
    const portraitId = reference.id;
    const check = () => {
        if (signal?.aborted) throw new Error('Scene illustration cancelled.');
        guard();
        const current = pictureTarget(store.get(), projectId, characterId);
        if (current.avatarMediaId !== portraitId) throw new Error('The reference portrait changed. Start scene illustration again.');
        assertSceneCurrent(context(), snapshot);
    };
    check();
    onStatus('Loading the original character portrait…');
    const bytes = await mediaBytes(env, reference);
    check();
    if (!bytes?.length) throw new Error('The reference portrait could not be read.');
    const task = getTask('media.scene');
    let overrides = {};
    try { overrides = promptOverrides(); } catch { /* tests/standalone context */ }
    const prompt = buildTask('media.scene', { card: character.card, messages: snapshot.messages, guidance }, { overrides, content: contentOf(project) });
    onStatus('Reading the current scene and writing image instructions…');
    const result = await runLlm(startedContext, { ...prompt, schema: task.schema, schemaName: task.schemaName,
        maxTokens: task.maxTokens, profileId: project.settings?.creationProfileId ?? '', signal, onStatus });
    check();
    const description = typeof result?.value?.scene === 'string' ? result.value.scene.trim() : '';
    const rawInstruction = typeof result?.value?.instruction === 'string' ? result.value.instruction.trim() : '';
    // Structured repair can return partial values with schema warnings: never spend image credits on them.
    if (!description || description.length > 3000 || !rawInstruction || rawInstruction.length > 8000) {
        throw new Error('The LLM did not return a valid scene and editing instruction. No image request was sent.');
    }
    // Keep the required composition in the actual image request even with old overrides or imperfect LLM output.
    const instruction = `${rawInstruction}\n\n${SCENE_POV_RULE}`;
    onStatus('Editing the portrait into the current scene with NanoGPT…');
    const image = await generate({ reference: bytes, instruction, signal, beforeSubmit: check });
    check();
    if (!image?.bytes?.length) throw new Error('The image provider returned no image.');
    onStatus('Saving the scene illustration…');
    const media = await saveCharacterPicture(env, store, projectId, characterId, image.bytes, {
        purpose: 'scene', prompt: instruction, seed: image.seed ?? null, referenceMediaId: portraitId,
        scene: { description, chatId: snapshot.chatId, characterAvatar: snapshot.avatar,
            imageModel: image.model ?? '', textModel: result.meta?.model ?? '' },
        beforeAttach: check,
    });
    onStatus('Scene illustration saved. The original avatar is unchanged.');
    return { media, scene: description, instruction };
}
