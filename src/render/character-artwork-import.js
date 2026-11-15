import { characterRigJointIds } from './character-assets.js';
import { characterPromptPartBlueprint } from './character-prompt-builder.js';
import { analyzeAlphaGeometry } from './character-auto-assembly.js';
import { resolveStarterAppearance } from './character-starter-library.js';

export const PNG_SIGNATURE = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);
export const RIG_ARTWORK_SIDECAR_SCHEMA_VERSION = 1;

/** Validate semantic generation notes against the active draft and actual files. Pixel geometry is intentionally excluded. */
export function validateRigArtworkSidecar(sidecar,{characterId,rigProfile='adult',parts=[],files=[]}={}){
  const errors=[];
  if(!sidecar||typeof sidecar!=='object'||Array.isArray(sidecar))throw new Error('Rig sidecar must be a JSON object.');
  if(sidecar.schema_version!==RIG_ARTWORK_SIDECAR_SCHEMA_VERSION)errors.push('Unsupported schema_version.');
  if(sidecar.kind!=='character_rig_artwork_sidecar')errors.push('kind must be character_rig_artwork_sidecar.');
  if(sidecar.character_id!==characterId)errors.push('character_id does not match the open draft.');
  if(sidecar.rig_profile!==rigProfile)errors.push('rig_profile does not match the active draft.');
  let lookConfiguration=null;if(sidecar.look_configuration!=null)try{lookConfiguration=resolveStarterAppearance(sidecar.look_configuration);}catch(error){errors.push('look_configuration is invalid: '+error.message);}
  if(!Array.isArray(sidecar.parts)||!sidecar.parts.length)errors.push('parts must be a non-empty array.');
  const active=new Map(parts.map(part=>[part.part_id,part])),fileByName=new Map(files.map(file=>[String(file.name||'').toLowerCase(),file])),seen=new Set(),normalized=[];
  for(const [index,item]of (Array.isArray(sidecar.parts)?sidecar.parts:[]).entries()){
    const path=`parts[${index}]`;
    if(!item||typeof item!=='object'||Array.isArray(item)){errors.push(`${path} must be an object.`);continue;}
    const id=String(item.part_id||'');if(!id||seen.has(id)){errors.push(`${path} has a missing or duplicate part_id.`);continue;}seen.add(id);
    const semantic=active.get(id);if(!semantic){errors.push(`${path} references unknown part_id "${id}".`);continue;}
    const joints=Array.isArray(item.joint_ids)?item.joint_ids.map(String):[];
    if(joints.length!==semantic.joint_ids.length||joints.some((joint,i)=>joint!==semantic.joint_ids[i]))errors.push(`${path} joint_ids do not match the active rig vocabulary for "${id}".`);
    const filename=String(item.file_name||'');if(!/\.png$/i.test(filename)||!fileByName.has(filename.toLowerCase()))errors.push(`${path} file_name must match one selected PNG.`);
    if(item.orientation!=null&&!['vertical','horizontal','diagonal','ambiguous','unspecified'].includes(item.orientation))errors.push(`${path} orientation is unsupported.`);
    for(const forbidden of ['anchors','proximal_anchor','distal_anchor','pivot','alpha_bounds','source_width','source_height','checksum','sha256','transform','verified','pixel_coordinates'])if(forbidden in item)errors.push(`${path}.${forbidden} is not accepted; app measures/validates this from the PNG.`);
    if(item.attachment_semantics!=null){const attach=item.attachment_semantics;if(!attach||typeof attach!=='object'||Array.isArray(attach))errors.push(`${path}.attachment_semantics must be an object.`);else if(attach.proximal_joint!==joints[0]||(joints.length>1&&attach.distal_joint!==joints[1])||(joints.length<2&&attach.distal_joint!=null))errors.push(`${path}.attachment_semantics conflicts with joint_ids.`);}
    if(filename&&fileByName.has(filename.toLowerCase()))normalized.push({part_id:id,file_name:fileByName.get(filename.toLowerCase()).name,role:String(item.role||semantic.role),joint_ids:joints,orientation:item.orientation||'unspecified',attachment_semantics:item.attachment_semantics?structuredClone(item.attachment_semantics):{proximal_joint:joints[0],...(joints[1]?{distal_joint:joints[1]}:{})},seam_notes:String(item.seam_notes||'').slice(0,500),provenance:'chatgpt_semantic_sidecar_unverified'});
  }
  if(errors.length)throw new Error('Rig sidecar validation failed: '+errors.join(' '));
  return{schema_version:RIG_ARTWORK_SIDECAR_SCHEMA_VERSION,kind:sidecar.kind,character_id:characterId,rig_profile:rigProfile,master_reference:String(sidecar.master_reference||'').slice(0,200),look_configuration:lookConfiguration,parts:normalized,provenance:'chatgpt_semantic_sidecar_unverified'};
}

