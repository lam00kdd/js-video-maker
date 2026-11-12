const RIGGED_MOTIONS = new Set(['idle', 'breathe', 'blink']);
const VERSION = /^\d+\.\d+\.\d+$/;
const CHECKSUM = /^[a-f0-9]{64}$/;
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));

/** Convert a checksum-verified immutable Library version into prompt-safe capabilities. */
export function adaptPublishedCharacterCapabilities(identity, versionRecord) {
  if (!identity || !versionRecord || identity.character_id !== versionRecord.character_id) throw new Error('Published Character identity and version do not match.');
  const character_type = identity.character_type;
  if (!['sprite', 'rigged'].includes(character_type) || (versionRecord.character_type && versionRecord.character_type !== character_type)) throw new Error('Published Character type does not match its version.');
  if (!VERSION.test(String(versionRecord.version || '')) || !CHECKSUM.test(String(versionRecord.content_checksum || ''))) throw new Error('Published Character version or checksum is invalid.');
  if (versionRecord.validation_status !== 'validated' || versionRecord.diagnostics?.some(item => item.severity === 'error')) throw new Error('Published Character version is not validated or has asset integrity errors.');
  if (character_type === 'sprite') {
    const snapshot = versionRecord.sprite_snapshot;
    if (snapshot?.schema_version !== 1 || snapshot.character_id !== identity.character_id || snapshot.version !== versionRecord.version) throw new Error('Published Sprite snapshot is missing or does not match the selected version.');
    const poses = (snapshot.poses || []).map(pose => ({ pose_id: pose.pose_id, label: pose.label || pose.pose_id }));
    const clips = (snapshot.clips || []).map(clip => ({ clip_id: clip.clip_id, label: clip.label || clip.clip_id, fps: clip.fps, frame_count: clip.frame_count, duration_seconds: clip.frames.reduce((sum, frame) => sum + (frame.duration_seconds ?? 1 / clip.fps), 0) }));
    if (!poses.length) throw new Error('Published Sprite version has no verified poses.');
    return { character_id: identity.character_id, character_type, published_version: versionRecord.version, published_checksum: versionRecord.content_checksum, display_name: identity.display_name, available_poses: poses, available_clips: clips, available_actions: [], available_motions: [], default_pose_id: snapshot.default_pose_id, default_action: null, motion_style: null };
  }
  const features = [...new Set((versionRecord.compatible_motion_features || []).filter(motion => RIGGED_MOTIONS.has(motion)))];
  if (!versionRecord.rig || !versionRecord.manifest) throw new Error('Published Rigged version is missing its verified rig or manifest.');
  return { character_id: identity.character_id, character_type, published_version: versionRecord.version, published_checksum: versionRecord.content_checksum, display_name: identity.display_name, available_poses: [], available_clips: [], available_actions: features, available_motions: features, default_pose_id: null, default_action: features.includes('idle') ? 'idle' : features[0] || null, motion_style: versionRecord.motion_style || 'natural' };
}

