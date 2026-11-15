import test from 'node:test';
import assert from 'node:assert/strict';
import { importVisualDslV3PackageAssets, prepareVisualDslV3ExportAssets, selectVisualDslV3AssetReferences } from '../src/render/visual-dsl-v3-export-assets.js';

const a = 'visual_' + 'a'.repeat(64), b = 'visual_' + 'b'.repeat(64);
const image = (id, assetId) => ({ id, type: 'image', geometry: { asset_id: assetId, x: 0, y: 0, width: 100, height: 80, fit: 'contain' } });
function documentFixture() {
  const scene = (id, variant, assetId) => ({ id, title: id, variant, root: { id: `${id}-root`, type: 'group', children: [image(`${id}-image`, assetId)] } });
  return { aspect_ratio: 'both', symbols: { shared: { root: { id: 'symbol-root', type: 'group', children: [image('symbol-image', b)] } } }, variants: { landscape: { scenes: [scene('wide', 'landscape', a)] }, portrait: { scenes: [scene('tall', 'portrait', a)] } } };
}

test('asset reference selection deduplicates nested scene and symbol IDs and supports per-aspect preflight', () => {
  const document = documentFixture(), all = selectVisualDslV3AssetReferences(document);
  assert.deepEqual(all.map(item => item.asset_id).sort(), [a, b]);
  assert.equal(all.find(item => item.asset_id === a).references.length, 2);
  assert.deepEqual(selectVisualDslV3AssetReferences(document, ['landscape']).map(item => item.asset_id).sort(), [a, b]);
  assert.deepEqual(selectVisualDslV3AssetReferences(document, ['portrait']).map(item => item.asset_id).sort(), [a, b]);
});

test('export asset preflight prepares once, returns stable resources and disposes on owner request', async () => {
  const calls = [], closed = [], resources = new Map([[a, { close: () => closed.push(a) }], [b, { close: () => closed.push(b) }]]);
  const registry = { async prepareAssetResources(ids) { calls.push(ids); return { resources, dispose() { for (const [id, value] of resources) { value.close(); resources.delete(id); } } }; } };
  const prepared = await prepareVisualDslV3ExportAssets(documentFixture(), registry);
  assert.deepEqual(calls, [[a, b]]); assert.equal(prepared.resources.size, 2); prepared.dispose(); assert.deepEqual(closed.sort(), [a, b]);
});

test('missing export assets fail preflight with asset ID, scene and node references', async () => {
  const registry = { async prepareAssetResources() { throw Object.assign(new Error(`Không tìm thấy asset ${a}.`), { code: 'asset_missing' }); } };
  await assert.rejects(prepareVisualDslV3ExportAssets(documentFixture(), registry, { variants: ['landscape'] }), error => error.code === 'asset_missing' && error.message.includes(a) && error.message.includes('wide') && error.message.includes('wide-image'));
});

test('portable package import validates manifest and reads only required hash-addressed asset paths', async () => {
  const bytes = new Blob(['fixture']), entry = { asset_id: a, sha256: 'a'.repeat(64), mime_type: 'image/png', width: 1, height: 1, byte_size: 1, display_name: 'asset.png', category: '', subject: '', provenance: '', license_notes: '', imported_at: '2026-01-01T00:00:00.000Z', path: `assets/${'a'.repeat(64)}.png` };
  const manifest = { format: 'lam-visual-asset-package', version: 1, created_at: '2026-01-01T00:00:00.000Z', assets: [entry, { ...entry, asset_id: b, sha256: 'b'.repeat(64), path: `assets/${'b'.repeat(64)}.png` }] };
  const directory = { async getFileHandle(name) { assert.equal(name, 'manifest.json'); return { async getFile() { return new Blob([JSON.stringify(manifest)]); } }; }, async getDirectoryHandle(name) { assert.equal(name, 'assets'); return { async getFileHandle(name) { assert.equal(name, entry.path.split('/')[1]); return { async getFile() { return bytes; } }; } }; } };
  const registry = { async importAssetPackage(subset, getFile) { assert.deepEqual(subset.assets.map(item => item.asset_id), [a]); assert.equal(await (await getFile(entry.path)).size, bytes.size); return { imported: 1, skipped_existing: 0, asset_ids: [a] }; } };
  const document = { aspect_ratio: '16:9', symbols: {}, scenes: [{ id: 'scene', root: { id: 'root', type: 'group', children: [image('node', a)] } }] };
  const result = await importVisualDslV3PackageAssets(directory, document, registry);
  assert.deepEqual(result.asset_ids, [a]);
});