/** Resolve the active draft vocabulary without changing or inferring rig joints. */
export function resolveArtworkImportParts({ manifest = null, rig = null } = {}) {
  const joints = new Set((Array.isArray(rig?.joints) ? rig.joints : []).map(joint => String(joint.id || '')));
  const source = Array.isArray(manifest?.parts) && manifest.parts.length ? manifest.parts : characterPromptPartBlueprint;
  const seen = new Set();
  return source.map((part, index) => {
    const part_id = String(part.part_id || part.id || '');
    if (!/^[a-z][a-z0-9_-]{0,127}$/.test(part_id) || seen.has(part_id)) throw new Error(`Manifest part ${index + 1} has an invalid or duplicate part ID.`);
    seen.add(part_id);
    const binding = part.binding || {};
    const joint_ids = [...new Set([binding.joint_id, binding.from_joint_id, binding.to_joint_id, part.joint_id, ...(Array.isArray(part.joint_ids) ? part.joint_ids : [])].filter(Boolean).map(String))];
    if (!joint_ids.length) throw new Error(`Part "${part_id}" has no semantic joint binding.`);
    const invalid = joint_ids.find(id => !characterRigJointIds.includes(id) || (joints.size && !joints.has(id)));
    if (invalid) throw new Error(`Part "${part_id}" uses joint "${invalid}" outside the active M1 rig.`);
    return { part_id, role: String(part.role || part.semantic_role || 'part'), joint_id: joint_ids[0], joint_ids, required: part.required !== false };
  });
}

export function matchArtworkFileToPart(fileName, parts, role = '') {
  const stem = String(fileName || '').split(/[\\/]/).pop().replace(/\.png$/i, '').toLowerCase();
  const normalizedRole = String(role).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const candidates = parts.filter(part => {
    const id = part.part_id.toLowerCase();
    return stem === id || stem === `character_${normalizedRole}_${id}_v1` || stem === `character_${id}_v1`;
  });
  if (candidates.length !== 1) throw new Error(`Cannot map "${fileName}" to one part ID. Use a part-named PNG or import it from that part row.`);
  return candidates[0].part_id;
}

export async function validateArtworkPng(file, { decode, inspectAlpha, crypto = globalThis.crypto } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Choose a PNG file to import.');
  if (file.type !== 'image/png') throw new Error('File MIME must be image/png.');
  if (!file.size) throw new Error('PNG file is empty.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 24 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('File content does not have a valid PNG signature and IHDR.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height) throw new Error('PNG dimensions are invalid.');
  let decoded;
  try {
    if (decode) decoded = await decode(file);
    else if (typeof createImageBitmap === 'function') decoded = await createImageBitmap(file);
    else throw new Error('Browser PNG decoder is unavailable.');
  } catch (error) { throw new Error(`PNG decode failed: ${error?.message || error}`); }
  try {
    const decodedWidth = Number(decoded.width ?? decoded.naturalWidth), decodedHeight = Number(decoded.height ?? decoded.naturalHeight);
    if (decodedWidth !== width || decodedHeight !== height) throw new Error('Decoded dimensions do not match PNG header.');
  let hasTransparency, geometry=null;
    if (inspectAlpha) hasTransparency = await inspectAlpha(decoded);
    else {
      const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : globalThis.document?.createElement?.('canvas');
      if (!canvas) throw new Error('Canvas alpha inspection is unavailable.');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas alpha inspection is unavailable.');
      context.clearRect(0, 0, width, height); context.drawImage(decoded, 0, 0);
      const pixels = context.getImageData(0, 0, width, height).data;geometry=analyzeAlphaGeometry({width,height,data:pixels});
      hasTransparency = false;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] < 255) { hasTransparency = true; break; }
    }
    if (!crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable.');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const sha256 = [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
    return { width, height, size: file.size, sha256, asset_id: `libsha256_${sha256}`, has_transparency: Boolean(hasTransparency), validation_state: hasTransparency ? 'validated_png' : 'imported_candidate', geometry, blob: file };
  } finally { decoded?.close?.(); }
}

/** Detach imported bytes from the browser File handle before staging for a later draft save. */
export async function snapshotArtworkBlob(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Choose an artwork file to import.');
  let bytes;
  try { bytes = await file.arrayBuffer(); }
  catch (error) { throw new Error(`Could not read ${file.name || 'the selected artwork'} while importing: ${error?.message || error}`); }
  if (!bytes?.byteLength) throw new Error('The selected artwork file is empty.');
  return new Blob([bytes], { type: file.type || 'application/octet-stream' });
}