/** Read only immutable published versions. Draft records are never queried. */
export async function loadPublishedPromptCharacters(storage) {
  const capabilities = [], diagnostics = [], sourceErrors = [], unpublished = [];
  if (typeof storage.listPublishedCharacterVersions === 'function') {
    let entries = [];
    try { entries = await storage.listPublishedCharacterVersions(); }
    catch (error) { sourceErrors.push({ source: 'sqlite_published_catalog', message: error.message || String(error) }); }
    for (const { identity, version: summary } of entries) {
      try {
        const record = await storage.getCharacterVersion(identity.character_id, summary.version);
        if (!record) throw new Error(`Published version ${summary.version} is unavailable.`);
        if (record.diagnostics?.length) throw new Error(record.diagnostics.map(item => item.message).join(' '));
        capabilities.push(adaptPublishedCharacterCapabilities(identity, record));
      } catch (error) {
        diagnostics.push({ character_id: identity.character_id, character_type: identity.character_type, version: summary.version, message: error.message || String(error) });
      }
    }
    capabilities.sort((a, b) => a.display_name.localeCompare(b.display_name) || a.character_id.localeCompare(b.character_id) || a.published_version.localeCompare(b.published_version, undefined, { numeric: true }));
    return { capabilities, diagnostics, sourceErrors, unpublished };
  }
  let identities = [];
  try { identities = await storage.listCharacters(); }
  catch (error) { sourceErrors.push({ source: 'characters', message: error.message || String(error) }); }
  const identityById = new Map(identities.map(identity => [identity.character_id, identity]));

  // Follow the same version-store index as Video Studio's working Sprite selector.
  // The identity.published_versions array is only a convenience index and may be stale.
  let spriteVersions = [];
  try { spriteVersions = await storage.listPublishedSpriteVersions(); }
  catch (error) { sourceErrors.push({ source: 'sprite_versions', message: error.message || String(error) }); }
  for (const summary of spriteVersions) {
    const identity = identityById.get(summary.character_id);
    if (identity && identity.character_type !== 'sprite') {
      diagnostics.push({ character_id: summary.character_id, character_type: 'sprite', version: summary.version, message: 'Published Sprite index points to a non-Sprite Character identity.' });
      continue;
    }
    const selectedIdentity = { ...(identity || {}), character_id: summary.character_id, character_type: 'sprite', display_name: summary.display_name || identity?.display_name || summary.character_id };
    try {
      const resolved = await storage.resolvePublishedSpriteCharacter(summary.character_id, summary.version);
      if (resolved.status !== 'resolved') throw new Error(resolved.diagnostics?.map(item => item.message).join(' ') || `Published version ${summary.version} is unavailable.`);
      const record = { ...resolved, character_type: 'sprite', sprite_snapshot: resolved.snapshot, validation_status: 'validated', diagnostics: [] };
      if (record.version !== summary.version || record.character_id !== summary.character_id) throw new Error('Resolved Published Character does not match the selected immutable ID/version.');
      capabilities.push(adaptPublishedCharacterCapabilities(selectedIdentity, record));
    } catch (error) {
      diagnostics.push({ character_id: summary.character_id, character_type: 'sprite', version: summary.version, message: error.message || String(error) });
    }
  }

  const spriteVersionKeys = new Set(spriteVersions.map(item => item.character_id + '@' + item.version));
  for (const identity of identities.filter(item => item.character_type === 'sprite')) {
    const unindexed = (identity.published_versions || []).filter(version => !spriteVersionKeys.has(identity.character_id + '@' + version));
    for (const version of unindexed) {
      // Recover a valid immutable record if the convenience listPublishedSpriteVersions
      // index omitted it. The exact version record remains the authority; drafts are never read.
      try {
        const resolved = await storage.resolvePublishedSpriteCharacter(identity.character_id, version);
        if (resolved.status !== 'resolved') throw new Error(resolved.diagnostics?.map(item => item.message).join(' ') || `Published version ${version} is unavailable.`);
        const record = { ...resolved, character_type: 'sprite', sprite_snapshot: resolved.snapshot, validation_status: 'validated', diagnostics: [] };
        if (record.version !== version || record.character_id !== identity.character_id) throw new Error('Resolved Published Character does not match the selected immutable ID/version.');
        capabilities.push(adaptPublishedCharacterCapabilities(identity, record));
      } catch (error) {
        diagnostics.push({ character_id: identity.character_id, character_type: 'sprite', version, message: error.message || String(error) });
      }
    }
    if (!(identity.published_versions || []).length && !spriteVersions.some(item => item.character_id === identity.character_id)) {
      unpublished.push({ character_id: identity.character_id, character_type: 'sprite', display_name: identity.display_name || identity.character_id });
    }
  }

  // Rigged publication currently exposes its immutable version list on the identity record.
  for (const identity of identities.filter(item => item.character_type === 'rigged')) {
    for (const version of identity.published_versions || []) {
      try {
        const record = await storage.getCharacterVersion(identity.character_id, version);
        if (!record) throw new Error(`Published version ${version} is unavailable.`);
        if (record.version !== version || record.character_id !== identity.character_id) throw new Error('Resolved Published Character does not match the selected immutable ID/version.');
        capabilities.push(adaptPublishedCharacterCapabilities(identity, record));
      } catch (error) {
        diagnostics.push({ character_id: identity.character_id, character_type: 'rigged', version, message: error.message || String(error) });
      }
    }
  }
  capabilities.sort((a, b) => a.display_name.localeCompare(b.display_name) || a.character_id.localeCompare(b.character_id) || a.published_version.localeCompare(b.published_version, undefined, { numeric: true }));
  return { capabilities, diagnostics, sourceErrors, unpublished };
}

