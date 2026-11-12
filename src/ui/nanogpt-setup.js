// NanoGPT setup keeps secrets out of settings and offers the provider's real editable-model catalog.
import { html, useState, useEffect, Button, cx } from './kit.js';
import { stContext } from '../st/env.js';
import { initNanoKeyStore } from '../st/nano-key-store.js';
import { nanoModels, nanoModelMetadata, nanoCanEdit, nanoResolutions, nanoStoredKeys, saveNanoKey, forgetNanoKey, hasNanoKey } from '../st/nanogpt.js';

export function NanoImageSetup({ s, set }) {
    const ctx = stContext();
    const [key, setKey] = useState('');
    const [keyReady, setKeyReady] = useState(() => hasNanoKey(ctx));
    const [models, setModels] = useState([]);
    const [keys, setKeys] = useState([]);
    const [metadata, setMetadata] = useState(null);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        let active = true;
        initNanoKeyStore(ctx).then(() => { if (active) setKeyReady(hasNanoKey(ctx)); })
            .catch(error => { if (active) setError(error.message); });
        return () => { active = false; };
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        setMetadata(null);
        const timer = setTimeout(() => {
            if (!s.nanoModel) return;
            nanoModelMetadata(s.nanoModel, { signal: controller.signal }).then(data => {
                if (!controller.signal.aborted) { setMetadata(data); setError(nanoCanEdit(data) ? '' : 'This model does not advertise reference-image editing. Choose another model.'); }
            }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
        }, 300);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [s.nanoModel]);
    const loadModels = async () => {
        setLoading(true); setError('');
        try { const list = await nanoModels(); setModels(list.filter(m => m.canEdit)); setStatus(`Loaded ${list.filter(m => m.canEdit).length} reference-editing models. No image credits were spent.`); }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };
    const loadKeys = async () => {
        try { setKeys(await nanoStoredKeys({ ctx })); setStatus('Loaded stored NanoGPT key labels.'); }
        catch (e) { setError(e.message); }
    };
    const useKey = async () => {
        try {
            await saveNanoKey(key, ctx); setKeyReady(hasNanoKey(ctx)); setKey(''); set({ nanoSecretId: '' }); setError('');
            setStatus('Key saved in this browser. It will be reused after reloading or reopening SillyTavern.');
        } catch (error) { setError(error.message); }
    };
    const forgetKey = async () => {
        try { await forgetNanoKey(ctx); setKeyReady(false); setError(''); setStatus('Browser key removed.'); }
        catch (error) { setError(error.message); }
    };
    return html`<div class="cs-stack cs-nanogpt-setup">
        <p class="cs-muted cs-small">NanoGPT edits the character’s existing portrait. Scene illustration sends the portrait and LLM-written instructions to NanoGPT; recent chat text goes to your creation LLM. Each click makes a paid image request. Nothing runs automatically.</p>
        <label class="cs-field"><span>NanoGPT API key</span>
            <input type="password" class="text_pole cs-input" aria-label="NanoGPT API key" autocomplete="off" value=${key} onInput=${e => setKey(e.currentTarget.value)} placeholder=${keyReady ? 'A key is ready; save a new key to replace it' : 'Saved in this browser, not in projects or exports'} />
        </label>
        <div class="cs-row">
            <${Button} label="Save key" onClick=${useKey} disabled=${!key.trim()} />
            <${Button} small label="Forget saved key" onClick=${forgetKey} disabled=${!keyReady} />
            <span class="cs-small cs-muted">${keyReady ? 'Key ready' : 'No key saved'}</span>
        </div>
        <p class="cs-muted cs-small">Keys are always saved in this browser for this SillyTavern account, separately from settings and exports. Site scripts/extensions can read browser storage; this is not an encrypted server vault. Other browsers/devices need their own key. Forget saved key removes it.</p>
        <details><summary>Use an existing SillyTavern vault key instead</summary>
            <p class="cs-muted cs-small">Optional: only works when this server already allows API-key exposure to extensions. Studio does not enable exposure or rotate the active key. Use a browser-saved key if access is denied.</p>
            <${Button} small label="Load stored key labels" onClick=${loadKeys} />
            <label class="cs-field"><span>Stored NanoGPT key</span><select class="text_pole cs-input" aria-label="Stored NanoGPT key" value=${s.nanoSecretId} onChange=${e => set({ nanoSecretId: e.currentTarget.value })}>
                <option value="">Use browser-saved key</option>
                ${s.nanoSecretId && !keys.some(k => k.id === s.nanoSecretId) && html`<option value=${s.nanoSecretId}>Saved key selection (load labels to inspect)</option>`}
                ${keys.map(k => html`<option value=${k.id}>${k.label}${k.active ? ' (active)' : ''}</option>`)}
            </select></label>
        </details>
        <label class="cs-field"><span>Image-editing model ID</span>
            <input class="text_pole cs-input cs-mono" aria-label="NanoGPT image model ID" list="cs-nanogpt-models" value=${s.nanoModel} onChange=${e => set({ nanoModel: e.currentTarget.value.trim(), nanoResolution: 'auto' })} />
            <datalist id="cs-nanogpt-models">${models.map(m => html`<option value=${m.id}>${m.name ?? m.id}</option>`)}</datalist>
        </label>
        <${Button} small label=${loading ? 'Loading models…' : 'Load editing models'} onClick=${loadModels} disabled=${loading} />
        <p class="cs-muted cs-small">Examples: bytedance/seedream-v5.5, hidream-o1-image, hidream-o1-image-dev, google/gemini-nano-banana-2.1. Availability and prices come from NanoGPT, not Studio.</p>
        <label class="cs-field"><span>Output resolution</span><select class="text_pole cs-input" aria-label="NanoGPT output resolution" value=${s.nanoResolution} onChange=${e => set({ nanoResolution: e.currentTarget.value })}>
            <option value="auto">Auto (supported model default)</option>
            ${nanoResolutions(metadata).map(value => html`<option value=${value}>${value}</option>`)}
        </select></label>
        <label class="cs-field"><span>Recent chat messages for scene analysis</span><input type="number" class="text_pole cs-input" aria-label="Scene context messages" min="1" max="40" value=${s.sceneMessages} onChange=${e => set({ sceneMessages: Math.max(1, Math.min(40, Number(e.currentTarget.value) || 12)) })} /></label>
        <p class="cs-muted cs-small">Open the same character’s chat, then use Pictures → Illustrate current scene. The original portrait anchors identity and style; clothes, surroundings, pose and framing follow the conversation. This is not an expression-pack generator; expression packs still need ComfyUI.</p>
        ${status && html`<p role="status" class="cs-small cs-ok-text">${status}</p>`}
        ${error && html`<p role="alert" class=${cx('cs-small', 'cs-err-text')}>${error}</p>`}
    </div>`;
}
