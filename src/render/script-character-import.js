const ID = /^char_[a-z0-9]+(?:_[a-z0-9]+)*$/;
const CHECKSUM = /^[a-f0-9]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const finite = value => Number.isFinite(Number(value));

function fail(sceneNumber, direction, message) {
  const who = direction?.character_id || '(missing character_id)';
  const where = typeof sceneNumber === 'string' ? sceneNumber : `Scene ${sceneNumber}`;
  throw new Error(`${where}, character ${who}: ${message}`);
}

/** Resolve explicit CP4.7A directions into the existing pinned Scene Graph v2 references. */
export async function resolveScriptCharacterDirections(scenes, storage, { versionCache = new Map(), variant = 'script' } = {}) {
  const resolvedScenes = [];
  for (const [sceneIndex, scene] of scenes.entries()) {
    const sceneNumber = `${variant} variant, Scene ${sceneIndex + 1}`;
    const directions = scene.character_directions;
    if (directions == null) { resolvedScenes.push(scene); continue; }
    if (!Array.isArray(directions) || directions.length > 100) fail(sceneNumber, null, 'character_directions must be an array of at most 100 directions.');
    const graph = scene.scene_graph || scene.sceneGraph || { version: 2, coordinate_space: 'normalized', objects: [], mechanisms: [], synchronizations: [] };
    if (graph.version !== 2) fail(sceneNumber, null, 'Published Characters require scene_graph version 2.');
    const character_instances = [...(graph.character_instances || [])];
    const sprite_instances = [...(graph.sprite_instances || [])];
    const existingIds = new Set([...character_instances, ...sprite_instances].map(item => item.instance_id));
    for (const [directionIndex, direction] of directions.entries()) {
      if (!direction || typeof direction !== 'object' || Array.isArray(direction)) fail(sceneNumber, null, `character_directions[${directionIndex}] must be an object.`);
      const label = `character_directions[${directionIndex}]`;
      const identity = direction.character_id;
      if (!ID.test(String(identity || ''))) fail(sceneNumber, direction, `${label}.character_id is invalid.`);
      if (!['sprite', 'rigged'].includes(direction.character_type)) fail(sceneNumber, direction, `${label}.character_type must be sprite or rigged.`);
      if (!VERSION.test(String(direction.published_version || '')) || !CHECKSUM.test(String(direction.published_checksum || ''))) fail(sceneNumber, direction, `${label} requires an exact published version and lowercase SHA-256 checksum.`);
      const placement = direction.placement;
      if (!placement || !finite(placement.x) || Number(placement.x) < 0 || Number(placement.x) > 1 || !finite(placement.y) || Number(placement.y) < 0 || Number(placement.y) > 1 || !finite(placement.scale) || Number(placement.scale) < .01 || Number(placement.scale) > 10) fail(sceneNumber, direction, `${label}.placement must include normalized x/y in 0–1 and scale in 0.01–10.`);
      if (direction.visible != null && typeof direction.visible !== 'boolean') fail(sceneNumber, direction, `${label}.visible must be boolean.`);
      if (direction.opacity != null && (!finite(direction.opacity) || Number(direction.opacity) < 0 || Number(direction.opacity) > 1)) fail(sceneNumber, direction, `${label}.opacity must be between 0 and 1.`);
      const zIndex=direction.z_index??direction.layer;
      if (zIndex != null && (!finite(zIndex) || Number(zIndex) < -100000 || Number(zIndex) > 100000)) fail(sceneNumber, direction, `${label}.z_index must be finite and between -100000 and 100000.`);
      if(direction.layer!=null&&direction.z_index!=null&&Number(direction.layer)!==Number(direction.z_index))fail(sceneNumber,direction,`${label}.layer and z_index cannot conflict.`);
      const visibilityStart=direction.visibility_start_seconds??Number(direction.animation?.start_seconds??0),visibilityDuration=direction.visibility_duration_seconds??(direction.animation?.duration_seconds==null?Number(scene.estimated_seconds??scene.duration??5)-Number(visibilityStart):Number(direction.animation.duration_seconds));
      if(!finite(visibilityStart)||Number(visibilityStart)<0||!finite(visibilityDuration)||Number(visibilityDuration)<=0||Number(visibilityStart)+Number(visibilityDuration)>Number(scene.estimated_seconds??scene.duration??5)+1e-6)fail(sceneNumber,direction,`${label} visibility window must be finite, positive, non-negative, and within the scene.`);
      const animation = direction.animation;
      if (!animation || typeof animation !== 'object' || !finite(animation.start_seconds ?? 0) || Number(animation.start_seconds ?? 0) < 0) fail(sceneNumber, direction, `${label}.animation needs a supported mode and non-negative start_seconds.`);
      const start = Number(animation.start_seconds ?? 0), duration = animation.duration_seconds == null ? scene.estimated_seconds ?? scene.duration ?? 5 : Number(animation.duration_seconds);
      if (!finite(duration) || duration <= 0 || start + duration > Number(scene.estimated_seconds ?? scene.duration ?? 5) + 1e-6) fail(sceneNumber, direction, `${label}.animation timing exceeds the scene duration.`);
      if (animation.loop != null && typeof animation.loop !== 'boolean' || animation.hold_last_frame != null && typeof animation.hold_last_frame !== 'boolean') fail(sceneNumber, direction, `${label}.animation playback flags must be booleans.`);
      const versionKey = `${identity}@${direction.published_version}`;
      if (!versionCache.has(versionKey)) versionCache.set(versionKey, storage.getCharacterVersion(identity, direction.published_version));
      let version;
      try { version = await versionCache.get(versionKey); }
      catch (error) { versionCache.delete(versionKey); throw error; }
      if (!version) fail(sceneNumber, direction, `${label} published version ${direction.published_version} was not found.`);
      if (version.character_id !== identity || version.version !== direction.published_version) fail(sceneNumber, direction, `${label} library response does not match the requested immutable identity and version.`);
      if (version.character_type !== direction.character_type) fail(sceneNumber, direction, `${label} type does not match the published character type.`);
      if (version.content_checksum !== direction.published_checksum) fail(sceneNumber, direction, `${label} checksum does not match the exact published version.`);
      if (version.diagnostics?.length) fail(sceneNumber, direction, `${label} published assets are invalid: ${version.diagnostics.map(item => item.message).join(' ')}`);
      let instance;
      const baseId = `script-scene-${sceneIndex + 1}-direction-${directionIndex + 1}`;
      let instance_id = baseId;
      for (let suffix = 2; existingIds.has(instance_id); suffix++) instance_id = `${baseId}-${suffix}`;
      existingIds.add(instance_id);
      if (direction.character_type === 'sprite') {
        const snapshot = version.sprite_snapshot;
        if (!snapshot || snapshot.schema_version !== 1) fail(sceneNumber, direction, `${label} has an invalid published Sprite manifest.`);
        const type = animation.type;
        if (!['pose', 'clip'].includes(type)) fail(sceneNumber, direction, `${label} Sprite supports pose or clip directions; ${type || '(missing)'} is unsupported.`);
        if (type === 'pose' && !snapshot.poses.some(item => item.pose_id === animation.id)) fail(sceneNumber, direction, `${label} pose ${animation.id} is not in the pinned version.`);
        if (type === 'clip' && !snapshot.clips.some(item => item.clip_id === animation.id)) fail(sceneNumber, direction, `${label} clip ${animation.id} is not in the pinned version.`);
        const spriteAnimation = type === 'pose' ? { mode: 'pose', pose_id: animation.id } : { mode: 'clip', clip_id: animation.id, start_seconds: start, loop: animation.loop === true, hold_last_frame: animation.hold_last_frame !== false };
        instance = { instance_id, character_id: identity, character_type: 'sprite', character_version: direction.published_version, character_version_checksum: direction.published_checksum, transform: { x: Number(placement.x), y: Number(placement.y), scale: Number(placement.scale), opacity: direction.opacity ?? 1 }, visible: direction.visible !== false, z_index: zIndex ?? 0, active_start_seconds: Number(visibilityStart), active_duration_seconds: Number(visibilityDuration), animation: spriteAnimation };
        sprite_instances.push(instance);
      } else {
        if (animation.type !== 'motion') fail(sceneNumber, direction, `${label} Rigged animation.type must be motion.`);
        const capabilityIds = version.compatible_motion_features || [];
        if (!capabilityIds.includes(animation.id) || !['idle', 'breathe', 'blink'].includes(animation.id)) fail(sceneNumber, direction, `${label} Rigged motion ${animation.id} is not an approved supported capability in the pinned version.`);
        instance = { instance_id, character_id: identity, character_version: direction.published_version, character_version_checksum: direction.published_checksum, transform: { x: Number(placement.x), y: Number(placement.y), scale: Number(placement.scale), rotation: 0, opacity: direction.opacity ?? 1 }, motion_style: version.motion_style || 'natural', visible: direction.visible !== false, z_index: zIndex ?? 0, active_start_seconds: Number(visibilityStart), active_duration_seconds: Number(visibilityDuration), actions: [{ id: `${instance_id}-${animation.id}`, motion: animation.id, start_seconds: start, duration_seconds: duration, loop_mode: animation.loop === false ? 'none' : 'repeat' }] };
        character_instances.push(instance);
      }
    }
    resolvedScenes.push({ ...scene, scene_graph: { ...graph, version: 2, coordinate_space: 'normalized', character_instances, sprite_instances } });
  }
  return resolvedScenes;
}