export function filterPublishedPromptCharacters(capabilities, type = 'all') {
  if (!['all', 'sprite', 'rigged'].includes(type)) throw new Error('Character type filter must be all, sprite or rigged.');
  return (capabilities || []).filter(item => type === 'all' || item.character_type === type);
}

export function describePublishedPromptCatalog({ catalog = null, type = 'all', loading = false } = {}) {
  if (loading) return { state: 'loading', retry: false, message: 'Loading Published Characters and verifying immutable versions…' };
  const capabilities = catalog?.capabilities || [], diagnostics = catalog?.diagnostics || [], sourceErrors = catalog?.sourceErrors || [], unpublished = catalog?.unpublished || [];
  if (sourceErrors.length) return { state: 'access_error', retry: true, message: 'Character Library access error: ' + sourceErrors.map(item => item.message).join(' · ') };
  const matchingDiagnostics = diagnostics.filter(item => !item.character_type || type === 'all' || item.character_type === type);
  if (!filterPublishedPromptCharacters(capabilities, type).length && matchingDiagnostics.length) return { state: 'validation_error', retry: true, message: 'Published manifest validation error: ' + matchingDiagnostics[0].message };
  const matchingUnpublished = unpublished.filter(item => type === 'all' || item.character_type === type);
  if (!filterPublishedPromptCharacters(capabilities, type).length && matchingUnpublished.length) return { state: 'needs_publish', retry: false, message: 'These Sprite Characters exist in Character Library but have no published version yet: ' + matchingUnpublished.map(item => item.display_name).join(', ') + '. Approve and publish them in Character Studio to make them selectable.' };
  if (!capabilities.length) return { state: 'empty', retry: false, message: 'No Published Characters are in the shared SQLite catalog yet. Use the Character Library migration tool in the browser profile that contains the existing Published Characters.' };
  if (!filterPublishedPromptCharacters(capabilities, type).length) return { state: 'no_match', retry: false, message: 'No published characters match the selected type in the shared SQLite catalog.' };
  if (diagnostics.length) return { state: 'ready_with_warnings', retry: false, message: 'Loaded verified versions; ' + diagnostics.length + ' other published version(s) failed validation: ' + diagnostics[0].message };
  return { state: 'ready', retry: false, message: 'Loaded ' + capabilities.length + ' verified immutable Published Version(s).' };
}

export function buildScriptStructureGuide({ targetDuration = 'auto', outroEnabled = false, outroDuration = 0, singleScene = false } = {}) {
  const totalBudget = 180 - (outroEnabled ? clamp(outroDuration, 0, 180) : 0);
  const target = targetDuration === 'auto' ? 'tự chọn theo độ phức tạp chủ đề, người học, mật độ lời thoại và nhịp dựng' : `xấp xỉ ${clamp(targetDuration, 1, 180)} giây`;
  return `\nCẤU TRÚC KỊCH BẢN VÀ NGÂN SÁCH THỜI LƯỢNG\n- Tạo một video độc lập, JSON UTF-8 hợp lệ, không markdown/code fence/bình luận; phải có title và scenes. Mỗi scene phải có title, narration không rỗng tối đa 1.200 ký tự, và estimated_seconds (hoặc duration được app hỗ trợ) từ 1 đến 300. ${singleScene ? 'Mode demo này yêu cầu đúng một scene ngắn.' : 'Tạo 1–100 cảnh.'}\n- ${singleScene ? 'Giữ demo gọn và phù hợp giới hạn mode.' : `Chọn số cảnh vừa đủ cho chủ đề ${target}; không nhồi toàn bộ lời thoại vào một cảnh dài và không chia vụn nội dung ngắn. Với video từ 30 giây trở lên, ví dụ JSON một cảnh bên dưới chỉ minh họa cấu trúc; hãy tạo nhiều cảnh riêng cho mở đầu, các bước giải thích và kết luận. Tự chọn số cảnh theo nội dung, không cố định số lượng; tránh lặp ý. Ước lượng tiếng Việt khoảng 2,5–3,2 âm tiết/giây, rồi điều chỉnh để lời đọc tự nhiên.`}\n- Cộng chính xác estimated_seconds của tất cả cảnh trước khi trả JSON. Tổng cảnh không vượt ${totalBudget} giây (giới hạn render 180 giây${outroEnabled ? ` trừ outro ${clamp(outroDuration, 0, 180)} giây` : ''}); nếu vượt, rút gọn lời và phân bổ lại. Không chỉ dựa vào target_duration_seconds.\n- Giữ nguyên các trường metadata/schema đang có: motion_mode, standard, clause, clause_title, opening_title, aspect_ratio, voice_settings, subtitle_settings, social_post, youtube, brand_settings; dùng trường hình ảnh/animation hiện có phù hợp mode. Với ISO/IATF, không bịa số/tên điều khoản, yêu cầu bắt buộc hay câu trích; chỉ nêu normative wording khi đối chiếu nguồn được cấp phép.`;
}

