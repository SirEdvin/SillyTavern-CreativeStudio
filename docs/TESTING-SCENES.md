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

## Public API smoke check (no key, no generation charges)

The real adapter's `nanoModels()` and `nanoModelMetadata(id)` functions can be called against NanoGPT to confirm public discovery, model-specific reference support and supported resolutions. Catalog aliases and endpoint availability can differ; manual IDs are supported but validated through endpoint metadata before generation.

## Optional live acceptance test (spends credits)

In an actual SillyTavern 1.19+ instance, install only this fork, open a one-character chat and bring that character into Studio. Configure a NanoGPT key and a reference-editing model, then request a scene with an explicit outfit/location/pose change. Check the result visually against the original and inspect the generated instructions. Confirm the original avatar remains selected. Repeat only as needed: generation is paid and no model guarantees exact identity/style retention.

Do not claim the fixture suite is a live account, entitlement, latency, billing or visual-quality test. This fork does not install itself into a running SillyTavern or change server key-exposure settings.
