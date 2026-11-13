# Persistent Opening Illustrations Implementation Plan

> **For Hermes:** Implement directly task-by-task with independent spec/quality review before publishing; the user prefers parent edits over coding-agent delegation.

**Goal:** Generate and manage reusable illustrations for a character's first message and alternate greetings, including native card application and bundled CHARX round-trips.

**Architecture:** Keep editable greeting text clean, with versioned illustration metadata in `data.extensions.creative_studio.openingIllustrations`. Pure helpers reconcile alternate slots across edits/reorders, render/remove only managed Markdown blocks and resolve character-owned image media. A separate no-live-chat orchestration reuses the structured scene task, reference portrait, NanoGPT editing adapter and user-POV rule with prepayment/attachment ownership checks. Apply/export renders images into greeting text, while imports normalize/relink managed metadata; existing chat copies are never rewritten.

**Tech Stack:** No-build ES modules/Preact/HTM, existing ST file APIs and normalized NanoGPT Image API, Node test runner and real-browser service fixtures.

---

### Task 1: Pure domain and lifecycle

Files: create `src/core/opening-illustrations.js`, `tests/opening-illustrations.test.js`; modify `src/core/project.js`, `src/ui/areas/media.js`.

- Write failing tests for first/alternate metadata, exact-text reorder matching, stale detection, remove/undo/media cleanup and managed-block idempotence.
- Implement versioned metadata containing stable illustration IDs, generated text/portrait anchors, image media ID/URL and generation provenance, without image bytes or credentials.
- Reconcile in the common character upsert/edit path so manual edits, AI proposals and pipeline greeting updates agree. Carry explicit row identities on moves/deletions (including duplicate texts), retain positional identity on ordinary text edits and use exact-text matching for inferred reorder/import changes.
- Render native Markdown only on outgoing cards; validate image URLs/asset paths and preserve unrelated hand-written Markdown/HTML.
- Run `node --test tests/opening-illustrations.test.js tests/deletion.test.js` and the full suite.

### Task 2: Chat-free generation

Files: create `src/st/opening-illustration.js`, `tests/opening-illustration.test.js`; use `src/ai/tasks.js`, `src/st/nanogpt.js` and shared `SCENE_POV_RULE`.

- Test successful selected-opening context without active chat, first/alternate separation, required portrait, same/project/character/slot/reference ownership after waits and immediately before payment/attachment.
- Test cancellation, provider failure, replacing/removing while in flight, exact prompt/provenance and no automatic paid retry.
- Do not use the chat-bound `captureScene`. Bound card/opening data, treat it as untrusted reference material, apply existing content policy and user POV.
- Save media with `saveMedia`, then atomically link image and metadata as one undo step without changing the avatar.

### Task 3: Editor controls

Files: create `src/ui/opening-illustrations.js`; modify `src/ui/areas/characters.js`.

- Put Generate/Replace/Remove, preview, stale indicator, error/status and cancellation controls alongside first and alternate greetings. Group-only greetings remain out of scope.
- Preserve existing first-message AI controls and alternate greeting editing/proposals. No automatic generation on edit/open/save/import.
- Add a focused browser harness that mounts the actual character editor; verify choosing an alternate targets only that alternate, text edits remain intact, no avatar changes, stale warnings, replace/remove and cancellation.

### Task 4: Apply/export/import

Files: `src/core/cardio.js`, `src/core/project.js` (`cardForSt`), `src/ui/areas/characters.js` (Publish), `src/ui/areas/project.js`, `src/ui/importer.js`, `src/ui/st-pull.js`; new shared asset helper if needed.

- Render permanent native greeting image references on both character and project apply/create routes.
- Bundle opening image bytes as declared CHARX assets; use safe stable asset names and do not embed base64 into greeting prompts.
- Relink on extension import and normalize managed markup back to clean editable text. Preserve stale associations, metadata and unknown third-party fields.
- Inspect ST native CHARX importer before selecting exported greeting references. Test import/apply with colliding/renamed characters and explicitly document any client interoperability limitation rather than claiming universal support.
- Add round-trip tests for first + alternate images, no old-server URLs, missing/corrupt assets, idempotent re-export, generic existing assets and expressions.

### Task 5: Verification and release

- Baseline: 298 tests / 297 pass / 1 existing skip.
- Run complete unit suite, all JS syntax and diff checks.
- Browser service fixtures: actual editor generate/replace/remove, no-chat behavior, apply/new-chat greeting display, CHARX export/import across isolated project/media IDs, missing references, cancellation and no extra image requests on save/reopen.
- Regress existing chat More, first portraits, user POV and persistent keys. No paid generation or live deployment writes.
- Independent read-only review; fix findings and rerun affected checks.
- Update docs and consistent SemVer version; publish fork-local PR, verify exact merge/default manifest and rerun post-merge tests.