const capabilityLines = capability => {
  if (!capability || !['sprite', 'rigged'].includes(capability.character_type)) throw new Error('A verified Published Character capability manifest is required.');
  const lines = [`Selected Published Character: ${capability.display_name} (character_id ${capability.character_id}), type ${capability.character_type}, immutable version ${capability.published_version}, checksum ${capability.published_checksum}.`];
  if (capability.role_hint) lines.push(`User role hint for this cast member: ${capability.role_hint}. This is advisory prose only, not an animation/action identifier.`);
  if (capability.character_type === 'sprite') {
    lines.push(`Verified published pose IDs: ${capability.available_poses.map(item => item.pose_id).join(', ')}. Default pose: ${capability.default_pose_id}.`);
    lines.push(`Verified published clip IDs: ${capability.available_clips.map(item => `${item.clip_id} (${item.frame_count} frames, ${item.fps} FPS, ${item.duration_seconds.toFixed(2)} s)`).join('; ') || 'none'}.`);
  } else lines.push(`Verified Rigged motion/action IDs: ${capability.available_motions.join(', ') || 'none'}. Default action: ${capability.default_action || 'none'}. Motion style: ${capability.motion_style || 'none'}.`);
  return lines;
};

export function buildCharacterDirectionPrompt(capability, { useMode = 'auto' } = {}) {
  if (!capability) return '';
  if (!['auto', 'required'].includes(useMode)) throw new Error('Character direction use mode must be auto or required.');
  const cast = (Array.isArray(capability) ? capability : [capability]).filter(Boolean);
  if (!cast.length || cast.length > 5) throw new Error('Select between one and five verified Published Characters.');
  const lines = cast.flatMap(capabilityLines);
  lines.push('Allowed cast: choose only from the exact Published Character IDs listed above. Assign educational roles consistently. Do not require every selected character to appear. Usually use one character per scene and aim for no more than two simultaneously; use two together only when both help teach the scene. Never invent or swap identities.');
  if (useMode === 'required') lines.push('CHARACTER USE MODE: REQUIRED. Include at least one suitable scene with a valid direction in each aspect-ratio variant (one direction in a single-aspect output). Pick scenes where a cast member helps teach the narration; do not force characters into every scene.');
  else lines.push('CHARACTER USE MODE: CHATGPT SELECTS. Decide from the narration and learning objective whether any cast member materially helps illustrate the lesson. You may choose no scenes and omit character_directions entirely when the content does not benefit from these characters. Never replace structured directions with prose when a character is shown.');
  lines.push('Use this exact direction shape for each chosen instance: "character_directions": [{"character_id":"<one allowed cast ID>","character_type":"<that ID’s pinned type>","published_version":"<that ID’s pinned SemVer>","published_checksum":"<that version’s checksum>","animation":{"type":"pose|clip|motion","id":"<approved ID for this exact version>","start_seconds":0,"duration_seconds":2,"loop":false,"hold_last_frame":true},"placement":{"x":0.5,"y":0.8,"scale":1},"visible":true,"opacity":1,"z_index":0,"visibility_start_seconds":0,"visibility_duration_seconds":2}]. Placement x/y is normalized 0–1 and scale is 0.01–10. z_index is a finite shared layer for Sprite and Rigged. Visibility timing is scene-relative and independent of animation timing.');
  lines.push('Set root motion_mode to scenegraph. Preserve the required scene_graph version 2 and all existing illustration objects/animation; character_directions complement those objects and never replace them. Keep the selected character ID, type, version, checksum, and approved animation IDs exact in every direction.');
  lines.push('For each Sprite cast member use animation.type pose with one of that version’s listed pose IDs, or clip with one of that version’s listed clip IDs. Respect its clip FPS/duration. For each Rigged cast member use animation.type motion and one of that version’s listed Rigged motion/action IDs. Never cross-use IDs between characters or character types.');
  lines.push('Do not use Sprite pose or clip IDs as Rigged actions.');
  lines.push('For a single aspect ratio, put directions inside scenes. For aspect_ratio both, preserve variants.landscape.scenes and variants.portrait.scenes and put directions inside those respective scene arrays. Give landscape and portrait independent placement x/y/scale suited to each composition; never copy the landscape placement blindly. Do not add or flatten a root scenes array when using variants. Keep subtitles and important illustrations clear of the character.');
  lines.push('Unknown character ID/version/type, checksum, animation ID/type, or invalid timing/placement must be reported for correction; never substitute another character or action.');
  return '\nCHARACTER DIRECTION — PINNED PUBLISHED CAPABILITIES\n' + lines.map(line => '- ' + line).join('\n');
}

