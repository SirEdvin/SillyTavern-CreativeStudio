import test from 'node:test';
import assert from 'node:assert/strict';
import { imageReady, referenceImageReady } from '../src/st/comfy.js';
import { setNanoSessionKey } from '../src/st/nanogpt.js';
import { startingSteps, missingSteps } from '../src/ui/generator.js';

test('configured NanoGPT supports the first portrait and automatic art steps as well as reference edits', () => {
    const ctx = { extensionSettings: { creativeStudio: { image: { backend: 'nanogpt', nanoModel: 'editor' } } } };
    setNanoSessionKey('test-key', ctx);
    globalThis.SillyTavern = { getContext: () => ({ ...ctx }) };
    try {
        assert.equal(imageReady(ctx), true);
        assert.equal(referenceImageReady(ctx), true);
        assert.ok(startingSteps().includes('art'));
        assert.ok(missingSteps({ card: { data: {} } }).includes('art'));
        setNanoSessionKey('',ctx);
        assert.equal(imageReady(ctx), false);assert.equal(referenceImageReady(ctx),false);
        setNanoSessionKey('test-key',ctx);
        ctx.extensionSettings.creativeStudio.image.backend = 'comfy';
        ctx.extensionSettings.creativeStudio.image.ckpt = 'model.safetensors';
        assert.equal(imageReady(ctx), true);
        assert.equal(referenceImageReady(ctx), true);
        assert.ok(startingSteps().includes('art'));
    } finally { delete globalThis.SillyTavern; }
});
