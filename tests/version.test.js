import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('extension manifest, package and visible Studio version agree', () => {
    const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
    const manifest = JSON.parse(read('manifest.json'));
    const pkg = JSON.parse(read('package.json'));
    assert.equal(manifest.version, pkg.version);
    const app = read('src/ui/app.js');
    assert.ok(app.includes(`title="Creative Studio ${manifest.version}"`));
    assert.ok(app.includes(`class="cs-muted">${manifest.version}</small>`));
});