export function assembleScriptPrompt({ basePrompt, structureGuide = '', characterEnabled = false, capability = null, characterUseMode = 'auto' } = {}) {
  if (characterEnabled && !capability) throw new Error('Select and revalidate a Published Character version before generating this prompt.');
  return String(basePrompt || '') + String(structureGuide || '') + (characterEnabled ? buildCharacterDirectionPrompt(capability, { useMode: characterUseMode }) : '');
}

export function validateScriptCharacterDirections(directions, { capabilities = [], sceneDuration = 300, requirePlacement = false } = {}) {
  const errors = [], verified = new Map(capabilities.map(item => [`${item.character_id}@${item.published_version}`, item]));
  if (directions == null) return errors;
  if (!Array.isArray(directions)) return ['character_directions must be an array.'];
  for (const [index, direction] of directions.entries()) {
    const label = `character_directions[${index}]`;
    if (!direction || typeof direction !== 'object' || Array.isArray(direction)) { errors.push(`${label} must be an object.`); continue; }
    const capability = verified.get(`${direction.character_id}@${direction.published_version}`);
    if (!capability) { errors.push(`${label} references an unknown character ID or published version.`); continue; }
    if (direction.character_type !== capability.character_type) errors.push(`${label}.character_type does not match the pinned Published Character.`);
    if (direction.published_checksum !== capability.published_checksum) errors.push(`${label}.published_checksum does not match the pinned version.`);
    const animation = direction.animation || {}, allowed = animation.type === 'pose' ? capability.available_poses.map(item => item.pose_id) : animation.type === 'clip' ? capability.available_clips.map(item => item.clip_id) : animation.type === 'motion' ? capability.available_motions : [];
    if (!['pose', 'clip', 'motion'].includes(animation.type) || !allowed.includes(animation.id)) errors.push(`${label}.animation type or ID is unsupported by the selected Published Character.`);
    const start = Number(animation.start_seconds), duration = animation.duration_seconds == null ? null : Number(animation.duration_seconds);
    if (!Number.isFinite(start) || start < 0 || start > sceneDuration || (duration != null && (!Number.isFinite(duration) || duration <= 0 || start + duration > sceneDuration))) errors.push(`${label}.animation timing is invalid for this scene.`);
    if (animation.loop != null && typeof animation.loop !== 'boolean' || animation.hold_last_frame != null && typeof animation.hold_last_frame !== 'boolean') errors.push(`${label}.animation playback flags must be boolean.`);
    const placement = direction.placement;
    if ((requirePlacement && placement == null) || (placement != null && (!placement || typeof placement !== 'object' || ['x', 'y', 'scale'].some(key => !Number.isFinite(Number(placement[key]))) || Number(placement.x) < 0 || Number(placement.x) > 1 || Number(placement.y) < 0 || Number(placement.y) > 1 || Number(placement.scale) < .01 || Number(placement.scale) > 10))) errors.push(`${label}.placement must use normalized x/y 0–1 and scale 0.01–10.`);
    if (direction.visible != null && typeof direction.visible !== 'boolean') errors.push(`${label}.visible must be boolean.`);
    const layer=direction.z_index??direction.layer;
    if (layer != null && (!Number.isFinite(Number(layer)) || Number(layer) < -100000 || Number(layer) > 100000 || direction.z_index!=null&&direction.layer!=null&&Number(direction.z_index)!==Number(direction.layer))) errors.push(`${label}.z_index is invalid or conflicts with layer.`);
    if (direction.opacity != null && (!Number.isFinite(Number(direction.opacity)) || Number(direction.opacity) < 0 || Number(direction.opacity) > 1)) errors.push(`${label}.opacity must be between 0 and 1.`);
    const visibleStart=direction.visibility_start_seconds??Number(animation.start_seconds??0),visibleDuration=direction.visibility_duration_seconds??(animation.duration_seconds==null?sceneDuration-Number(visibleStart):Number(animation.duration_seconds));
    if(!Number.isFinite(Number(visibleStart))||Number(visibleStart)<0||!Number.isFinite(Number(visibleDuration))||Number(visibleDuration)<=0||Number(visibleStart)+Number(visibleDuration)>sceneDuration+1e-6)errors.push(`${label} visibility window is invalid for this scene.`);
    if (direction.flip != null || direction.flip_x != null || direction.rotation != null) errors.push(`${label} requests an unsupported orientation field.`);
  }
  return errors;
}

