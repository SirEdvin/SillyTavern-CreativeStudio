// Native chat More menu (Continue/Regenerate). Registration is idempotent and never replaces host actions.
export function addSceneMenuItem({ onRun, getProblem = () => '', onError = error => globalThis.toastr?.error?.(error.message, 'Creative Studio'), document: doc = globalThis.document } = {}) {
    const existing = doc.getElementById('cs-option-illustrate-scene');
    if (existing) return existing;
    const menu = doc.querySelector('#options .options-content');
    if (!menu || typeof onRun !== 'function') return null;
    const item = doc.createElement('a');
    item.id = 'cs-option-illustrate-scene';
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', 'Illustrate current scene');
    item.setAttribute('aria-disabled', 'false');
    item.tabIndex = 0;
    item.title = 'Creative Studio: illustrate this chat using the character portrait and NanoGPT (paid image request)';
    const icon = doc.createElement('i'); icon.className = 'fa-lg fa-solid fa-image'; icon.setAttribute('aria-hidden', 'true');
    const label = doc.createElement('span'); label.textContent = 'Illustrate current scene';
    item.append(icon, label);
    let busy = false;
    const refresh = () => {
        let problem = '';
        try { problem = getProblem(); } catch (error) { problem = error.message; }
        item.setAttribute('aria-disabled', String(busy || !!problem));
        item.style.opacity = problem ? '0.5' : '';
        item.title = problem || 'Generate a scene image in the background and attach it to the latest character reply (paid)';
        return problem;
    };
    const activate = async event => {
        event.preventDefault(); event.stopPropagation();
        if (busy || refresh()) return;
        busy = true;
        item.setAttribute('aria-disabled', 'true'); item.setAttribute('aria-busy', 'true');
        label.textContent = 'Illustrating current scene…';
        // Use ST's toggle so its private menu-visible state remains consistent for the next opening.
        const popup = doc.getElementById('options');
        if (popup && doc.defaultView?.getComputedStyle(popup).display !== 'none') doc.getElementById('options_button')?.click();
        try { await onRun(); }
        catch (error) { onError(error instanceof Error ? error : new Error(String(error))); }
        finally { busy = false; item.removeAttribute('aria-busy'); label.textContent = 'Illustrate current scene'; refresh(); }
    };
    item.addEventListener('click', activate);
    item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { if (event.repeat) return; activate(event); }
    });
    doc.getElementById('options_button')?.addEventListener('click', refresh);
    item.addEventListener('mouseenter', refresh);
    item.addEventListener('focus', refresh);
    const ctx = globalThis.SillyTavern?.getContext?.();
    for (const name of ['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_SENT','MESSAGE_EDITED','MESSAGE_UPDATED','MESSAGE_DELETED','MESSAGE_SWIPED']) {
        if (ctx?.eventTypes?.[name]) ctx.eventSource?.on?.(ctx.eventTypes[name], refresh);
    }
    refresh();
    const after = menu.querySelector('#option_continue') ?? menu.querySelector('#option_regenerate');
    if (after) after.after(item); else menu.appendChild(item);
    return item;
}
