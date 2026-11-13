# Scene illustration verification

## Automated suite

Use a current Node.js release (verified with Node 24):

```sh
npm test
node --test tests/scene.test.js tests/scene-illustration.test.js tests/nanogpt.test.js
```

The tests exercise scene ownership/context bounds, LLM contracts, original-portrait input, avatar preservation, cancellation, stale results, provider capabilities/resolutions, credentials and response validation. Network tests use explicit fixtures, not live paid requests.

## Browser integration harness

No install or build is needed:

```sh
npm run test:browser:serve
```

Open `http://127.0.0.1:8769/tests/browser/scene.html`, then run in the browser console:

```js
await window.runSceneTests()
```

The harness mounts the **actual Preact Pictures component**, structured LLM gateway, NanoGPT adapter, canvas reference encoder and gallery persistence path. Only SillyTavern context/storage and external service responses are test fixtures. It verifies:

- One click calls the text model, includes the portrait in `input_references`, and displays the saved output.
- Re-encoding strips embedded character-card metadata.
- The original avatar is unchanged and no API key is persisted in settings or the project.
- Provider failure has no text-to-image fallback or saved success.
- Cancelling during the text stage prevents an image request.
- Live-chat events do not abort an unrelated ComfyUI expression job; scene and expression controllers are independent.

The displayed reference/output are visibly labeled synthetic test images. They are **not** evidence of NanoGPT image quality. No credentials or external image requests are used by the harness. Bind the test server only to localhost; stop it when finished. `PORT` overrides the default port.

## Headless More-menu browser scenarios

Reload the same harness before each call:

```js
await window.runMoreMenuTests({scenario: 'existing'})
// Other scenarios, each after reloading:
// absent, elsewhere, already-image, missing-key, provider-error, save-error
```

These import the real extension entrypoint, headless runtime, scene pipeline, LLM gateway, NanoGPT adapter and canvas encoder. ST context/rendering, native chat endpoints, file storage and external provider responses are explicit fixtures. Tests assert that no Studio root is created, no project is activated, the correct character is imported only if absent, and exactly one generated image is attached to the latest character reply even when a later user message exists. The native media attachment is read back from the saved chat. Repeated clicks/keyboard activation after embedding do not call either model. An existing image blocks all model work. Missing configuration, provider errors and swallowed native save failures never report false success or trigger automatic paid retries.

`tests/chat-scene*.test.js` cover live/saved duplicate images, inline/legacy formats, message identity/swipes, changed visible dialogue, concurrent jobs, provider-preparation races and persistence failures. `tests/chat-bookkeeping.test.js` reproduces native integrity/cache differences within a single tab and verifies they no longer block. Whole-chat/metadata conflict equality was intentionally removed at user request. Strict background project revision GET-failure/zero-upload protections remain separately tested.

## Persistent browser key verification

Use the same harness with a full page reload between phases:

```js
await window.runBrowserKeyTests({phase:'save'})
// Reload:
await window.runBrowserKeyTests({phase:'restore'})
await window.runMoreMenuTests({scenario:'saved-key'})
// Reload:
await window.runBrowserKeyTests({phase:'forget'})
// Reload:
await window.runBrowserKeyTests({phase:'forgotten'})
```

The key is an explicit fixture value, not a real credential. The account metadata fixture deliberately refuses writes; `/api/users/me` supplies the stable account identity across reloads. This covers closing/reloading before any native debounced settings save. These exercise the actual NanoGPT setup UI, reload restoration, provider readiness/use without a session key, and removal surviving another reload. `scenario:'bookkeeping'` exercises generation with local integrity/token fields absent from disk. Node key-store tests additionally cover account isolation, no raw key in server/account/extension metadata, and storage failure reporting.

Scene-composition regressions verify first-person user POV in the default/overridden LLM prompt and the final outgoing image instruction, exclusion of the user/body/reflections/shadows, conflicting staging, exact persisted prompt and provider-length bounds. Browser payload checks cover both the headless More action and the Pictures preview. Fixtures cannot establish visual compliance by a live image model.

## First portraits, reference edits and the regular creation pipeline

