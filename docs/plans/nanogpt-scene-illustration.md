# NanoGPT Scene Illustration Implementation Plan

> **For Hermes:** Use subagent-driven-development for independent review of the completed implementation; implementation is performed directly in this branch.

**Goal:** Add a one-click, live-chat-aware illustration action using a character's original portrait and a NanoGPT image-editing model, without changing the avatar or silently dropping the reference.

**Architecture:** A bounded scene snapshot and editable structured LLM task produce a visual moment and natural-language editing instructions. A NanoGPT adapter discovers actual image-input capabilities and supported sizes, sends the portrait with the instruction, and validates the result. The Pictures workspace composes these stages into one cancellable action and stores the resulting image in its existing gallery. Existing ComfyUI and built-in ST workflows remain intact.

**Tech Stack:** Browser ES modules, vendored Preact/htm, SillyTavern context/secrets APIs, NanoGPT normalized Image API, Node built-in test runner.

---

### Task 1: Scene snapshot and LLM contract

Files: create `src/core/scene.js`, `tests/scene.test.js`; modify `src/ai/tasks.js`.

1. Write failing tests for bounded latest dialogue, system/hidden-message exclusion, no-chat/group/mismatched-character rejection, and snapshot freshness checks.
2. Implement a snapshot anchored to exact ST character avatar and chat ID; treat card/chat contents as data, not executable directives.
3. Register editable `media.scene` instruction and JSON output schema (`scene`, `instruction`). Preserve identity/style while permitting scene-established clothes, surroundings, position and framing.
4. Run `node --test tests/scene.test.js tests/prompts.test.js`.

### Task 2: NanoGPT provider

Files: create `src/st/nanogpt.js`, `tests/nanogpt.test.js`; modify `src/st/comfy.js`, `src/ui/image-setup.js`.

1. Establish a supported credential path using ST secrets without raw keys in project/settings/export data.
2. Write failing tests for live-model capability discovery, input-reference requests, model-specific resolution selection, response validation, timeouts/cancellation and credential isolation.
3. Implement bounded requests without automatic paid retries. Require image-input support for scene edits; reject missing/invalid portraits before generation.
4. Add NanoGPT image settings, stored-key selection, model discovery/manual ID, output size and context depth controls. Retain existing backend settings.
5. Run focused NanoGPT tests plus the full existing suite.

### Task 3: One-click orchestration and UI

Files: create `src/st/scene-illustration.js`, `tests/scene-illustration.test.js`; modify `src/ui/character-pictures.js` and `src/ui/media.js` if needed.

1. Test reference loading, structured LLM call, validated editing instruction, generation, gallery persistence, unchanged avatar and abort/stale-chat guards.
2. Add “Illustrate current scene” with status, cancellation and optional scene guidance. Use the canonical portrait; no text-only fallback.
3. Ensure target ownership survives asynchronous operations and prevent double clicks. Make context sharing and paid image generation clear in setup/UI.
4. Show the result and its generated instructions in the existing image workflow.

### Task 4: Verification and publication

Files: update `README.md`, `docs/QUICKSTART.md`, `manifest.json`, `package.json` and focused test/docs files as needed.

1. Run `npm test`, syntax checks and `git diff --check`.
2. Exercise actual Preact UI in a local browser harness with explicitly labeled fake service responses; verify button → LLM → reference request → visible image and cancellation/error behavior. This is not a live model-quality test.
3. Obtain independent code/security review and fix actionable findings.
4. Commit/push to the authorized GitHub fork, read back the exact remote head, and provide an installable branch/repository URL. Do not install into the user's running SillyTavern or spend generation credits without separate approval.

## Follow-up: chat More-menu shortcut

Goal: add “Illustrate current scene” beside Continue/Regenerate in SillyTavern's existing `#options .options-content`, starting the same pipeline without another Generate click.

1. Add a testable, in-memory scene-shortcut request/claim lifecycle with click-time chat ownership, duplicate prevention, timeout before the Pictures view claims it, and completion/error propagation.
2. Register a keyboard-accessible native-style menu item in `index.js`; close through ST's own options toggle and lazily open Studio for the active character. Keep existing menu actions unchanged.
3. Extend the existing character-opening path to select Pictures and hand off the request. The Pictures component auto-starts only after portrait loading and checks configuration/ownership; missing setup opens image settings instead of spending credits. Reuse cancellation, preview and gallery behavior.
4. Add unit tests and extend the real browser harness with the native menu markup, one-click success, duplicate and stale-request checks. Run full tests/syntax/diff verification, update version/docs, publish through a fork-local PR.

Acceptance: one click produces a scene illustration from the correct portrait and recent chat after initial configuration; scene can alter clothing, pose and environment while anchoring identity; no silent reference loss, avatar replacement, secret export, wrong-chat attachment or unsupported-mode fallback; tests and browser verification pass; fork contains actual installable changes.