/** Validate output only when the caller explicitly says it came from Character Direction mode. */
export function validateCharacterAwareScript(script, { enabled = false, capability = null, capabilities = null, useMode = 'auto' } = {}) {
  if (!enabled) return [];
  if (!['auto', 'required'].includes(useMode)) return ['Character use mode must be auto or required.'];
  const errors = [];
  const allowedCast = capabilities || (Array.isArray(capability) ? capability : capability ? [capability] : []);
  if (!allowedCast.length) return ['Character Direction was enabled, but no verified Published Character was selected.'];
  const aspect = String(script?.aspect_ratio || script?.aspectRatio || '').toLowerCase();
  const variants = script?.variants;
  const variantMode = aspect === 'both' || variants != null;
  const containers = variantMode
    ? [['landscape', variants?.landscape?.scenes], ['portrait', variants?.portrait?.scenes]]
    : [['script', script?.scenes]];
  const hasAnyDirections = containers.some(([, scenes]) => Array.isArray(scenes) && scenes.some(scene => scene?.character_directions != null));
  if (useMode === 'auto' && !hasAnyDirections) return [];
  for (const [variant, scenes] of containers) {
    if (!Array.isArray(scenes) || scenes.length < 1 || scenes.length > 100) { errors.push(`${variant}: expected scenes array with 1–100 scenes.`); continue; }
    let found = 0;
    for (const [index, scene] of scenes.entries()) {
      const label = `${variant} scene ${index + 1}`;
      if (scene?.scene_graph?.version !== 2 && scene?.sceneGraph?.version !== 2) errors.push(`${label}: character-aware output requires scene_graph version 2.`);
      const duration = Number(scene?.estimated_seconds ?? scene?.duration);
      for (const error of validateScriptCharacterDirections(scene?.character_directions, { capabilities: allowedCast, sceneDuration: Number.isFinite(duration) ? duration : 0, requirePlacement: true })) errors.push(`${label}: ${error}`);
      if (scene?.character_directions?.length) found += scene.character_directions.filter(item => allowedCast.some(member => item?.character_id === member.character_id && item?.published_version === member.published_version) && item.visible!==false && Number(item.opacity??1)>0 && Number(item.visibility_duration_seconds??(item.animation?.duration_seconds??(duration-Number(item.visibility_start_seconds??item.animation?.start_seconds??0))))>0).length;
    }
    if (useMode === 'required' && !found) errors.push(`${variant}: Character Direction was enabled, but the generated JSON contains no valid Published Character directions.`);
  }
  return errors;
}