The same local harness exposes `await window.runPortraitTests({scenario:"dual"})`. Open the fixture tab in the foreground to avoid background timer/animation throttling. Run each scenario after a fresh navigation: `dual`, `text-only`, `provider-error`, `missing-reference`, `pipeline`, `pipeline-provider-error`, `pipeline-save-error`.

These exercise the actual Pictures button and actual `runPipeline`/`makeRunTask` path: first portrait without `input_references`, persistence and automatic avatar selection; next picture with the chosen portrait; explicit reference opt-out; text-only model discovery and unsupported edit refusal; missing selected references; provider/save errors with zero automatic paid retries. The portrait fixture explicitly uses an SFW project and verifies that both reference-enabled and opt-out requests include the saved exclusions and content rating. Ordinary portraits do not inherit scene POV constraints or SDXL photographic negatives. Submitted prompt provenance is exact. Tests await the fixture-host-ready signal before changing store state.

Unit coverage includes `tests/nanogpt-paint.test.js`, configuration readiness/automatic art steps, separate explicit text/edit provider entrypoints, reference preservation, cancellation/ownership guards, no retries, and model-specific prompt limits in UTF-16/code-point units.

## Persistent opening illustrations

After a fresh harness navigation, in a foreground tab:

```js
await window.runOpeningEditorTests()
await window.runOpeningPortabilityTests()
await window.runOpeningCorruptionTests()
```

The actual Openings/Publish Preact components generate without an active chat, target first/alternate text independently, preserve the avatar, preview the image and exercise stale status, replacement/removal, undo and cancellation. Duplicate-text row edits/moves/removals are tested through the real controls. Export downloads a real CHARX containing the PNG files; an isolated Studio project reimports it with new local image identities. Actual review/apply and create-card clients are exercised against explicitly labeled native ST persistence fixtures. Encoded native-destination image URLs are loaded by the browser after an **extraction fixture** materializes them. Publishing/importing/creating must make no image requests.

The native persistence fixture mirrors ST’s actual recursive deep merge and unset-sentinel processing, including partial illustration removal and retaining the captured live backup when a post-write readback request throws. Real Chromium raster tests reject a valid-CRC PNG with an invalid IDAT stream through CHARX import, local PNG fallback and native apply preflight; Node tests explicitly stub the raster decoder. Greeting trailing newlines and repeated render/normalize idempotence are separate unit regressions.

These are not an end-to-end deployment of the native ST server or renderer. Native extraction compatibility is additionally checked against ST 1.19 source behavior. Unit tests cover content-addressed paths/SHA-256, CRC/PNG/dimension limits, bounded ZIP expansion, duplicate bundle names, same-origin streamed image reads, missing/corrupt assets, metadata normalization, row identity, media deletion, ownership races and native readback/backup failures. Run `node --test tests/opening-*.test.js` plus the complete suite.

Optional uncharged manual deployment acceptance: import the exported CHARX using **native ST character import**, start a new chat and swipe each illustrated greeting; confirm that pictures load, including two cards with the same name and a renamed card. Re-export/reimport through Studio without calling either model. No existing historical chat copies should change. Live visual-quality evaluation remains a separate paid action requiring authorization.

## Public API smoke check (no key, no generation charges)

The real adapter's `nanoModels()` and `nanoModelMetadata(id)` functions can be called against NanoGPT to confirm public discovery, model-specific reference support and supported resolutions. Catalog aliases and endpoint availability can differ; manual IDs are supported but validated through endpoint metadata before generation.

## Optional live acceptance test (spends credits)

In an actual SillyTavern 1.19+ instance, install only this fork, open a one-character chat and bring that character into Studio. Configure a NanoGPT key and a reference-editing model, then request a scene with an explicit outfit/location/pose change. Check the result visually against the original and inspect the generated instructions. Confirm the original avatar remains selected. Repeat only as needed: generation is paid and no model guarantees exact identity/style retention.

Do not claim the fixture suite is a live account, entitlement, latency, billing or visual-quality test. This fork does not install itself into a running SillyTavern or change server key-exposure settings.
