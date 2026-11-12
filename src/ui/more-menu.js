// Native chat More menu (Continue/Regenerate). Registration is idempotent and never replaces host actions.
export function addSceneMenuItem({ onRun, onError = error => globalThis.toastr?.error?.(error.message, 'Creative Studio'), document: doc = globalThis.document } = {}) {
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
    const activate = async event => {
        event.preventDefault(); event.stopPropagation();
        if (busy) return;
        busy = true;
        item.setAttribute('aria-disabled', 'true'); item.setAttribute('aria-busy', 'true');
        label.textContent = 'Illustrating current scene…';
        // Use ST's toggle so its private menu-visible state remains consistent for the next opening.
        const popup = doc.getElementById('options');
        if (popup && doc.defaultView?.getComputedStyle(popup).display !== 'none') doc.getElementById('options_button')?.click();
        try { await onRun(); }
        catch (error) { onError(error instanceof Error ? error : new Error(String(error))); }
        finally { busy = false; item.setAttribute('aria-disabled', 'false'); item.removeAttribute('aria-busy'); label.textContent = 'Illustrate current scene'; }
    };
    item.addEventListener('click', activate);
    item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { if (event.repeat) return; activate(event); }
    });
    const after = menu.querySelector('#option_continue') ?? menu.querySelector('#option_regenerate');
    if (after) after.after(item); else menu.appendChild(item);
    return item;
}
