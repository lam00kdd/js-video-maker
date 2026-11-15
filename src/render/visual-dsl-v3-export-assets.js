import { collectVisualDslV3AssetReferences } from '../visual-dsl-v3.js';
import { validateManifest } from './visual-asset-registry.js';
import { validateVisualAssetSpatialMetadata } from './visual-asset-catalog.js';
import { resolveVisualDslV3Anchors, visualAnchorMetadataFingerprint } from './visual-dsl-v3-anchors.js';

const assetPattern = /visual_[a-f0-9]{64}/;

export function selectVisualDslV3AssetReferences(document, variants = null) {
  const allowed = variants ? new Set(variants) : null;
  return collectVisualDslV3AssetReferences(document).filter(reference => !allowed || reference.references.some(owner => owner.kind === 'symbol' || allowed.has(owner.variant)));
}

function referenceLabel(reference) {
  return reference.references.map(owner => owner.kind === 'scene'
    ? `${owner.variant} scene ${owner.scene_id} (node ${owner.node_id})`
    : `symbol ${owner.symbol_id} (node ${owner.node_id})`).join(', ');
}

export async function prepareVisualDslV3ExportAssets(document, registry, { variants = null } = {}) {
  const references = selectVisualDslV3AssetReferences(document, variants);
  if (!references.length) return { resources: new Map(), spatialMetadata:new Map(), references, dispose() {} };
  try {
    const prepared = await registry.prepareAssetResources(references.map(item => item.asset_id).sort());
    for (const reference of references) if (!prepared.resources.has(reference.asset_id)) throw new Error(`Prepared image resource is missing ${reference.asset_id}.`);
    const sceneEntries=document.aspect_ratio==='both'?['landscape','portrait'].filter(name=>!variants||variants.includes(name)).flatMap(name=>(document.variants[name].scenes||[]).map(scene=>({variant:name,scene}))):[{variant:document.aspect_ratio==='9:16'?'portrait':'landscape',scene:(document.scenes||[])}].flatMap(({variant,scene})=>scene.map(item=>({variant,scene:item})));
    const spatialMetadata=new Map(),hasAnchors=[...(document.symbols?Object.values(document.symbols).map(item=>item.root):[]),...sceneEntries.map(item=>item.scene.root)].some(root=>{let found=false;function scan(node){if(node?.type==='anchor_annotation')found=true;node?.children?.forEach(scan);}scan(root);return found;});
    if(hasAnchors)for(const reference of references){if(typeof registry.getAssetMetadata!=='function')throw new Error('Registry metadata lookup is required to preflight anchor annotations.');const metadata=await registry.getAssetMetadata(reference.asset_id);if(!metadata)throw new Error(`Missing asset metadata ${reference.asset_id}.`);if(metadata.semantic_metadata?.spatial_metadata){spatialMetadata.set(reference.asset_id,validateVisualAssetSpatialMetadata(metadata.semantic_metadata.spatial_metadata));}}
    for(const {variant,scene} of sceneEntries){const annotations=[];function visit(node){if(node?.type==='anchor_annotation')annotations.push(node);node?.children?.forEach(visit);}visit(scene.root);if(!annotations.length)continue;
      const instances=resolveVisualDslV3Anchors(scene,{symbols:document.symbols||{},spatialMetadata,resources:prepared.resources});
      for(const annotation of annotations){const target=annotation.geometry.target,key=`${(target.instance_path||[]).join('/')}|${target.image_node_id}|${target.anchor_id}`,matches=instances.filter(item=>item.key===key),context=`${variant} scene ${scene.id}, annotation ${annotation.id}, image ${target.image_node_id}, anchor ${target.anchor_id}`;if(matches.length!==1)throw Object.assign(new Error(`V3_ANCHOR_PREFLIGHT_FAILED: ${context}: ${matches.length?'ambiguous instance':'unknown image instance or anchor'}.`),{code:'anchor_reference_invalid'});const item=matches[0];if(item.reason==='anchor_cropped')throw Object.assign(new Error(`V3_ANCHOR_PREFLIGHT_FAILED: ${context}: point is cropped out.`),{code:'anchor_cropped'});const meta=spatialMetadata.get(item.asset_id);if(target.metadata_fingerprint&&target.metadata_fingerprint!==visualAnchorMetadataFingerprint(meta))throw Object.assign(new Error(`V3_ANCHOR_PREFLIGHT_FAILED: ${context}: spatial metadata fingerprint mismatch; expected ${target.metadata_fingerprint}, current ${visualAnchorMetadataFingerprint(meta)}.`),{code:'anchor_metadata_mismatch'});}
    }
    return { ...prepared, spatialMetadata, references };
  } catch (error) {
    const match = String(error.message || error).match(assetPattern), failedId = match?.[0];
    const affected = references.filter(item => !failedId || item.asset_id === failedId);
    const detail = affected.map(item => `${item.asset_id} referenced by ${referenceLabel(item)}`).join('; ');
    const wrapped = new Error(`V3_ASSET_PREFLIGHT_FAILED: ${error.message || error}${detail ? ` · ${detail}` : ''}. Import the exact companion asset package or register the matching image in Visual Asset Manager.`);
    wrapped.cause = error; wrapped.code = error.code || 'asset_preflight_failed'; wrapped.assetReferences = affected;
    throw wrapped;
  }
}

export async function importVisualDslV3PackageAssets(directory, document, registry, { variants = null } = {}) {
  const references = selectVisualDslV3AssetReferences(document, variants);
  if (!references.length) return { imported: 0, skipped_existing: 0, asset_ids: [] };
  const manifestHandle = await directory.getFileHandle('manifest.json');
  let manifest;
  try { manifest = JSON.parse(await (await manifestHandle.getFile()).text()); }
  catch (error) { throw new Error(`Asset package manifest.json không đọc được: ${error.message}`); }
  validateManifest(manifest);
  const required = new Set(references.map(reference => reference.asset_id));
  const assets = manifest.assets.filter(item => required.has(item.asset_id));
  for(const item of assets){const packaged=item.semantic_metadata?.spatial_metadata;if(!packaged)continue;validateVisualAssetSpatialMetadata(packaged);const local=await registry.getAssetMetadata(item.asset_id),existing=local?.semantic_metadata?.spatial_metadata;if(existing&&visualAnchorMetadataFingerprint(existing)!==visualAnchorMetadataFingerprint(packaged))throw Object.assign(new Error(`V3_ANCHOR_PACKAGE_CONFLICT: ${item.asset_id} has different local spatial metadata. Existing registry metadata is preserved; reconcile anchors explicitly before rendering.`),{code:'anchor_metadata_conflict'});}
  if (!assets.length) return { imported: 0, skipped_existing: 0, asset_ids: [], package_missing_ids: [...required] };
  const subset = { ...manifest, assets };
  return registry.importAssetPackage(subset, async path => {
    const [folder, filename] = String(path).split('/');
    if (folder !== 'assets' || !filename || String(path).includes('..') || String(path).includes('\\')) throw new Error(`Đường dẫn package không an toàn: ${path}`);
    return (await (await directory.getDirectoryHandle(folder)).getFileHandle(filename)).getFile();
  });
}
