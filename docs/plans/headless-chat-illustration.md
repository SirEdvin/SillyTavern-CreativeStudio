# Headless chat illustration correction

The earlier menu shortcut's UI-opening behavior is superseded by this contract:

- More → Illustrate current scene never mounts or navigates Studio.
- Reuse the ST character's existing project, or create a background project and import once if absent.
- Use its selected/original portrait plus bounded scene context and the existing LLM/reference-edit pipeline.
- Attach a native image to the latest visible character reply, not a later user/system message or a new message.
- Refuse if the target already contains an image; cover native/legacy/inline representations and saved other-tab state.
- Bind chat/message object/index/text/swipe at click, guard before paid submission and attachment; never retarget changed replies.
- Save and read back the exact chat attachment before success. Preserve the gallery output and visible attachment on failed persistence verification so retrying cannot spend again.
- 1.3.3 user correction: remove whole-chat/metadata equality that caused false conflicts on native bookkeeping. Keep source ownership and already-image checks. Save NanoGPT keys by default in browser-local, account-namespaced storage, never in server account metadata or exports.
- Do not switch the current project or update lastOpen from background saves; reject stale project revisions and serialize shared foreground/background index saves.

Implementation: `src/st/chat-scene-target.js`, `src/st/chat-scene.js`, shared `studio-runtime.js`; menu/index route into that headless pipeline. The separate Pictures preview remains gallery-only. Legacy UI handoff internals remain available for existing internal callers but are not used by the native More action.

Verification: target/pipeline/storage unit regressions; actual-entrypoint browser cases for existing, absent, elsewhere, already-image, missing-key, provider-error and save-error. All external services, native chat persistence and rendering in the harness are labeled fixtures; no paid generation or deployed-server modifications.
