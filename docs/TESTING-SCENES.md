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

`tests/chat-scene*.test.js` additionally cover live/saved images, HTML/Markdown/legacy formats, message identity/swipes, stale edits, concurrent jobs, provider-preparation races and persistence failures. `tests/storage.test.js` covers non-activating background saves and revision rejection. Existing `tests/st-pull.test.js` and legacy handoff lifecycle tests retain import-concurrency/ownership coverage. Review regressions cover remote appended turns, non-target edits/metadata changes, and failed strict project-revision GETs causing zero uploads.

## Public API smoke check (no key, no generation charges)

The real adapter's `nanoModels()` and `nanoModelMetadata(id)` functions can be called against NanoGPT to confirm public discovery, model-specific reference support and supported resolutions. Catalog aliases and endpoint availability can differ; manual IDs are supported but validated through endpoint metadata before generation.

## Optional live acceptance test (spends credits)

In an actual SillyTavern 1.19+ instance, install only this fork, open a one-character chat and bring that character into Studio. Configure a NanoGPT key and a reference-editing model, then request a scene with an explicit outfit/location/pose change. Check the result visually against the original and inspect the generated instructions. Confirm the original avatar remains selected. Repeat only as needed: generation is paid and no model guarantees exact identity/style retention.

Do not claim the fixture suite is a live account, entitlement, latency, billing or visual-quality test. This fork does not install itself into a running SillyTavern or change server key-exposure settings.
