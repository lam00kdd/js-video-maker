import { CharacterLibraryStorage } from './render/character-library-storage.js';
import { characterArtworkStages, generateCharacterArtworkPrompt, generateCharacterArtworkStagePrompt, resolveArtworkPromptParts, groupArtworkPromptParts } from './render/character-prompt-builder.js';
import { matchArtworkFileToPart, resolveArtworkImportParts, validateArtworkPng, validateRigArtworkSidecar, snapshotArtworkBlob } from './render/character-artwork-import.js';
import { canvasPointFromSource, clampSourcePoint, createCanonicalM1EditorRig, createDraftAppearanceManifest, createInitialRigEditorParts, createRigEditorDiagnostics, missingRequiredRigParts, resolveRigEditorPreview, sourcePointFromCanvas } from './render/character-rig-editor.js';
import { analyzeAlphaGeometry, candidateSourceAnchors, createForceFitAssemblyCandidate, createHybridAssemblyCandidate, fitImagePartToJoints, resolveAnatomicalJointPair } from './render/character-auto-assembly.js';
import { createImportedRigReadyMetadata, createRigReadyMetadataTemplates, updateRigReadyAnchor, validateRigReadyMetadata, verifyRigReadyMetadata } from './render/character-rig-ready-metadata.js';
import { calculateImagePartCanvasTransform, drawImageBackedCharacter } from './render/object-scene-renderer.js';
import { getStarterProfile, starterAppearanceOptions, starterCharacterProfiles } from './render/character-starter-library.js';
import { createSampleSpriteCharacterDefinition, normalizeCharacterType } from './render/character-sprite.js';
import { SPRITE_POSE_CATALOG, SPRITE_IDENTITY_DEFAULTS, approveSpriteMaster, approveSpritePose, buildSpriteMasterPrompt, buildSpritePosePrompt, collectSpriteAssetReferences, createSpriteProductionDefinition, diagnoseSpritePoseLibrary, importSpriteMaster, importSpritePose, inspectSpritePng, normalizeSpriteAlignment, normalizeSpriteIdentity, normalizeSpriteProductionDefinition, resetSpriteAlignment, resolveSpriteDrawPlacement } from './render/character-sprite-workflow.js';
import { WAVE_FRAME_DEFINITIONS, WAVE_PROMPT_MODES, approveSpriteClip, buildWaveFramePrompt, buildWaveSequentialFramePrompt, createWaveClip, diagnoseSpriteClipSetup, evaluateSpriteClip, getWaveReferenceAvailability, replaceSpriteClipFrame, setSpriteClipFrameReview, setSpriteFrameAlignment, sliceSpriteSheet } from './render/sprite-clips.js';

export const CHARACTER_ROLES = Object.freeze([
  ['male_teacher', 'Male teacher'], ['female_teacher', 'Female teacher'], ['student', 'Student'],
  ['engineer', 'Engineer'], ['electrician', 'Electrician'], ['humanoid_robot', 'Humanoid robot'], ['custom', 'Custom']
]);
export const CHARACTER_RIG_PROFILES = Object.freeze(['adult', 'student', 'humanoid_robot']);
export const CHARACTER_MOTION_STYLES = Object.freeze(['natural', 'minimal', 'robotic']);
const CHARACTER_ART_STYLES = Object.freeze(['educational_cartoon', 'minimal_cartoon', 'mechanical_cartoon']);
const MOTION_TO_ART_STYLE = Object.freeze({ natural: 'educational_cartoon', minimal: 'minimal_cartoon', robotic: 'mechanical_cartoon' });
const SPRITE_PROFILE_BY_ROLE=Object.freeze({male_teacher:'teacher',female_teacher:'teacher',student:'student',engineer:'engineer',electrician:'electrician',humanoid_robot:'robot',custom:'teacher'});

export function createCharacterId(displayName, uniquePart = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) {
  const slug = String(displayName || 'character').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'character';
  const suffix = String(uniquePart).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || Math.random().toString(36).slice(2);
  return `char_${slug}_${suffix}`;
}

export function filterCharacters(characters, query = '', role = 'all') {
  const needle = String(query).trim().toLocaleLowerCase();
  return characters.filter(character => (role === 'all' || character.source_metadata?.role === role) &&
    (!needle || `${character.display_name} ${character.character_id} ${character.source_metadata?.role || ''}`.toLocaleLowerCase().includes(needle)));
}

export function shortenCharacterId(characterId, prefix = 15, suffix = 7) {
  const value = String(characterId || '');
  return value.length > prefix + suffix + 1 ? `${value.slice(0, prefix)}…${value.slice(-suffix)}` : value;
}

export function createMetadataDraft({ display_name, description = '', role, rig_profile, motion_style, character_type = 'rigged', sprite_template = 'lam_educator_sprite_v1', sprite_character = null }) {
  const name = String(display_name || '').trim();
  if (!name || name.length > 120) throw new Error('Display name phải có từ 1 đến 120 ký tự.');
  if (String(description || '').length > 2000) throw new Error('Description không được vượt quá 2000 ký tự.');
  if (!CHARACTER_ROLES.some(([id]) => id === role)) throw new Error('Hãy chọn một role hợp lệ.');
  const type = normalizeCharacterType(character_type);
  if (type === 'sprite') {
    const definition = sprite_character || (sprite_template === 'lam_educator_sprite_v1' ? createSpriteProductionDefinition(createSampleSpriteCharacterDefinition(),{...SPRITE_IDENTITY_DEFAULTS,character_name:name,role_or_profession:roleName(role),starter_profile:SPRITE_PROFILE_BY_ROLE[role]||'teacher'}) : null);
    if (!definition) throw new Error('Sprite template không hợp lệ.');
    return { display_name: name, description: String(description || '').trim(), role, character_type: type, sprite_character: normalizeSpriteProductionDefinition(definition), asset_refs: collectSpriteAssetReferences(definition) };
  }
  if (!CHARACTER_RIG_PROFILES.includes(rig_profile)) throw new Error('Rig profile không hợp lệ.');
  if (!CHARACTER_MOTION_STYLES.includes(motion_style)) throw new Error('Motion style không hợp lệ.');
  return { display_name: name, description: String(description || '').trim(), role, character_type: type, rig_profile, motion_style, rig: null, manifest: null, asset_refs: [] };
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const signedAngleDegrees = radians => { const degrees=Math.round(Number(radians)*180/Math.PI);return `${degrees>=0?'+':''}${degrees}°`; };
const roleName = role => CHARACTER_ROLES.find(([id]) => id === role)?.[1] || 'Unassigned';
const optionMarkup = (items, selected, labels = {}) => items.map(item => {
  const id = Array.isArray(item) ? item[0] : item;
  const label = Array.isArray(item) ? item[1] : labels[id] || item;
  return `<option value="${esc(id)}"${id === selected ? ' selected' : ''}>${esc(label)}</option>`;
}).join('');
const sameDraft = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const promptItems = value => String(value || '').split(/[\n,]/).map(item => item.trim()).filter(Boolean);
const formatAssetSize = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`;

export function generatePromptForCharacter(draft, options = {}) {
  return generateCharacterArtworkPrompt({
    role: options.role || draft.role || 'custom',
    style: options.style || MOTION_TO_ART_STYLE[draft.motion_style] || 'educational_cartoon',
    rig_profile: options.rig_profile || draft.rig_profile || 'adult',
    motion_style: options.motion_style || draft.motion_style,
    description: options.description ?? draft.description ?? '',
    hair: options.hair || '', clothing: promptItems(options.clothing), accessories: promptItems(options.accessories),
    facial_features: promptItems(options.facial_features), output_stage: options.output_stage || 'concept',
    language: options.language || 'vi',
    reference_guidance: { enabled: options.reference_enabled === true, preserve: promptItems(options.reference_traits) }
  });
}

export function generatePromptStageForCharacter(draft, options = {}, characterId = 'unassigned') {
  return generateCharacterArtworkStagePrompt({
    character_id: characterId,
    role: options.role || draft.role || 'custom',
    style: options.style || MOTION_TO_ART_STYLE[draft.motion_style] || 'educational_cartoon',
    rig_profile: options.rig_profile || draft.rig_profile || 'adult',
    motion_style: options.motion_style || draft.motion_style,
    description: options.description ?? draft.description ?? '', hair: options.hair || '',
    clothing: promptItems(options.clothing), accessories: promptItems(options.accessories),
    facial_features: promptItems(options.facial_features), colors: promptItems(options.colors),
    body_proportions: options.body_proportions,
    appearance_options:{starter_template:options.starter_template,skin_tone:options.skin_tone,hair_style:options.hair_style,face_style:options.face_style,outfit:options.outfit},
    reference_guidance: { enabled: options.reference_enabled === true, preserve: promptItems(options.reference_traits) },
    language: options.language || 'vi', workflow_stage: options.output_stage === 'concept' ? 'master' : options.workflow_stage || 'head_body',
    manifest: draft.manifest || null, rig: draft.rig || null
  });
}

export async function copyPromptText(prompt, { clipboard = globalThis.navigator?.clipboard, documentRef = globalThis.document, output = null } = {}) {
  let clipboardError = null;
  if (clipboard?.writeText) {
    try { await clipboard.writeText(prompt); return true; }
    catch (error) { clipboardError = error; }
  }
  if (output && documentRef?.execCommand) {
    output.focus(); output.select();
    try { if (documentRef.execCommand('copy')) return true; }
    catch (error) { clipboardError = error; }
  }
  throw clipboardError || new Error('Clipboard permission is unavailable. Select the prompt and copy it manually.');
}

export class CharacterStudioManager {
  constructor(root, { storage = new CharacterLibraryStorage(), onWorkspaceChange = () => {} } = {}) {
    this.root = root;
    this.storage = storage;
    this.onWorkspaceChange = onWorkspaceChange;
    this.characters = [];
    this.current = null;
    this.currentDraft = null;
    this.savedDraft = null;
    this.query = '';
    this.roleFilter = 'all';
    this.loading = false;
    this.error = '';
    this.saving = false;
    this.copyStatus = '';
    this.activeSection = 'overview';
    this.promptOptionsByCharacter = new Map();
    this.generatedPromptByCharacter = new Map();
    this.promptFeedback = '';
    this.pendingArtworkAssets = new Map();
    this.artworkErrorsByCharacter = new Map();
    this.artworkRenderToken = 0;
    this.rigEditorStateByCharacter = new Map();
    this.rigPreviewImagesByCharacter = new Map();
    this.rigAlphaMetricsByCharacter = new Map();
    this.rigCanvasFrame = null;
    this.rigDrag = null;
    this.jointGuidePartByCharacter = new Map();
    this.jointGuidePlacementByCharacter = new Map();
    this.jointGuideViewByCharacter = new Map();
    this.jointGuideDrag = null;
    this.spritePoseByCharacter = new Map();
    this.spritePromptsByCharacter=new Map();
    this.spriteClipPromptsByCharacter=new Map();
    this.spriteClipPromptContextsByCharacter=new Map();
    this.spriteClipPromptSessionsByCharacter=new Map();
    this.spriteClipPromptContextsByCharacter=new Map();
    this.spriteClipPromptSessionsByCharacter=new Map();
    this.spriteClipPreviewByCharacter=new Map();
    this.spriteClipImageCacheByCharacter=new Map();
    this.spriteClipAssetChecksByCharacter=new Map();
    this.spritePublishValidationByCharacter=new Map();
    this.spritePublishedVersionByCharacter=new Map();
    this.spritePublishedPreviewByCharacter=new Map();
    this.spriteWaveRenderToken=0;
    this.spriteWaveRaf=0;
    this.spritePreviewOptionsByCharacter=new Map();
    this.spriteRenderToken=0;
    this.spriteMessage='';
    this.toastTimer=0;
  }

  showStudioToast(message,{kind='success',duration=2800}={}){const toast=document.querySelector('#toast'),content=document.querySelector('#toast-message');if(!toast||!content)return;content.textContent=String(message);toast.classList.add('character-studio-toast');toast.classList.toggle('is-error',kind==='error');toast.classList.toggle('is-warning',kind==='warning');toast.setAttribute('role',kind==='error'?'alert':'status');toast.setAttribute('aria-live',kind==='error'?'assertive':'polite');toast.classList.add('show');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>{toast.classList.remove('show','character-studio-toast','is-error','is-warning');toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');},duration);}

  mount() {
    this.root.innerHTML = `
      <aside class="character-library-sidebar">
        <div class="character-panel-heading"><div><span class="overline">CHARACTER LIBRARY</span><h1>Characters</h1></div><button class="small-add" data-action="new" aria-label="New character">＋</button></div>
        <div class="character-library-tools"><input data-field="search" type="search" placeholder="Search name, ID, role…" aria-label="Search characters"><select data-field="role-filter" aria-label="Filter by role"><option value="all">All roles</option>${optionMarkup(CHARACTER_ROLES)}</select><button class="add-scene-button" data-action="new">＋ New Character</button></div>
        <div class="character-list" data-region="list" aria-live="polite"></div>
      </aside>
      <section class="character-editor" data-region="editor"></section>
      <aside class="character-inspector" data-region="inspector"></aside>
      <dialog class="character-create-dialog" data-region="create-dialog"><form method="dialog" data-form="create"><div class="panel-heading"><div><span class="overline">CHARACTER LIBRARY</span><h2>New Character</h2></div><button type="button" class="tool-chip" data-action="close-create" aria-label="Close">×</button></div><label>Display name<input name="display_name" required maxlength="120" autocomplete="off" placeholder="e.g. Minh, the science teacher"></label><label>Character type<select name="character_type" data-create-type><option value="rigged">Rigged · M1</option><option value="sprite">Sprite · fixed poses</option></select></label><label>Role<select name="role" required>${optionMarkup(CHARACTER_ROLES)}</select></label><div data-create-rigged><label>Rig profile<select name="rig_profile" required>${optionMarkup(CHARACTER_RIG_PROFILES)}</select></label><label>Motion style<select name="motion_style" required>${optionMarkup(CHARACTER_MOTION_STYLES)}</select></label></div><div data-create-sprite hidden><label>Sprite template<select name="sprite_template"><option value="lam_educator_sprite_v1">LAM Educator · 4 fixed poses</option></select></label><span class="field-help">Uses local artwork; you can switch Idle, Greet, Point and Explain after creating.</span></div><label>Description <span class="field-help">Optional</span><textarea name="description" maxlength="2000" rows="3"></textarea></label><div class="character-form-error" data-region="create-error" role="alert"></div><div class="character-dialog-actions"><button type="button" class="tool-chip" data-action="close-create">Cancel</button><button type="submit" class="export-button">Create draft</button></div></form></dialog>`;
    this.root.querySelector('[data-field="search"]').addEventListener('input', event => { this.query = event.target.value; this.renderList(); });
    this.root.querySelector('[data-field="role-filter"]').addEventListener('change', event => { this.roleFilter = event.target.value; this.renderList(); });
    this.root.querySelectorAll('[data-action="new"]').forEach(button => button.addEventListener('click', () => this.openCreate()));
    this.root.querySelectorAll('[data-action="close-create"]').forEach(button => button.addEventListener('click', () => this.closeCreate()));
    this.root.querySelector('[data-form="create"]').addEventListener('submit', event => { event.preventDefault(); this.createFromForm(event.currentTarget); });
    this.root.addEventListener('click', event => {
      const button = event.target.closest('[data-character-id]');
      if (button) { this.stopSpriteWavePlayback(); this.openCharacter(button.dataset.characterId); }
      if (event.target.closest('[data-action="save"]')) this.saveDraft();
      if (event.target.closest('[data-action="discard"]')) this.discardChanges();
      if(event.target.closest('[data-action="sprite-generate-master-prompt"]'))this.generateSpriteMasterPrompt();
      if(event.target.closest('[data-action="sprite-copy-master-prompt"]'))void this.copySpritePrompt('master');
      if(event.target.closest('[data-action="sprite-import-master"]'))this.root.querySelector('[data-file-sprite-master]')?.click();
      if(event.target.closest('[data-action="sprite-approve-master"]'))this.approveCurrentSpriteMaster();
      if(event.target.closest('[data-action="sprite-download-master"]'))void this.downloadSpriteAsset(this.currentDraft?.sprite_character?.master?.asset_id,'master-character.png');
      if(event.target.closest('[data-action="sprite-generate-pose-prompt"]'))this.generateSpritePosePrompt(event.target.closest('[data-action="sprite-generate-pose-prompt"]').dataset.poseId);
      if(event.target.closest('[data-action="sprite-copy-pose-prompt"]'))void this.copySpritePrompt('pose',event.target.closest('[data-action="sprite-copy-pose-prompt"]').dataset.poseId);
      if(event.target.closest('[data-action="sprite-import-pose"]'))this.root.querySelector(`[data-file-sprite-pose="${CSS.escape(event.target.closest('[data-action="sprite-import-pose"]').dataset.poseId)}"]`)?.click();
      if(event.target.closest('[data-action="sprite-approve-pose"]'))this.approveCurrentSpritePose(event.target.closest('[data-action="sprite-approve-pose"]').dataset.poseId);
      if(event.target.closest('[data-action="sprite-generate-wave-prompt"]'))this.generateSpriteWavePrompt();
      if(event.target.closest('[data-action="sprite-accept-wave-frame"]'))this.reviewSpriteWaveFrame('accepted');
      if(event.target.closest('[data-action="sprite-reject-wave-frame"]'))this.reviewSpriteWaveFrame('rejected');
      if(event.target.closest('[data-action="sprite-copy-wave-prompt"]'))void this.copySpriteWavePrompt();
      if(event.target.closest('[data-action="sprite-import-wave-sheet"]'))this.root.querySelector('[data-file-wave-sheet]')?.click();
      const importFrame=event.target.closest('[data-action="sprite-import-wave-frame"]');if(importFrame)this.root.querySelector(`[data-file-wave-frame="${importFrame.dataset.frameIndex}"]`)?.click();
      if(event.target.closest('[data-action="sprite-approve-wave"]'))this.approveSpriteWaveClip();
      if(event.target.closest('[data-action="sprite-reject-wave"]'))this.rejectSpriteWaveClip();
      if(event.target.closest('[data-action="sprite-validate-publish"]'))void this.validateSpriteForPublish();
      if(event.target.closest('[data-action="sprite-publish-version"]'))void this.publishCurrentSpriteVersion();
      const openPublishedSprite=event.target.closest('[data-action="sprite-load-published"]');if(openPublishedSprite){const version=this.root.querySelector('[data-published-version]')?.value;if(version)void this.loadPublishedSpriteVersion(version);}
      const publishedSprite=event.target.closest('[data-action="sprite-open-published"]');if(publishedSprite)void this.loadPublishedSpriteVersion(publishedSprite.dataset.version);
      if(event.target.closest('[data-action="sprite-wave-stop"]'))this.stopSpriteWavePlayback({reset:true});
      const waveStep=event.target.closest('[data-action="sprite-wave-step"]');if(waveStep)this.stepSpriteWaveFrame(Number(waveStep.dataset.direction));
      if(event.target.closest('[data-action="sprite-wave-play"]'))this.toggleSpriteWavePlayback();
      if(event.target.closest('[data-action="sprite-wave-reset-alignment"]'))this.resetSpriteWaveFrameAlignment();
      if(event.target.closest('[data-action="sprite-reset-alignment"]'))this.resetCurrentSpriteAlignment();
      if(event.target.closest('[data-action="sprite-compare-toggle"]'))this.toggleSpriteComparison();
      if(event.target.closest('[data-action="sprite-toggle-pose"]'))this.toggleSpriteIdlePreview();
      const spritePoseSelect=event.target.closest('[data-action="sprite-select-pose"]');if(spritePoseSelect){this.spritePoseByCharacter.set(this.current.character_id,spritePoseSelect.dataset.poseId);this.renderEditor();}
      const rejectSpritePose=event.target.closest('[data-action="sprite-reject-pose"]');if(rejectSpritePose)this.rejectCurrentSpritePose(rejectSpritePose.dataset.poseId);
      if (event.target.closest('[data-action="copy-id"]')) this.copyCharacterId();
      if (event.target.closest('[data-action="generate-prompt"]')) this.generatePrompt();
      if (event.target.closest('[data-action="copy-prompt"]')) this.copyPrompt();
      if (event.target.closest('[data-action="select-prompt"]')) this.selectPrompt();
      const rowImport = event.target.closest('[data-action="import-part"]');
      if (rowImport) this.root.querySelector(`[data-file-part="${CSS.escape(rowImport.dataset.partId)}"]`)?.click();
      if (event.target.closest('[data-action="import-multiple"]')) this.root.querySelector('[data-file-multiple]')?.click();
      const removePart = event.target.closest('[data-action="remove-part"]');
      if (removePart) this.removeArtworkPart(removePart.dataset.partId);
      const guideButton=event.target.closest('[data-action="joint-guide"]');if(guideButton){const id=this.current.character_id,partId=guideButton.dataset.partId;if(this.jointGuidePartByCharacter.get(id)===partId){this.jointGuidePartByCharacter.delete(id);this.jointGuidePlacementByCharacter.delete(id);this.renderEditor();}else{this.jointGuidePartByCharacter.set(id,partId);this.jointGuidePlacementByCharacter.delete(id);if(!this.artworkRecord(partId)?.rig_metadata)void this.generateRigMetadataCandidate(partId);else this.renderEditor();}}
      const openGuide=event.target.closest('[data-action="rig-open-joint-guide"]');if(openGuide){this.activeSection='artwork-parts';this.jointGuidePartByCharacter.set(this.current.character_id,openGuide.dataset.partId);this.renderEditor();}
      const guideView=event.target.closest('[data-action="joint-guide-view"]');if(guideView){const id=this.current.character_id,view=this.jointGuideViewByCharacter.get(id)||{zoom:1,panX:0,panY:0},step=Number(guideView.dataset.step)||0,key=guideView.dataset.view;if(key==='fit')this.jointGuideViewByCharacter.set(id,{zoom:1,panX:0,panY:0});else if(key==='zoom')this.jointGuideViewByCharacter.set(id,{...view,zoom:Math.max(.5,Math.min(4,view.zoom+step*.2))});else this.jointGuideViewByCharacter.set(id,{...view,[key]:view[key]+step*24});this.renderEditor();}
      const placeAnchor=event.target.closest('[data-action="joint-guide-place"]');if(placeAnchor){this.jointGuidePartByCharacter.set(this.current.character_id,placeAnchor.dataset.partId);this.jointGuidePlacementByCharacter.set(this.current.character_id,placeAnchor.dataset.anchor);this.renderEditor();}
      const verifyAnchors=event.target.closest('[data-action="joint-guide-verify"]');if(verifyAnchors)this.verifyArtworkAnchors(verifyAnchors.dataset.partId);
      const exportGuide=event.target.closest('[data-action="joint-guide-export"]');if(exportGuide)this.exportJointMarkerGuide(exportGuide.dataset.partId);
      const buildMetadata=event.target.closest('[data-action="metadata-candidate"]');if(buildMetadata)this.generateRigMetadataCandidate(buildMetadata.dataset.partId);
      const resetAnchors=event.target.closest('[data-action="joint-guide-reset"]');if(resetAnchors)this.generateRigMetadataCandidate(resetAnchors.dataset.partId,{reset:true});
      const importSidecar=event.target.closest('[data-action="import-metadata"]');if(importSidecar)this.root.querySelector(`[data-file-metadata="${CSS.escape(importSidecar.dataset.partId)}"]`)?.click();
      const rigPart = event.target.closest('[data-rig-select]');
      if (rigPart) { this.rigEditorState().selectedPartId = rigPart.dataset.rigSelect; this.renderEditor(); }
      if (event.target.closest('[data-action="rig-fit"]')) { const state = this.rigEditorState(); state.zoom = 1; state.panX = 0; state.panY = 0; this.renderEditor(); }
      if (event.target.closest('[data-action="rig-reset-part"]')) this.resetRigEditorPart();
      if (event.target.closest('[data-action="rig-auto-assemble"]')) void this.previewAutoAssembly();
      if (event.target.closest('[data-action="rig-refit-all"]')) void this.previewAutoAssembly();
      if (event.target.closest('[data-action="rig-refit-selected"]')) this.refitSelectedAssemblyPart();
      if (event.target.closest('[data-action="rig-assembly-cancel"]')) { const state=this.rigEditorState();state.assemblyPreviewToken=(state.assemblyPreviewToken||0)+1;state.assemblyCandidate=null;state.assemblyPreviousWorking=null;this.renderEditor(); }
      if (event.target.closest('[data-action="rig-assembly-apply"]')) this.applyAutoAssembly();
      if (event.target.closest('[data-action="rig-assembly-reset-previous"]')) this.resetAutoAssemblyPrevious();
      if (event.target.closest('[data-action="rig-undo"]')) this.applyRigEditorHistory('undo');
      if (event.target.closest('[data-action="rig-redo"]')) this.applyRigEditorHistory('redo');
      const lockPart = event.target.closest('[data-action="rig-toggle-lock"]');
      if (lockPart) this.toggleRigEditorPartLock(lockPart.dataset.partId);
      const section = event.target.closest('[data-studio-section]');
      if (section) { this.activeSection = section.dataset.studioSection; this.renderEditor(); }
      const rigButton = event.target.closest('button[data-rig-control]');
      if (rigButton) this.updateRigEditorControl(rigButton);
    });
    this.root.addEventListener('input', event => {if(event.target.matches('[data-sprite-identity]'))this.updateSpriteIdentityField(event.target);else if(event.target.matches('[data-sprite-description]'))this.updateSpriteDescription(event.target);else if(event.target.matches('[data-sprite-alignment]'))this.updateSpriteAlignmentField(event.target);else if(event.target.matches('[data-wave-seek]'))this.seekSpriteWave(Number(event.target.value));else if(event.target.form?.dataset.form==='prompt')this.updatePromptField(event.target);else this.updateField(event.target);});
    this.root.addEventListener('input', event => { if(event.target.matches('[data-rig-control="testRotation"]'))this.updateRigEditorControl(event.target); });
    this.root.addEventListener('change', event => {if(event.target.matches('[data-sprite-identity]'))this.updateSpriteIdentityField(event.target);else if(event.target.matches('[data-sprite-description]'))this.updateSpriteDescription(event.target);else if(event.target.matches('[data-sprite-alignment]'))this.updateSpriteAlignmentField(event.target);else if(event.target.matches('[data-sprite-review-ack]'))this.updateSpriteBackgroundReview(event.target);else if(event.target.matches('[data-wave-loop]'))this.updateSpriteWaveLoop(event.target.checked);else if(event.target.form?.dataset.form==='prompt')this.updatePromptField(event.target);else this.updateField(event.target);});
    this.root.addEventListener('change', event => {
      if(event.target.matches('[data-wave-mode]')||event.target.matches('[data-wave-prompt-frame]')){const old=this.spriteClipPromptSessionsByCharacter.get(this.current.character_id)||{mode:'sequential_frames',frame_index:0};this.spriteClipPromptSessionsByCharacter.set(this.current.character_id,{mode:event.target.matches('[data-wave-mode]')?(WAVE_PROMPT_MODES.includes(event.target.value)?event.target.value:'sequential_frames'):old.mode,frame_index:event.target.matches('[data-wave-prompt-frame]')?Math.max(0,Math.min(7,Number(event.target.value)||0)):old.frame_index});this.spriteClipPromptsByCharacter.delete(this.current.character_id);this.spriteClipPromptContextsByCharacter.delete(this.current.character_id);this.renderEditor();}
      if(event.target.matches('[data-published-version]'))void this.loadPublishedSpriteVersion(event.target.value);
      if(event.target.matches('[data-published-pose]')||event.target.matches('[data-published-clip]')||event.target.matches('[data-published-time]')){const old=this.spritePublishedPreviewByCharacter.get(this.current.character_id)||{};this.spritePublishedPreviewByCharacter.set(this.current.character_id,{...old,pose_id:this.root.querySelector('[data-published-pose]')?.value||old.pose_id,clip_id:this.root.querySelector('[data-published-clip]')?.value||'',time_seconds:Number(this.root.querySelector('[data-published-time]')?.value||0)});void this.renderPublishedSpritePreview();}
      if(event.target.matches('[data-file-sprite-master]')){const input=event.target,file=input.files?.[0];input.value='';if(file)void this.importSpriteMasterFile(file);}
      if(event.target.matches('[data-file-sprite-pose]')){const input=event.target,file=input.files?.[0],poseId=input.dataset.fileSpritePose;input.value='';if(file)void this.importSpritePoseFile(file,poseId);}
      if(event.target.matches('[data-file-wave-sheet]')){const input=event.target,file=input.files?.[0];input.value='';if(file)void this.importSpriteWaveSheet(file);}
      if(event.target.matches('[data-file-wave-frame]')){const input=event.target,file=input.files?.[0],index=Number(input.dataset.fileWaveFrame);input.value='';if(file)void this.importSpriteWaveFrame(file,index);}
      if(event.target.matches('[data-sprite-pose]')){this.spritePoseByCharacter.set(this.current.character_id,event.target.value);this.renderEditor();}
      if(event.target.matches('[data-wave-frame]')){const index=Number(event.target.value),{clip}=this.currentSpriteWaveClip(),fps=Number(this.root.querySelector('[data-wave-fps]')?.value)||clip.fps;this.stopSpriteWavePlayback();this.spriteClipPreviewByCharacter.set(this.current.character_id,{...(this.spriteClipPreviewByCharacter.get(this.current.character_id)||{}),frame_index:index,time_seconds:index/fps,playing:false});this.renderEditor();}
      if(event.target.matches('[data-wave-alignment]'))this.updateSpriteWaveAlignment(event.target);
      if(event.target.matches('[data-wave-fps]'))this.updateSpriteWaveFps(event.target);
      if(event.target.matches('[data-sprite-preview-option]'))this.updateSpritePreviewOption(event.target);
      if (event.target.matches('[data-file-part]')) { const input = event.target, entries = [...input.files].map(file => ({ file, part_id: input.dataset.filePart })); input.value = ''; this.importArtworkFiles(entries); }
      if (event.target.matches('[data-file-multiple]')) { const input = event.target, files = [...input.files]; input.value = ''; this.importMultipleArtworkFiles(files); }
      if (event.target.matches('[data-file-bundle]')) { const input = event.target, files = [...input.files]; input.value = ''; void this.importArtworkBundleFiles(files); }
      if (event.target.matches('[data-file-metadata]')) { const input=event.target,file=input.files?.[0],partId=input.dataset.fileMetadata;input.value='';if(file)this.importRigMetadataSidecar(file,partId); }
      if (event.target.matches('[data-rig-field]')) this.updateRigEditorField(event.target);
      if (event.target.matches('[data-rig-control]')) this.updateRigEditorControl(event.target);
      if (event.target.matches('[data-joint-anchor]')) this.updateArtworkAnchorField(event.target);
    });
    this.root.addEventListener('pointerdown',event=>{const canvas=event.target.closest('[data-joint-guide]');if(canvas)this.beginJointGuideDrag(event,canvas);});
    this.root.addEventListener('pointermove',event=>this.moveJointGuideDrag(event));
    this.root.addEventListener('pointerup',event=>this.endJointGuideDrag(event));
    this.root.addEventListener('pointercancel',event=>this.endJointGuideDrag(event));
    this.root.querySelector('[data-form="create"]').addEventListener('change', event => this.syncCreateDefaults(event.currentTarget));
    this.render();
    return this.refresh();
  }

  isDirty() { return Boolean(this.currentDraft && !sameDraft(this.currentDraft, this.savedDraft)); }
  confirmDiscard() { if (!this.isDirty()) return true; const discard = globalThis.confirm?.('Chọn OK để Discard thay đổi chưa lưu. Chọn Cancel để Stay và tiếp tục chỉnh sửa.') === true; if (discard) this.discardChanges(); return discard; }

  async refresh() {
    this.loading = true; this.error = ''; this.render();
    try { this.characters = await this.storage.listCharacters(); }
    catch (error) { this.error = error?.message || 'Không thể mở Character Library.'; }
    finally { this.loading = false; this.renderList(); this.renderEditor(); this.renderInspector(); }
    return !this.error;
  }

  render() { this.renderList(); this.renderEditor(); this.renderInspector(); }

  renderList() {
    const host = this.root.querySelector('[data-region="list"]'); if (!host) return;
    if (this.loading && !this.characters.length) { host.innerHTML = '<div class="character-state">Loading Character Library…</div>'; return; }
    if (this.error && !this.characters.length) { host.innerHTML = `<div class="character-state character-error">${esc(this.error)}<button class="tool-chip" data-action="retry">Retry</button></div>`; host.querySelector('[data-action="retry"]')?.addEventListener('click', () => this.refresh()); return; }
    if (!this.characters.length) { host.innerHTML = '<div class="character-state"><b>Your character library is empty.</b><span>Create a draft to begin.</span></div>'; return; }
    const matches = filterCharacters(this.characters, this.query, this.roleFilter);
    if (!matches.length) { host.innerHTML = '<div class="character-state">No characters match this search.</div>'; return; }
    host.replaceChildren(...matches.map(character => {
      const card = document.createElement('button'); card.type = 'button'; card.className = `character-list-card${this.current?.character_id === character.character_id ? ' active' : ''}`; card.dataset.characterId = character.character_id;
      const thumb = document.createElement('span'); thumb.className = 'character-list-placeholder'; thumb.textContent = '✳';
      const body = document.createElement('span'); body.className = 'character-list-copy';
      const name = document.createElement('b'); name.textContent = character.display_name;
      const role = document.createElement('small'); role.textContent = roleName(character.source_metadata?.role);
      const type=normalizeCharacterType(character.character_type),profile = document.createElement('small'); profile.textContent = type==='sprite' ? 'Sprite · fixed-pose artwork' : `${character.source_metadata?.rig_profile || 'Rig not set'} · ${character.source_metadata?.motion_style || character.source_metadata?.style_profile || 'Style not set'}`;
      const modified = document.createElement('small'); modified.textContent = character.updated_at ? `Updated ${new Date(character.updated_at).toLocaleDateString()}` : '';
      body.append(name, role, profile, modified); card.append(thumb, body);
      const badge = document.createElement('span'); badge.className = `character-status-badge character-type-badge ${type}`; badge.textContent = `${type==='sprite'?'Sprite':'Rigged'}${character.published_versions?.length ? ` · ${character.published_versions.length} published` : ' · Draft'}`; card.append(badge);
      return card;
    }));
  }

  renderEditor() {
    const host=this.root.querySelector('[data-region="editor"]');if(!host)return;
    const scrollSelectors=['.character-editor-scroll','.sprite-production-editor','.artwork-parts-scroll','.rig-editor-scroll','.rig-canvas-wrap','.rig-preview-diagnostics','.rig-parts-panel'];
    const scrollState=scrollSelectors.map(selector=>{const element=host.querySelector(selector);return element?{selector,top:element.scrollTop,left:element.scrollLeft}:null;}).filter(Boolean);
    const hostScroll={top:host.scrollTop,left:host.scrollLeft};
    const workspace=this.root.querySelector('.character-studio-workspace'),workspaceScroll=workspace?{top:workspace.scrollTop,left:workspace.scrollLeft}:null;
    const pageScroll=typeof window!=='undefined'?{x:window.scrollX,y:window.scrollY}:null;
    this.renderEditorContent();
    host.scrollTop=hostScroll.top;host.scrollLeft=hostScroll.left;
    for(const saved of scrollState){const element=host.querySelector(saved.selector);if(element){element.scrollTop=saved.top;element.scrollLeft=saved.left;}}
    if(workspace&&workspaceScroll){workspace.scrollTop=workspaceScroll.top;workspace.scrollLeft=workspaceScroll.left;}
    if(pageScroll&&typeof window.scrollTo==='function'&&(window.scrollX!==pageScroll.x||window.scrollY!==pageScroll.y))window.scrollTo(pageScroll.x,pageScroll.y);
  }

  renderEditorContent() {
    const host = this.root.querySelector('[data-region="editor"]'); if (!host) return;
    if (!this.current) {
      host.innerHTML = `<div class="character-welcome"><span class="character-welcome-mark">✳</span><span class="overline">CHARACTER STUDIO</span><h1>Build a reusable character</h1><p>Character drafts and published versions live in the Character Library, independently of your video projects.</p><button class="export-button" data-action="new">＋ New Character</button>${this.error ? `<div class="character-error" role="alert">${esc(this.error)}</div>` : ''}${this.loading ? '<div class="field-help">Loading Character Library…</div>' : ''}</div>`;
      host.querySelector('[data-action="new"]')?.addEventListener('click', () => this.openCreate()); return;
    }
    const draft = this.currentDraft;
    if (!draft) { host.innerHTML = '<div class="character-state">Loading character draft…</div>'; return; }
    if(normalizeCharacterType(draft.character_type)==='sprite'){this.renderSpriteEditor(host);return;}
    const tabs = `<nav class="character-editor-tabs" aria-label="Character sections"><button type="button" data-studio-section="overview" class="${this.activeSection === 'overview' ? 'active' : ''}">Overview</button><button type="button" data-studio-section="artwork-prompt" class="${this.activeSection === 'artwork-prompt' ? 'active' : ''}">Artwork Prompt</button><button type="button" data-studio-section="artwork-parts" class="${this.activeSection === 'artwork-parts' ? 'active' : ''}">Artwork Parts</button><button type="button" data-studio-section="rig-editor" class="${this.activeSection === 'rig-editor' ? 'active' : ''}">Rig Editor</button></nav>`;
    if (this.activeSection === 'artwork-prompt') { this.renderPromptBuilder(host, tabs); return; }
    if (this.activeSection === 'artwork-parts') { this.renderArtworkParts(host, tabs); return; }
    if (this.activeSection === 'rig-editor') { this.renderRigEditor(host, tabs); return; }
    const dirty = this.isDirty();
    host.innerHTML = `${tabs}<div class="character-editor-scroll"><div class="character-editor-heading"><div><span class="overline">EDITABLE DRAFT</span><h1>${esc(draft.display_name)}</h1><span class="character-id-inline">${esc(this.current.character_id)}</span></div><span class="character-draft-indicator${dirty ? ' unsaved' : ''}">${dirty ? 'Unsaved changes' : 'Draft saved'}</span></div>
      <div class="character-art-placeholder"><div class="placeholder-avatar">${esc(draft.display_name.slice(0, 1).toUpperCase() || '✳')}</div><b>Appearance & rig workspace</b><span>Import PNG parts, bind them to the Human Rig, and save this editable draft from the Artwork Parts and Rig Editor tabs.</span></div>
      <form class="character-metadata-form" data-form="editor" autocomplete="off"><div class="section-title">DRAFT METADATA</div><label>Display name<input name="display_name" maxlength="120" required value="${esc(draft.display_name)}"></label><label>Description<textarea name="description" maxlength="2000" rows="4">${esc(draft.description || '')}</textarea></label><div class="character-form-grid"><label>Role<select name="role">${optionMarkup(CHARACTER_ROLES, draft.role)}</select></label><label>Rig profile<select name="rig_profile">${optionMarkup(CHARACTER_RIG_PROFILES, draft.rig_profile)}</select></label><label>Motion style<select name="motion_style">${optionMarkup(CHARACTER_MOTION_STYLES, draft.motion_style)}</select></label></div></form></div>
      <div class="character-editor-actions"><span class="character-save-status" data-region="save-status">${this.saving ? 'Saving…' : this.error ? esc(this.error) : ''}</span><button type="button" class="tool-chip" data-action="discard"${dirty ? '' : ' disabled'}>Discard</button><button type="button" class="export-button" data-action="save"${dirty && !this.saving ? '' : ' disabled'}>Save draft</button></div>`;
    for (const control of host.querySelectorAll('[data-form="editor"] input, [data-form="editor"] textarea, [data-form="editor"] select')) control.addEventListener('change', () => this.updateField(control));
    host.querySelector('[data-form="editor"] input')?.addEventListener('input', event => this.updateField(event.target));
  }

  renderSpriteEditor(host){
    const draft=this.currentDraft,definition=normalizeSpriteProductionDefinition(draft.sprite_character),poseId=this.spritePoseByCharacter.get(this.current.character_id)||definition.default_pose_id,pose=definition.poses.find(item=>item.pose_id===poseId)||definition.poses[0],dirty=this.isDirty(),prompts=this.spritePromptsByCharacter.get(this.current.character_id)||{},options=this.spritePreviewOptionsByCharacter.get(this.current.character_id)||{ghost:false,bounds:false,toggleIdle:false},diagnostics=diagnoseSpritePoseLibrary(definition),identity=definition.identity,master=definition.master;
    const clip=definition.clips.find(item=>item.clip_id==='wave')||createWaveClip(this.current.character_id,master.revision,{sourcePoseId:'greet'}),promptSession=this.spriteClipPromptSessionsByCharacter.get(this.current.character_id)||{mode:'sequential_frames',frame_index:0},promptFrameIndex=Math.max(0,Math.min(7,promptSession.frame_index||0)),promptContext=this.spriteClipPromptContextsByCharacter.get(this.current.character_id),referenceState=master.status==='approved'&&definition.poses.find(item=>item.pose_id==='greet')?.review_status==='approved'?(()=>{try{return getWaveReferenceAvailability(definition,clip,promptFrameIndex);}catch{return null;}})():null,clipPreview=this.spriteClipPreviewByCharacter.get(this.current.character_id)||{frame_index:0,fps:clip.fps,loop:clip.loop,playing:false},frameIndex=Math.max(0,Math.min(clip.frame_count-1,clipPreview.frame_index||0)),clipFrame=clip.frames[frameIndex],clipDiagnostics=diagnoseSpriteClipSetup(clip,definition,{invalidAssetIds:this.spriteClipAssetChecksByCharacter.get(this.current.character_id)?.invalid||[]}),clipPrompt=this.spriteClipPromptsByCharacter.get(this.current.character_id)||'';
    const identityField=(name,label,value,wide=false)=>`<label class="sprite-identity-field${wide?' wide':''}">${esc(label)}<input data-sprite-identity="${esc(name)}" maxlength="${name==='identity_constraints'?1200:300}" value="${esc(value)}"></label>`;
    const promptText=prompts.poses?.[pose.pose_id]||'';
    const poseGroups=['Basic','Explanation','Interaction','Expression','Legacy','Unregistered'].map(category=>({category,poses:definition.poses.filter(item=>(item.pose_category||'Unregistered')===category)})).filter(group=>group.poses.length),poseListMarkup=poseGroups.map(group=>`<div class="sprite-pose-group"><b class="sprite-pose-group-title">${esc(group.category)}</b>${group.poses.map(item=>`<button type="button" class="sprite-pose-card${item.pose_id===pose.pose_id?' selected':''}" data-action="sprite-select-pose" data-pose-id="${esc(item.pose_id)}"><b>${esc(item.label)}</b><span>${esc(item.asset_id?item.review_status==='approved'?'Approved':item.review_status==='rejected'?'Replace required':'Needs review':item.demo?'CP4.1 demo':'Missing')}</span><small>${esc(item.source_master_revision?`Master revision ${item.source_master_revision}`:'No Master revision')}</small></button>`).join('')}</div>`).join('');
    host.innerHTML=`<div class="sprite-character-editor sprite-production-editor"><header class="sprite-character-heading"><div><span class="overline">SPRITE CHARACTER · CP4.2 WORKSPACE</span><h1>${esc(draft.display_name)}</h1><span class="character-id-inline">${esc(this.current.character_id)}</span></div><span class="character-draft-indicator${dirty?' unsaved':''}">${dirty?'Unsaved changes':'Draft saved'}</span></header>
      <section class="sprite-production-section"><div class="section-title">A · CHARACTER IDENTITY</div><span class="character-type-badge sprite">Sprite · fixed-pose artwork</span><div class="sprite-identity-grid">${identityField('character_name','Character name',identity.character_name||draft.display_name)}<label class="sprite-identity-field">Role / profession<input data-sprite-identity="role_or_profession" value="${esc(identity.role_or_profession)}" maxlength="300"></label><label class="sprite-identity-field">Appearance starter<select data-sprite-identity="starter_profile">${optionMarkup(starterCharacterProfiles.map(profile=>[profile.id,profile.label]),identity.starter_profile)}</select></label><label class="sprite-identity-field">Age category<select data-sprite-identity="age_category">${optionMarkup([['adult','Adult'],['young_adult','Young adult'],['teen','Teen'],['child','Child'],['older_adult','Older adult'],['unspecified','Unspecified']],identity.age_category)}</select></label><label class="sprite-identity-field">View<select data-sprite-identity="view">${optionMarkup([['front','Front'],['near_front','Near-front']],identity.view)}</select></label>${identityField('general_appearance','General appearance',identity.general_appearance)}${identityField('hair_and_face','Hair and face',identity.hair_and_face)}${identityField('outfit','Outfit',identity.outfit)}${identityField('color_palette','Color palette',identity.color_palette)}${identityField('visual_style','Visual style',identity.visual_style)}${identityField('accessories','Optional accessories',identity.accessories)}${identityField('identity_constraints','Additional identity constraints',identity.identity_constraints,true)}</div><label class="sprite-identity-description">Draft description<textarea data-sprite-description rows="2">${esc(draft.description)}</textarea></label></section>
      <section class="sprite-production-section"><div class="section-title">B · MASTER CHARACTER</div><div class="sprite-master-grid"><div class="sprite-master-art"><div class="sprite-status-line"><b>Master status</b><span class="sprite-review-badge ${esc(master.status)}">${esc(master.status==='missing'?'Missing':master.status==='approved'?'Approved':master.status==='imported'?'Imported':'Needs Review')}</span><small>Revision ${master.revision||'—'}</small></div><div class="sprite-master-preview"><img data-sprite-master-preview alt="Sprite Master Character preview"${master.asset_id?'':' hidden'}><span data-sprite-master-empty>${master.asset_id?'Loading approved Master…':'Import a Master image to start the pose library.'}</span></div><div class="sprite-action-row"><button type="button" class="tool-chip" data-action="sprite-import-master">Import Master PNG</button><button type="button" class="tool-chip" data-action="sprite-approve-master"${master.asset_id&&master.status!=='approved'?'':' disabled'}>Approve Master</button><button type="button" class="tool-chip" data-action="sprite-download-master"${master.asset_id?'':' disabled'}>Download for reference</button><input type="file" accept="image/png,.png" data-file-sprite-master hidden></div><label class="sprite-review-ack"><input type="checkbox" data-sprite-master-opaque-review> I reviewed the opaque background and want to keep it as-is.</label><p class="field-help">Opaque backgrounds are never removed automatically. Approval requires explicit review.</p></div><div class="sprite-master-prompt"><div class="sprite-action-row"><button type="button" class="export-button" data-action="sprite-generate-master-prompt">Generate Master Character Prompt</button><button type="button" class="tool-chip" data-action="sprite-copy-master-prompt"${prompts.master?'':' disabled'}>Copy Prompt</button></div><textarea data-sprite-master-prompt readonly rows="14" placeholder="Generate a deterministic prompt from the identity settings.">${esc(prompts.master||'')}</textarea><p class="field-help">Generated locally from a deterministic template. Create the image separately in ChatGPT; the app does not call an image API.</p></div></div><p class="sprite-import-message" data-sprite-message role="status">${esc(this.spriteMessage||'')}</p></section>
      <section class="sprite-production-section"><div class="section-title">C · POSE LIBRARY</div><div class="sprite-pose-library-grid"><div class="sprite-pose-list">${poseListMarkup}</div><div class="sprite-pose-workflow"><label>Selected pose<select data-sprite-pose aria-label="Selected Sprite pose">${definition.poses.map(item=>`<option value="${esc(item.pose_id)}"${item.pose_id===pose.pose_id?' selected':''}>${esc(item.label)}${item.pose_category==='Legacy'?' · Legacy':''}</option>`).join('')}</select></label><p class="sprite-pose-action"><b>Action:</b> ${esc(pose.action_description||'No prompt template is registered. Existing artwork can still be previewed and aligned.')}</p><div class="sprite-action-row"><button type="button" class="export-button" data-action="sprite-generate-pose-prompt" data-pose-id="${esc(pose.pose_id)}"${master.status==='approved'&&pose.registered!==false?'':' disabled'}>Generate Pose Prompt</button><button type="button" class="tool-chip" data-action="sprite-copy-pose-prompt" data-pose-id="${esc(pose.pose_id)}"${promptText?'':' disabled'}>Copy Prompt</button><button type="button" class="tool-chip" data-action="sprite-import-pose" data-pose-id="${esc(pose.pose_id)}"${master.status==='approved'?'':' disabled'}>Import / Replace PNG</button><input type="file" accept="image/png,.png" data-file-sprite-pose="${esc(pose.pose_id)}" hidden></div>${pose.registered===false?'<p class="field-help">This stored pose ID has no prompt template. It remains preserved and can still be previewed, aligned or replaced.</p>':''}<textarea data-sprite-pose-prompt readonly rows="11" placeholder="Approve the Master Character, then generate a pose prompt.">${esc(promptText)}</textarea><p class="field-help">Each prompt names the approved Master revision and instructs you to attach that image manually. The app never sends it automatically.</p></div></div></section>
      <section class="sprite-production-section"><div class="section-title">D · POSE ALIGNMENT & REVIEW</div><div class="sprite-alignment-grid"><div class="sprite-alignment-preview"><div class="sprite-preview-stage sprite-production-stage"><canvas data-sprite-preview width="${definition.canvas.width}" height="${definition.canvas.height}" aria-label="Sprite pose alignment preview"></canvas></div><div class="sprite-action-row"><button type="button" class="tool-chip" data-action="sprite-compare-toggle">${options.ghost?'Hide idle ghost':'Compare against Idle'}</button><button type="button" class="tool-chip" data-action="sprite-toggle-pose">${options.toggleIdle?'Show selected pose':'Toggle Idle / selected'}</button><label class="sprite-review-ack"><input type="checkbox" data-sprite-preview-option="bounds"${options.bounds?' checked':''}> Show image bounds</label></div><p class="field-help" data-sprite-status>Preview uses the original image and a shared baseline. Ghost comparison is diagnostic only.</p></div><div class="sprite-alignment-controls"><label>Horizontal alignment <output data-sprite-output="offset_x">${Math.round(pose.alignment.offset_x*100)}%</output><input type="range" min="-0.25" max="0.25" step="0.005" value="${pose.alignment.offset_x}" data-sprite-alignment="offset_x"></label><label>Vertical alignment <output data-sprite-output="offset_y">${Math.round(pose.alignment.offset_y*100)}%</output><input type="range" min="-0.25" max="0.25" step="0.005" value="${pose.alignment.offset_y}" data-sprite-alignment="offset_y"></label><label>Anchor X <output data-sprite-output="anchor_x">${Math.round(pose.anchor.x*100)}%</output><input type="range" min="0" max="1" step="0.005" value="${pose.anchor.x}" data-sprite-alignment="anchor_x"></label><label>Ground anchor Y <output data-sprite-output="anchor_y">${Math.round(pose.anchor.y*100)}%</output><input type="range" min="0" max="1" step="0.005" value="${pose.anchor.y}" data-sprite-alignment="anchor_y"></label><label>Uniform scale <output data-sprite-output="scale">${pose.alignment.scale.toFixed(2)}×</output><input type="range" min="0.5" max="2" step="0.01" value="${pose.alignment.scale}" data-sprite-alignment="scale"></label><button type="button" class="tool-chip" data-action="sprite-reset-alignment">Reset to default</button><label class="sprite-review-ack"><input type="checkbox" data-sprite-review-ack="${esc(pose.pose_id)}"${pose.background_reviewed?' checked':''}> I reviewed the image background.</label><div class="sprite-action-row"><button type="button" class="tool-chip" data-action="sprite-approve-pose" data-pose-id="${esc(pose.pose_id)}"${pose.asset_id&&pose.review_status!=='approved'?'':' disabled'}>Approve Pose</button><button type="button" class="tool-chip" data-action="sprite-reject-pose" data-pose-id="${esc(pose.pose_id)}"${pose.asset_id?'':' disabled'}>Reject / Replace</button></div><span class="sprite-review-state">${pose.demo?'CP4.1 sample artwork · demo only':`Pose ${esc(pose.review_status)} · source Master ${pose.source_master_revision??'—'}`}</span></div></div></section>
      <section class="sprite-production-section"><div class="section-title">E · TECHNICAL DIAGNOSTICS & MANUAL REVIEW</div><p class="field-help">Automatic checks report technical differences; they cannot prove visual identity consistency. Review face, clothing, accessories, framing and gesture yourself.</p><div class="sprite-diagnostics">${diagnostics.length?diagnostics.map(item=>`<div class="sprite-diagnostic ${esc(item.severity)}"><b>${esc(item.code)}</b>${item.pose_id?` · ${esc(item.pose_id)}`:''}: ${esc(item.message)}</div>`).join(''):'<div class="sprite-diagnostic success">No technical issues detected. Manual review is still required.</div>'}</div></section>
      <section class="sprite-production-section"><div class="section-title">F · ANIMATION CLIPS</div><div class="sprite-action-row"><label>Generation mode<select data-wave-mode aria-label="Wave prompt generation mode">${optionMarkup(WAVE_PROMPT_MODES.map(mode=>[mode,mode==='sequential_frames'?'Sequential Frames (Recommended)':'Sprite Sheet (4×2)']),promptSession.mode)}</select></label>${promptSession.mode==='sequential_frames'?`<label>Prompt frame<select data-wave-prompt-frame>${WAVE_FRAME_DEFINITIONS.map((item,i)=>`<option value="${i}"${i===promptFrameIndex?' selected':''}>Frame ${i+1}</option>`).join('')}</select></label><span>Action: ${esc(WAVE_FRAME_DEFINITIONS[promptFrameIndex].action)}</span>`:''}<label>Clip<select aria-label="Sprite animation clip"><option value="wave">Wave · eight frames</option></select></label><button type="button" class="export-button" data-action="sprite-generate-wave-prompt">Generate Wave Frame Prompt</button><button type="button" class="tool-chip" data-action="sprite-copy-wave-prompt"${clipPrompt?'':' disabled'}>Copy Prompt</button></div><div class="sprite-diagnostics"><b>Reference checklist</b><div>Master: ${referenceState?.master.available?'approved':'approval required'}</div><div>Greet: ${referenceState?.greet.available?'approved/current':'approval required'}</div>${promptFrameIndex?`<div class="sprite-diagnostic ${referenceState?.previous.available?'success':'warning'}">Previous accepted frame: ${referenceState?.previous.available?'available':'unavailable; prompt is preparation only'}</div>`:''}${promptContext?.warnings?.length?`<div class="sprite-diagnostic warning">${esc(promptContext.warnings.join(' '))}</div>`:''}</div><textarea data-wave-prompt readonly rows="12" placeholder="Generate the Wave prompt after approving Master and Greet.">${esc(clipPrompt)}</textarea><p class="field-help">Attach the approved Master Character image and approved Greet pose image manually. The app does not send images to ChatGPT. The prompt targets 2048×1024 (4×2 cells, 512×512 each); the importer accepts other sizes when they divide evenly into four columns and two rows. Separate PNGs can be assigned to numbered slots below.</p><div class="sprite-action-row"><button type="button" class="tool-chip" data-action="sprite-import-wave-sheet"${master.status==='approved'?'':' disabled'}>Import 4×2 Sprite Sheet</button><input type="file" accept="image/png,.png" data-file-wave-sheet hidden><span>Or import individual frames by their numbered slot:</span></div><div class="sprite-action-row">${Array.from({length:8},(_,i)=>`<label class="tool-chip">Frame ${i+1}<input type="file" accept="image/png,.png" data-file-wave-frame="${i}" hidden></label>`).join('')}</div><div class="sprite-alignment-grid"><div><div class="sprite-preview-stage sprite-production-stage"><canvas data-wave-preview width="512" height="512" aria-label="Wave clip frame preview"></canvas></div><p class="field-help" data-wave-status>Frame ${frameIndex+1} of ${clip.frame_count} · ${clipFrame?.asset_id?'Imported':'Missing'}</p><div class="sprite-action-row"><button type="button" class="tool-chip" data-action="sprite-wave-step" data-direction="-1">Previous Frame</button><button type="button" class="tool-chip" data-action="sprite-wave-play">${clipPreview.playing?'Pause':'Play'}</button><button type="button" class="tool-chip" data-action="sprite-wave-stop">Stop</button><button type="button" class="tool-chip" data-action="sprite-wave-step" data-direction="1">Next Frame</button></div><input type="range" min="0" max="7" step="1" value="${frameIndex}" data-wave-frame aria-label="Wave frame"><input type="range" min="0" max="${clip.frame_count/(clipPreview.fps||clip.fps)}" step=".01" value="${clipPreview.time_seconds||0}" data-wave-seek aria-label="Seek Wave timeline"><output data-wave-time>${(clipPreview.time_seconds||0).toFixed(2)} s · frame ${frameIndex+1}</output><label>FPS <input type="number" min="1" max="30" step="1" value="${clipPreview.fps||clip.fps}" data-wave-fps></label><label><input type="checkbox" data-wave-loop${clipPreview.loop??clip.loop?' checked':''}> Loop</label></div><div class="sprite-alignment-controls"><b>Frame ${frameIndex+1} registration</b><label>Anchor X <input type="range" min="0" max="1" step=".005" value="${clipFrame?.anchor.x??.5}" data-wave-alignment="anchor_x"></label><label>Anchor Y <input type="range" min="0" max="1" step=".005" value="${clipFrame?.anchor.y??.92}" data-wave-alignment="anchor_y"></label><label>X offset <input type="range" min="-.25" max=".25" step=".005" value="${clipFrame?.alignment.offset_x??0}" data-wave-alignment="offset_x"></label><label>Y offset <input type="range" min="-.25" max=".25" step=".005" value="${clipFrame?.alignment.offset_y??0}" data-wave-alignment="offset_y"></label><label>Uniform scale <input type="range" min=".5" max="2" step=".01" value="${clipFrame?.alignment.scale??1}" data-wave-alignment="scale"></label><button type="button" class="tool-chip" data-action="sprite-wave-reset-alignment">Reset Frame Alignment</button><div class="sprite-action-row"><button type="button" class="tool-chip" data-action="sprite-accept-wave-frame"${clipFrame?.asset_id?'':' disabled'}>Accept Current Frame</button><span>Frame review: ${esc(clipFrame?.review_status||'needs_review')}</span></div><label><input type="checkbox" data-wave-review> I reviewed all eight frames, consistency, transparency and alignment.</label><div class="sprite-action-row"><button type="button" class="tool-chip" data-action="sprite-approve-wave"${clipDiagnostics.some(item=>item.severity==='error')?' disabled':''}>Approve Wave Clip</button><button type="button" class="tool-chip" data-action="sprite-reject-wave">Reject Clip</button><span>${esc(clip.approval_status)} · revision ${clip.revision}</span></div><div class="sprite-diagnostics">${clipDiagnostics.length?clipDiagnostics.map(item=>`<div class="sprite-diagnostic ${esc(item.severity)}"><b>${esc(item.code)}</b>: ${esc(item.message)}</div>`).join(''):'<div class="sprite-diagnostic success">No structural issues. Review the artwork manually before approval.</div>'}</div></div></div></section>
      <div class="character-editor-actions"><span class="character-save-status" data-region="save-status">${this.saving?'Saving…':this.error?esc(this.error):''}</span><button type="button" class="tool-chip" data-action="discard"${dirty?'':' disabled'}>Discard</button><button type="button" class="export-button" data-action="save"${dirty&&!this.saving?'':' disabled'}>Save draft</button></div></div>`;
    this.renderSpritePublishingPanel(host,definition,dirty);
    const token=++this.spriteRenderToken;void this.renderSpriteMasterPreview(host,definition,token);void this.renderSpriteCanvas(host,definition,pose,options,token);void this.renderSpriteWaveFrame(clip,frameIndex);void this.validateSpriteWaveAssets(clip);
  }

  renderSpritePublishingPanel(host,sprite,dirty){
    const id=this.current.character_id,stored=this.spritePublishValidationByCharacter.get(id),signature=JSON.stringify(sprite),fresh=stored?.signature===signature,report=fresh?stored.validation:null,versions=[...(this.current.published_versions||[])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),selected=this.spritePublishedPreviewByCharacter.get(id)||{},loaded=selected.version?this.spritePublishedVersionByCharacter.get(id)?.get(selected.version):null,snapshot=loaded?.sprite_snapshot,errors=report?.blocking_errors||[],warnings=report?.warnings||[],excluded=report?.excluded_clips||[];
    const versionOptions=versions.map(version=>`<option value="${esc(version)}"${version===selected.version?' selected':''}>v${esc(version)}</option>`).join(''),poseOptions=(snapshot?.poses||[]).map(pose=>`<option value="${esc(pose.pose_id)}"${pose.pose_id===(selected.pose_id||snapshot.default_pose_id)?' selected':''}>${esc(pose.label)} · ${esc(pose.pose_id)}</option>`).join(''),clipOptions=(snapshot?.clips||[]).map(clip=>`<option value="${esc(clip.clip_id)}"${clip.clip_id===(selected.clip_id||'')?' selected':''}>${esc(clip.label)} · ${esc(clip.clip_id)}</option>`).join(''),clip=snapshot?.clips?.find(item=>item.clip_id===(selected.clip_id||'')),duration=clip?clip.frames.reduce((sum,frame)=>sum+(frame.duration_seconds??1/clip.fps),0):0;
    const markup=`<section class="sprite-production-section"><div class="section-title">G · VALIDATE & PUBLISH SPRITE</div><p class="field-help">Save the current draft before validation and publishing. Published versions are immutable snapshots with their own asset references.</p><div class="sprite-action-row"><button type="button" class="tool-chip" data-action="sprite-validate-publish"${dirty?' disabled':''}>Validate Sprite</button><button type="button" class="export-button" data-action="sprite-publish-version"${dirty||!fresh||!report?.valid?' disabled':''}>Publish Version</button><span>${fresh?report.valid?'Validation passed':'Validation blocked':dirty?'Draft has unsaved changes.':'Not validated for publishing.'}</span></div>${fresh?`<div class="sprite-diagnostics">${errors.length?`<b>Blocking errors</b>${errors.map(item=>`<div class="sprite-diagnostic error">${esc(item)}</div>`).join('')}`:''}${warnings.length?`<b>Warnings</b>${warnings.map(item=>`<div class="sprite-diagnostic warning">${esc(item)}</div>`).join('')}`:''}${report.excluded_poses?.length?`<b>Excluded poses</b>${report.excluded_poses.map(item=>`<div class="sprite-diagnostic warning">${esc(item.pose_id)}: ${esc(item.reason)}</div>`).join('')}`:''}${excluded.length?`<b>Optional clips excluded</b>${excluded.map(item=>`<div class="sprite-diagnostic warning">${esc(item.clip_id)}: ${esc(item.reason)}</div>`).join('')}<label><input type="checkbox" data-publish-exclude-clips> I explicitly approve publishing without these invalid or unapproved clips.</label>`:''}</div>`:''}<div class="sprite-published-preview"><div class="section-title">PUBLISHED VERSIONS · ${versions.length}</div><div class="sprite-action-row"><label>Version<select data-published-version${versions.length?'':' disabled'}><option value="">${versions.length?'Select version':'No published versions'}</option>${versionOptions}</select></label><button type="button" class="tool-chip" data-action="sprite-load-published"${versions.length?'':' disabled'}>Open Read-only Version</button></div>${snapshot?`<p>v${esc(snapshot.version)} · published ${esc(snapshot.published_at)} · Master revision ${esc(snapshot.master.revision)} · ${snapshot.poses.length} poses · ${snapshot.clips.length} clips</p><div class="sprite-action-row"><label>Published pose<select data-published-pose>${poseOptions}</select></label><label>Published clip<select data-published-clip><option value="">Pose preview</option>${clipOptions}</select></label></div>${clip?`<label>Clip time <input type="range" min="0" max="${Math.max(.01,duration)}" step=".01" value="${Math.min(Number(selected.time_seconds)||0,duration)}" data-published-time><output>${Number(selected.time_seconds||0).toFixed(2)} / ${duration.toFixed(2)} s · ${clip.fps} FPS</output></label>`:''}<div class="sprite-preview-stage sprite-production-stage"><canvas data-published-sprite-preview width="512" height="512" aria-label="Read-only published Sprite preview"></canvas></div><p data-published-preview-status role="status"></p><div class="sprite-diagnostics">Validation: ${esc(snapshot.validation.status)}${snapshot.validation.warnings.map(item=>`<div class="sprite-diagnostic warning">${esc(item)}</div>`).join('')}</div>`:'<p class="character-inspector-muted">Open a published version to inspect its frozen pose and clip manifest.</p>'}</div></section>`;
    const footer=host.querySelector('.character-editor-actions');footer?.insertAdjacentHTML('beforebegin',markup);
  }

  async validateSpriteForPublish(){try{if(this.isDirty())throw new Error('Save Draft before validating a Sprite version.');const result=await this.storage.validateSpriteCharacterForPublishing(this.current.character_id);this.spritePublishValidationByCharacter.set(this.current.character_id,{signature:JSON.stringify(this.currentDraft.sprite_character),validation:result.validation});this.spriteMessage=result.validation.valid?'Sprite validation passed. Review excluded clips and warnings before publishing.':result.validation.blocking_errors.join(' ');this.renderEditor();this.renderInspector();}catch(error){this.spriteMessage=error.message;this.showStudioToast(error.message,{kind:'error'});this.renderEditor();}}
  async publishCurrentSpriteVersion(){try{if(this.isDirty())throw new Error('Save Draft before publishing.');const validationResult=await this.storage.validateSpriteCharacterForPublishing(this.current.character_id),validation=validationResult.validation;this.spritePublishValidationByCharacter.set(this.current.character_id,{signature:JSON.stringify(this.currentDraft.sprite_character),validation});if(!validation.valid)throw new Error(validation.blocking_errors.join(' '));const confirmed=Boolean(this.root.querySelector('[data-publish-exclude-clips]')?.checked);if(validation.requires_clip_exclusion_confirmation&&!confirmed){this.renderEditor();throw new Error('Review the excluded clips and explicitly check the confirmation before publishing.');}const version=await this.storage.publishSpriteCharacterVersion({character_id:this.current.character_id,excludeInvalidClips:confirmed});this.current=await this.storage.getCharacter(this.current.character_id);this.spritePublishedPreviewByCharacter.set(this.current.character_id,{version:version.version,pose_id:version.sprite_snapshot.default_pose_id,clip_id:'',time_seconds:0});await this.loadPublishedSpriteVersion(version.version);this.spriteMessage=`Sprite v${version.version} published as an immutable version.`;this.showStudioToast(this.spriteMessage);this.renderEditor();this.renderInspector();}catch(error){this.spriteMessage=error.message;this.showStudioToast(error.message,{kind:'error'});if(error.cause?.validation)this.spritePublishValidationByCharacter.set(this.current.character_id,{signature:JSON.stringify(this.currentDraft.sprite_character),validation:error.cause.validation});this.renderEditor();this.renderInspector();}}
  async loadPublishedSpriteVersion(version){if(!this.current||!version)return;try{const record=await this.storage.getCharacterVersion(this.current.character_id,version);if(!record)throw new Error(`Published version ${version} is unavailable.`);if(record.diagnostics?.length)throw new Error(record.diagnostics.map(item=>item.message).join(' '));let cache=this.spritePublishedVersionByCharacter.get(this.current.character_id);if(!cache){cache=new Map();this.spritePublishedVersionByCharacter.set(this.current.character_id,cache);}cache.set(String(version),record);const snapshot=record.sprite_snapshot,old=this.spritePublishedPreviewByCharacter.get(this.current.character_id)||{};this.spritePublishedPreviewByCharacter.set(this.current.character_id,{...old,version:String(version),pose_id:snapshot.default_pose_id,clip_id:'',time_seconds:0});this.renderEditor();await this.renderPublishedSpritePreview();}catch(error){this.spriteMessage=error.message;this.showStudioToast(error.message,{kind:'error'});this.renderEditor();}}
  async renderPublishedSpritePreview(){const selection=this.spritePublishedPreviewByCharacter.get(this.current?.character_id),record=selection?.version&&this.spritePublishedVersionByCharacter.get(this.current.character_id)?.get(selection.version),canvas=this.root.querySelector('[data-published-sprite-preview]'),context=canvas?.getContext('2d'),snapshot=record?.sprite_snapshot;if(!canvas||!context||!snapshot)return;context.clearRect(0,0,canvas.width,canvas.height);let frame,pose;if(selection.clip_id){const clip=snapshot.clips.find(item=>item.clip_id===selection.clip_id);if(clip){const evaluated=evaluateSpriteClip({...clip,character_id:snapshot.character_id},Number(selection.time_seconds)||0);frame=evaluated.frame;}}else{pose=snapshot.poses.find(item=>item.pose_id===selection.pose_id)||snapshot.poses.find(item=>item.pose_id===snapshot.default_pose_id);if(pose)frame=pose;}const asset_id=frame?.asset_id,status=this.root.querySelector('[data-published-preview-status]');if(!asset_id){if(status)status.textContent='Selected published artwork is unavailable.';return;}const blob=record.assets.get(asset_id);if(!blob){if(status)status.textContent=`Published asset ${asset_id} is missing.`;return;}const image=new Image(),url=URL.createObjectURL(blob);try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Published PNG could not be decoded.'));image.src=url;});const placement=resolveSpriteDrawPlacement({width:image.naturalWidth,height:image.naturalHeight,anchor:frame.anchor,alignment:frame.alignment,stageWidth:canvas.width,stageHeight:canvas.height});context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,placement.left,placement.top,placement.width,placement.height);if(status)status.textContent=`Read-only v${snapshot.version} · ${selection.clip_id?`${selection.clip_id} frame ${frame.frame_index+1}`:pose.label} · source asset ${asset_id}`;}catch(error){if(status)status.textContent=error.message;}finally{URL.revokeObjectURL(url);}}

  async spriteAssetBlob(assetId){const pending=this.pendingArtworkAssets.get(this.current?.character_id)||new Map();if(pending.has(assetId))return pending.get(assetId);const stored=await this.storage.getAsset(assetId);if(!stored)throw new Error('Managed sprite image is missing from Character Library storage.');return stored.blob;}
  async renderSpriteMasterPreview(host,definition,token){const master=definition.master;if(!master.asset_id)return;try{const blob=await this.spriteAssetBlob(master.asset_id);if(token!==this.spriteRenderToken||!host.isConnected)return;const preview=host.querySelector('[data-sprite-master-preview]'),empty=host.querySelector('[data-sprite-master-empty]'),url=URL.createObjectURL(blob);preview.onload=()=>{URL.revokeObjectURL(url);if(empty)empty.hidden=true;};preview.onerror=()=>{URL.revokeObjectURL(url);if(empty){empty.hidden=false;empty.textContent='Master image could not be decoded for preview.';}};preview.src=url;preview.hidden=false;}catch(error){const empty=host.querySelector('[data-sprite-master-empty]');if(empty){empty.hidden=false;empty.textContent=error.message;}}}
  async renderSpriteCanvas(host,definition,selectedPose,options,token){const canvas=host.querySelector('[data-sprite-preview]'),context=canvas?.getContext('2d');if(!canvas||!context)return;context.clearRect(0,0,canvas.width,canvas.height);context.save();context.strokeStyle='#7d8b9c';context.setLineDash([5,4]);context.beginPath();context.moveTo(0,canvas.height*.92);context.lineTo(canvas.width,canvas.height*.92);context.stroke();context.restore();const visiblePose=options.toggleIdle?(definition.poses.find(item=>item.pose_id==='idle')||selectedPose):selectedPose;try{if(options.ghost&&selectedPose.pose_id!=='idle'){const idle=definition.poses.find(item=>item.pose_id==='idle');if(idle)await this.drawSpritePoseOnCanvas(context,idle,canvas,.24,options.bounds);}if(token!==this.spriteRenderToken)return;await this.drawSpritePoseOnCanvas(context,visiblePose,canvas,1,options.bounds);if(token!==this.spriteRenderToken)return;const status=host.querySelector('[data-sprite-status]');if(status)status.textContent=`${visiblePose.label} · ${visiblePose.demo?'CP4.1 demo artwork':visiblePose.asset_id?'managed PNG':'image not imported'} · shared ground baseline · preview transforms do not alter source pixels.`;}catch(error){const status=host.querySelector('[data-sprite-status]');if(status)status.textContent=error.message;}}
  async drawSpritePoseOnCanvas(context,pose,canvas,opacity=1,showBounds=false){let imageSource;let url=null;if(pose.asset_id){const blob=await this.spriteAssetBlob(pose.asset_id);url=URL.createObjectURL(blob);imageSource=new Image();}else imageSource=new Image();try{await new Promise((resolve,reject)=>{imageSource.onload=resolve;imageSource.onerror=()=>reject(new Error(pose.asset_id?'Could not decode the stored pose image.':`Could not load demo pose ${pose.pose_id}.`));imageSource.src=url||pose.asset_ref;});const width=imageSource.naturalWidth||imageSource.width,height=imageSource.naturalHeight||imageSource.height,placement=resolveSpriteDrawPlacement({width,height,anchor:pose.anchor||{x:pose.anchor_x/pose.width,y:pose.anchor_y/pose.height},alignment:pose.alignment,stageWidth:canvas.width,stageHeight:canvas.height});context.save();context.globalAlpha=opacity;context.drawImage(imageSource,placement.left,placement.top,placement.width,placement.height);if(showBounds){context.strokeStyle=opacity<1?'#73d7ff':'#ffe08a';context.setLineDash([4,3]);context.strokeRect(placement.left,placement.top,placement.width,placement.height);}context.restore();return placement;}finally{if(url)URL.revokeObjectURL(url);}}

  generateSpriteMasterPrompt(){try{const prompt=buildSpriteMasterPrompt(this.currentDraft.sprite_character.identity);const state=this.spritePromptsByCharacter.get(this.current.character_id)||{poses:{}};state.master=prompt;this.spritePromptsByCharacter.set(this.current.character_id,state);const output=this.root.querySelector('[data-sprite-master-prompt]');if(output)output.value=prompt;const copy=this.root.querySelector('[data-action="sprite-copy-master-prompt"]');if(copy)copy.disabled=false;this.spriteMessage='Master prompt generated locally. Copy it into ChatGPT; attach artwork manually after creation.';this.showStudioToast('Master prompt generated.');}catch(error){this.spriteMessage=error.message;this.showStudioToast(this.spriteMessage,{kind:'error'});}const message=this.root.querySelector('[data-sprite-message]');if(message)message.textContent=this.spriteMessage;}
  generateSpritePosePrompt(poseId){try{const prompt=buildSpritePosePrompt(this.currentDraft.sprite_character,poseId),state=this.spritePromptsByCharacter.get(this.current.character_id)||{master:'',poses:{}};state.poses[poseId]=prompt;this.spritePromptsByCharacter.set(this.current.character_id,state);this.spritePoseByCharacter.set(this.current.character_id,poseId);this.renderEditor();this.spriteMessage=`${poseId} prompt generated for approved Master revision ${this.currentDraft.sprite_character.master.revision}. Attach the Master manually.`;this.showStudioToast(`${poseId} prompt generated.`);}catch(error){this.spriteMessage=error.message;this.showStudioToast(this.spriteMessage,{kind:'error'});const message=this.root.querySelector('[data-sprite-message]');if(message)message.textContent=this.spriteMessage;}}
  async copySpritePrompt(type,poseId=null){const state=this.spritePromptsByCharacter.get(this.current?.character_id),prompt=type==='master'?state?.master:state?.poses?.[poseId];if(!prompt){this.showStudioToast('Generate the prompt before copying it.',{kind:'error'});return;}try{await copyPromptText(prompt,{output:this.root.querySelector(type==='master'?'[data-sprite-master-prompt]':'[data-sprite-pose-prompt]')});this.spriteMessage='Prompt copied. Attach the approved Master image yourself when generating a pose.';this.showStudioToast('Prompt copied to clipboard.');}catch(error){this.spriteMessage=`Copy failed: ${error.message}`;this.showStudioToast(this.spriteMessage,{kind:'error'});}const message=this.root.querySelector('[data-sprite-message]');if(message)message.textContent=this.spriteMessage;}
  async spriteContentAssetId(blob){if(!globalThis.crypto?.subtle)throw new Error('Web Crypto SHA-256 is required to store Sprite images safely.');const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),hex=Array.from(digest,value=>value.toString(16).padStart(2,'0')).join('');return`libsha256_${hex}`;}
  async importSpriteMasterFile(file){try{const stableBlob=await snapshotArtworkBlob(file),inspected=await inspectSpritePng(stableBlob),asset_id=await this.spriteContentAssetId(stableBlob),sprite=importSpriteMaster(this.currentDraft.sprite_character,inspected,{asset_id}),pending=this.pendingArtworkAssets.get(this.current.character_id)||new Map();pending.set(asset_id,stableBlob);this.pendingArtworkAssets.set(this.current.character_id,pending);this.currentDraft.sprite_character=sprite;this.currentDraft.asset_refs=collectSpriteAssetReferences(sprite);const prompts=this.spritePromptsByCharacter.get(this.current.character_id);if(prompts)prompts.poses={};this.spriteMessage=inspected.transparency==='transparent'?`Master imported (${inspected.width} × ${inspected.height}); review it and explicitly approve revision ${sprite.master.revision}.`:'Master imported with an opaque background. Review the warning and acknowledge it before approval.';this.error='';this.renderEditor();this.renderInspector();this.showStudioToast(inspected.transparency==='transparent'?'Master PNG imported. Review and approve it.':'Master PNG imported with an opaque background; review is required.',{kind:inspected.transparency==='transparent'?'success':'warning',duration:3800});}catch(error){this.spriteMessage=`Master import failed. Existing Master remains unchanged: ${error.message}`;this.showStudioToast(this.spriteMessage,{kind:'error',duration:4200});const message=this.root.querySelector('[data-sprite-message]');if(message)message.textContent=this.spriteMessage;}}
  async importSpritePoseFile(file,poseId){try{const stableBlob=await snapshotArtworkBlob(file),inspected=await inspectSpritePng(stableBlob),asset_id=await this.spriteContentAssetId(stableBlob),sprite=importSpritePose(this.currentDraft.sprite_character,poseId,inspected,{asset_id}),pending=this.pendingArtworkAssets.get(this.current.character_id)||new Map();pending.set(asset_id,stableBlob);this.pendingArtworkAssets.set(this.current.character_id,pending);this.currentDraft.sprite_character=sprite;this.currentDraft.asset_refs=collectSpriteAssetReferences(sprite);this.spritePoseByCharacter.set(this.current.character_id,poseId);this.spriteMessage=inspected.transparency==='transparent'?`${poseId} pose imported; align it, compare with Idle and approve after visual review.`:`${poseId} imported with an opaque background. Review and acknowledge the background before approval.`;this.error='';this.renderEditor();this.renderInspector();this.showStudioToast(inspected.transparency==='transparent'?`${poseId} PNG imported.`:`${poseId} PNG imported; review its opaque background.`,{kind:inspected.transparency==='transparent'?'success':'warning',duration:3800});}catch(error){this.spriteMessage=`${poseId} import failed. The last valid pose remains unchanged: ${error.message}`;this.showStudioToast(this.spriteMessage,{kind:'error',duration:4200});const message=this.root.querySelector('[data-sprite-message]');if(message)message.textContent=this.spriteMessage;}}

  currentSpriteWaveClip({create=true}={}){const sprite=normalizeSpriteProductionDefinition(this.currentDraft.sprite_character);let clip=sprite.clips.find(item=>item.clip_id==='wave');if(!clip&&create)clip=createWaveClip(this.current.character_id,sprite.master.revision,{sourcePoseId:'greet',sourcePoseAssetId:sprite.poses.find(p=>p.pose_id==='greet')?.asset_id||null});return{sprite,clip};}
  saveSpriteWaveClip(clip){const sprite=normalizeSpriteProductionDefinition(this.currentDraft.sprite_character),clips=sprite.clips.filter(item=>item.clip_id!==clip.clip_id);clips.push(clip);this.currentDraft.sprite_character={...sprite,clips};this.currentDraft.asset_refs=collectSpriteAssetReferences(this.currentDraft.sprite_character);this.renderEditor();}
  generateSpriteWavePrompt(){try{const {sprite,clip}=this.currentSpriteWaveClip();const session=this.spriteClipPromptSessionsByCharacter.get(this.current.character_id)||{mode:'sequential_frames',frame_index:0};this.spriteClipPromptSessionsByCharacter.set(this.current.character_id,session);const context=session.mode==='sprite_sheet'?{prompt:buildWaveFramePrompt(sprite,this.current.character_id),all_references_available:true,warnings:[],references:[]}:buildWaveSequentialFramePrompt(sprite,clip,session.frame_index,this.current.character_id);this.spriteClipPromptsByCharacter.set(this.current.character_id,context.prompt);this.spriteClipPromptContextsByCharacter.set(this.current.character_id,context);this.spriteMessage=context.warnings.length?'Prompt is a preparation draft; previous accepted frame reference is unavailable.':'Wave prompt generated locally. Attach references manually.';this.renderEditor();}catch(error){this.spriteMessage=error.message;this.renderEditor();}}
  reviewSpriteWaveFrame(status){try{const index=Number(this.root.querySelector('[data-wave-frame]')?.value||0),{clip}=this.currentSpriteWaveClip({create:false});if(!clip)throw new Error('Import this frame before reviewing it.');this.saveSpriteWaveClip(setSpriteClipFrameReview(clip,index,status));this.spriteMessage='Frame '+(index+1)+' marked '+status+'.';this.renderEditor();}catch(error){this.spriteMessage=error.message;this.renderEditor();}}
  async copySpriteWavePrompt(){const prompt=this.spriteClipPromptsByCharacter.get(this.current.character_id);if(!prompt)return;try{await navigator.clipboard.writeText(prompt);this.showStudioToast('Wave prompt copied.');}catch{this.showStudioToast('Clipboard access is unavailable. Select and copy the Wave prompt manually.',{kind:'warning'});}}
  async importSpriteWaveSheet(file){try{const sheetResult=await sliceSpriteSheet(file,{inspectPng:inspectSpritePng});if(sheetResult.frames.length!==8)throw new Error('Wave import requires exactly eight cells in a 4×2 grid.');const pending=new Map(this.pendingArtworkAssets.get(this.current.character_id)||[]),frames=[];for(const frame of sheetResult.frames){const asset_id=await this.spriteContentAssetId(frame.blob);pending.set(asset_id,frame.blob);frames.push({frame_index:frame.frame_index,asset_id,width:frame.width,height:frame.height,anchor:{x:.5,y:.92},alignment:{offset_x:0,offset_y:0,scale:1},transparency:frame.transparency});}const {clip}=this.currentSpriteWaveClip();clip.frames=frames;clip.validation_status='valid';clip.approval_status='needs_review';clip.revision+=1;this.pendingArtworkAssets.set(this.current.character_id,pending);this.saveSpriteWaveClip(clip);const opaque=sheetResult.frames.some(frame=>frame.transparency==='opaque');this.spriteMessage=`Imported eight frames in left-to-right, top-row-first order (${sheetResult.sheet.cell_width}×${sheetResult.sheet.cell_height} each).${opaque?' One or more cells are opaque; no background pixels were removed. Review explicitly before approval.':''}`;this.renderEditor();}catch(error){this.spriteMessage=`Sprite sheet import failed; existing Wave frames were preserved: ${error.message}`;this.renderEditor();}}
  async importSpriteWaveFrame(file,index){try{const stableBlob=await snapshotArtworkBlob(file),inspected=await inspectSpritePng(stableBlob),asset_id=await this.spriteContentAssetId(stableBlob),pending=this.pendingArtworkAssets.get(this.current.character_id)||new Map();pending.set(asset_id,stableBlob);this.pendingArtworkAssets.set(this.current.character_id,pending);let {clip}=this.currentSpriteWaveClip();const frame={frame_index:index,asset_id,width:inspected.width,height:inspected.height,anchor:{x:.5,y:.92},alignment:{offset_x:0,offset_y:0,scale:1},transparency:inspected.transparency};clip=replaceSpriteClipFrame(clip,frame);this.saveSpriteWaveClip(clip);this.spriteMessage=`Frame ${index+1} imported into its explicitly numbered slot.${inspected.transparency==='opaque'?' Background is opaque and was not removed.':''}`;this.renderEditor();}catch(error){this.spriteMessage=`Frame ${index+1} import failed; the previous frame was preserved: ${error.message}`;this.renderEditor();}}
  async approveSpriteWaveClip(){try{if(!this.root.querySelector('[data-wave-review]')?.checked)throw new Error('Review all frames and confirm before approval.');const {sprite,clip}=this.currentSpriteWaveClip({create:false});if(!clip)throw new Error('Import all eight Wave frames before approval.');for(const frame of clip.frames){if(!frame.asset_id)throw new Error(`Frame ${frame.frame_index+1} is missing.`);const staged=this.pendingArtworkAssets.get(this.current.character_id)?.get(frame.asset_id),blob=staged||(await this.storage.getAsset(frame.asset_id))?.blob;if(!blob)throw new Error(`Frame ${frame.frame_index+1} asset is missing or invalid.`);const inspected=await inspectSpritePng(blob);if(inspected.width!==frame.width||inspected.height!==frame.height)throw new Error(`Frame ${frame.frame_index+1} dimensions do not match the stored asset.`);}this.saveSpriteWaveClip(approveSpriteClip(clip,sprite,{userReviewed:true}));this.spriteMessage='Wave clip approved after explicit review. Save Draft to persist it.';this.renderEditor();}catch(error){this.spriteMessage=error.message;this.renderEditor();}}
  updateSpriteWaveAlignment(control){try{const index=Number(this.root.querySelector('[data-wave-frame]')?.value||0),{clip}=this.currentSpriteWaveClip({create:false});if(!clip?.frames[index]?.asset_id)throw new Error('Import this frame before adjusting its alignment.');const frame=clip.frames[index],key=control.dataset.waveAlignment,value=Number(control.value),alignment={...frame.alignment},anchor={...frame.anchor};if(key==='anchor_x')anchor.x=value;else if(key==='anchor_y')anchor.y=value;else alignment[key]=value;const updated=setSpriteFrameAlignment(clip,index,{anchor,...alignment});this.saveSpriteWaveClip(updated);}catch(error){this.spriteMessage=error.message;this.renderEditor();}}
  resetSpriteWaveFrameAlignment(){try{const index=Number(this.root.querySelector('[data-wave-frame]')?.value||0),{clip}=this.currentSpriteWaveClip({create:false});if(!clip?.frames[index]?.asset_id)throw new Error('Import this frame before resetting alignment.');const updated=setSpriteFrameAlignment(clip,index,{anchor:{x:.5,y:.92},offset_x:0,offset_y:0,scale:1});this.saveSpriteWaveClip(updated);}catch(error){this.spriteMessage=error.message;this.renderEditor();}}
  updateSpriteWaveFps(control){try{const {clip}=this.currentSpriteWaveClip({create:false});if(!clip)throw new Error('Import Wave frames before changing FPS.');clip.fps=Number(control.value);clip.approval_status='needs_review';clip.revision+=1;const preview=this.spriteClipPreviewByCharacter.get(this.current.character_id)||{};this.spriteClipPreviewByCharacter.set(this.current.character_id,{...preview,fps:clip.fps,time_seconds:(preview.frame_index||0)/clip.fps});this.saveSpriteWaveClip(clip);}catch(error){this.spriteMessage=error.message;this.renderEditor();}}
  updateSpriteWaveLoop(loop){const {clip}=this.currentSpriteWaveClip();clip.loop=Boolean(loop);clip.approval_status='needs_review';clip.revision+=1;const preview=this.spriteClipPreviewByCharacter.get(this.current.character_id)||{};this.spriteClipPreviewByCharacter.set(this.current.character_id,{...preview,loop:Boolean(loop)});this.saveSpriteWaveClip(clip);}
  rejectSpriteWaveClip(){const {clip}=this.currentSpriteWaveClip();clip.approval_status='rejected';clip.revision+=1;this.saveSpriteWaveClip(clip);this.spriteMessage='Wave clip rejected. Replace frames or revise alignment, then review again.';this.renderEditor();}
  stepSpriteWaveFrame(direction){this.stopSpriteWavePlayback();const {clip}=this.currentSpriteWaveClip(),old=this.spriteClipPreviewByCharacter.get(this.current.character_id)||{frame_index:0,fps:clip.fps},frame_index=Math.max(0,Math.min(clip.frame_count-1,(old.frame_index||0)+direction));this.spriteClipPreviewByCharacter.set(this.current.character_id,{...old,frame_index,time_seconds:frame_index/(old.fps||clip.fps),playing:false});this.renderEditor();}
  stopSpriteWavePlayback({reset=false}={}){cancelAnimationFrame(this.spriteWaveRaf);const preview=this.spriteClipPreviewByCharacter.get(this.current?.character_id);if(preview){const next={...preview,playing:false};if(reset){next.time_seconds=0;next.frame_index=0;}this.spriteClipPreviewByCharacter.set(this.current.character_id,next);if(reset)this.renderEditor();}}
  seekSpriteWave(time){const {clip}=this.currentSpriteWaveClip(),preview=this.spriteClipPreviewByCharacter.get(this.current.character_id)||{fps:clip.fps,loop:clip.loop},fps=preview.fps||clip.fps,at=evaluateSpriteClip({...clip,loop:preview.loop??clip.loop},time,{fps,loop:preview.loop??clip.loop}),frame_index=at.frame_index??0;this.spriteClipPreviewByCharacter.set(this.current.character_id,{...preview,time_seconds:time,frame_index,playing:false});this.stopSpriteWavePlayback();const button=this.root.querySelector('[data-action="sprite-wave-play"]');if(button)button.textContent='Play';const slider=this.root.querySelector('[data-wave-frame]');if(slider)slider.value=String(frame_index);const display=this.root.querySelector('[data-wave-time]');if(display)display.textContent=`${time.toFixed(2)} s · frame ${frame_index+1}`;void this.renderSpriteWaveFrame(clip,frame_index);}
  toggleSpriteWavePlayback(){const {clip}=this.currentSpriteWaveClip({create:false});if(!clip?.frames.some(frame=>frame.asset_id)){this.spriteMessage='Import at least one frame to preview the Wave clip.';this.renderEditor();return;}const preview=this.spriteClipPreviewByCharacter.get(this.current.character_id)||{frame_index:0,fps:clip.fps,loop:clip.loop,time_seconds:0};if(preview.playing){const time=(performance.now()-preview.started_at)/1000+(preview.time_seconds||0);this.spriteClipPreviewByCharacter.set(this.current.character_id,{...preview,playing:false,time_seconds:time});cancelAnimationFrame(this.spriteWaveRaf);this.renderEditor();return;}const startTime=performance.now(),baseTime=preview.time_seconds||0,fps=preview.fps||clip.fps;this.spriteClipPreviewByCharacter.set(this.current.character_id,{...preview,playing:true,started_at:startTime});const tick=now=>{const current=this.spriteClipPreviewByCharacter.get(this.current.character_id);if(!current?.playing)return;const time=baseTime+(now-startTime)/1000,at=evaluateSpriteClip({...clip,loop:current.loop??clip.loop},time,{fps,loop:current.loop??clip.loop}),index=at.frame_index??clip.frame_count-1;this.spriteClipPreviewByCharacter.set(this.current.character_id,{...current,time_seconds:time,frame_index:index});const slider=this.root.querySelector('[data-wave-frame]');if(slider)slider.value=String(index);const seek=this.root.querySelector('[data-wave-seek]');if(seek)seek.value=String(Math.min(Number(seek.max),time));const display=this.root.querySelector('[data-wave-time]');if(display)display.textContent=`${time.toFixed(2)} s · frame ${index+1}`;if(index!==current.frame_index)void this.renderSpriteWaveFrame(clip,index);if(at.finished){this.stopSpriteWavePlayback();const button=this.root.querySelector('[data-action="sprite-wave-play"]');if(button)button.textContent='Play';return;}this.spriteWaveRaf=requestAnimationFrame(tick);};this.spriteWaveRaf=requestAnimationFrame(tick);const button=this.root.querySelector('[data-action="sprite-wave-play"]');if(button)button.textContent='Pause';}
  async validateSpriteWaveAssets(clip){if(!clip.frames.some(frame=>frame.asset_id))return;const characterId=this.current.character_id,signature=`${clip.revision}:${clip.frames.map(frame=>frame.asset_id||'-').join(',')}`,old=this.spriteClipAssetChecksByCharacter.get(characterId);if(old?.signature===signature)return;this.spriteClipAssetChecksByCharacter.set(characterId,{signature,invalid:[],checking:true});const invalid=[];for(const frame of clip.frames){if(!frame.asset_id)continue;try{const pending=this.pendingArtworkAssets.get(characterId)?.get(frame.asset_id),blob=pending||(await this.storage.getAsset(frame.asset_id))?.blob;if(!blob)throw new Error('Missing');const inspected=await inspectSpritePng(blob);if(inspected.width!==frame.width||inspected.height!==frame.height)throw new Error('Dimension mismatch');}catch{invalid.push(frame.asset_id);}}this.spriteClipAssetChecksByCharacter.set(characterId,{signature,invalid,checking:false});if(this.current?.character_id===characterId)this.renderEditor();}
  async renderSpriteWaveFrame(clip,index){const canvas=this.root.querySelector('[data-wave-preview]'),status=this.root.querySelector('[data-wave-status]'),context=canvas?.getContext('2d');if(!canvas||!context)return;const token=++this.spriteWaveRenderToken,frame=clip.frames[index];context.clearRect(0,0,canvas.width,canvas.height);if(!frame?.asset_id){if(status)status.textContent=`Frame ${index+1} is missing. Incomplete clips can be inspected, but are not production-ready.`;return;}try{let cache=this.spriteClipImageCacheByCharacter.get(this.current.character_id);if(!cache){cache=new Map();this.spriteClipImageCacheByCharacter.set(this.current.character_id,cache);}let image=cache.get(frame.asset_id);if(!image){const pending=this.pendingArtworkAssets.get(this.current.character_id)||new Map(),blob=pending.get(frame.asset_id)|| (await this.storage.getAsset(frame.asset_id))?.blob;if(!blob)throw new Error('Managed frame image is missing.');const url=URL.createObjectURL(blob);image=new Image();try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Could not decode frame PNG.'));image.src=url;});}finally{URL.revokeObjectURL(url);}cache.set(frame.asset_id,image);}if(token!==this.spriteWaveRenderToken)return;const placement=resolveSpriteDrawPlacement({width:image.naturalWidth,height:image.naturalHeight,anchor:frame.anchor,alignment:frame.alignment,stageWidth:canvas.width,stageHeight:canvas.height});context.drawImage(image,placement.left,placement.top,placement.width,placement.height);if(status)status.textContent=`Frame ${index+1} of ${clip.frame_count} · ${frame.width}×${frame.height} · ${frame.transparency} · original pixels retained.`;}catch(error){if(status)status.textContent=`Frame ${index+1} diagnostic: ${error.message}`;}}
  approveCurrentSpriteMaster(){try{const reviewOpaque=Boolean(this.root.querySelector('[data-sprite-master-opaque-review]')?.checked);this.currentDraft.sprite_character=approveSpriteMaster(this.currentDraft.sprite_character,{reviewOpaque});this.currentDraft.asset_refs=collectSpriteAssetReferences(this.currentDraft.sprite_character);this.spriteMessage=`Master revision ${this.currentDraft.sprite_character.master.revision} approved. Pose prompts now reference this revision.`;this.renderEditor();this.renderInspector();this.showStudioToast('Master Character approved.');}catch(error){this.spriteMessage=error.message;this.showStudioToast(this.spriteMessage,{kind:'error'});const message=this.root.querySelector('[data-sprite-message]');if(message)message.textContent=this.spriteMessage;}}
  approveCurrentSpritePose(poseId){try{this.currentDraft.sprite_character=approveSpritePose(this.currentDraft.sprite_character,poseId);this.currentDraft.asset_refs=collectSpriteAssetReferences(this.currentDraft.sprite_character);this.spriteMessage=`${poseId} approved for Master revision ${this.currentDraft.sprite_character.master.revision}. Save the draft to persist the review.`;this.renderEditor();this.renderInspector();this.showStudioToast(`${poseId} pose approved. Remember to save the draft.`);}catch(error){this.spriteMessage=error.message;this.showStudioToast(this.spriteMessage,{kind:'error'});const message=this.root.querySelector('[data-sprite-message]');if(message)message.textContent=this.spriteMessage;}}
  rejectCurrentSpritePose(poseId){const pose=this.currentDraft.sprite_character.poses.find(item=>item.pose_id===poseId);if(!pose)return;pose.review_status='rejected';this.spriteMessage=`${poseId} marked Replace Required. Import a replacement image to continue.`;this.renderEditor();}
  resetCurrentSpriteAlignment(){const pose=this.currentDraft.sprite_character.poses.find(item=>item.pose_id===this.spritePoseByCharacter.get(this.current.character_id)||item.pose_id===this.currentDraft.sprite_character.default_pose_id);if(!pose)return;pose.alignment=resetSpriteAlignment();pose.anchor={x:.5,y:.94};pose.anchor_x=pose.width*.5;pose.anchor_y=pose.height*.94;this.renderEditor();}
  toggleSpriteComparison(){const options=this.spritePreviewOptionsByCharacter.get(this.current.character_id)||{ghost:false,bounds:false,toggleIdle:false};options.ghost=!options.ghost;this.spritePreviewOptionsByCharacter.set(this.current.character_id,options);this.renderEditor();}
  toggleSpriteIdlePreview(){const options=this.spritePreviewOptionsByCharacter.get(this.current.character_id)||{ghost:false,bounds:false,toggleIdle:false};options.toggleIdle=!options.toggleIdle;this.spritePreviewOptionsByCharacter.set(this.current.character_id,options);const definition=normalizeSpriteProductionDefinition(this.currentDraft.sprite_character),pose=definition.poses.find(item=>item.pose_id===this.spritePoseByCharacter.get(this.current.character_id)||item.pose_id===definition.default_pose_id);void this.renderSpriteCanvas(this.root.querySelector('[data-region="editor"]'),definition,pose,options,++this.spriteRenderToken);}
  async downloadSpriteAsset(assetId,filename){if(!assetId)return;try{const blob=await this.spriteAssetBlob(assetId),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){this.spriteMessage=error.message;const message=this.root.querySelector('[data-sprite-message]');if(message)message.textContent=this.spriteMessage;}}

  updateSpriteIdentityField(control){if(!this.currentDraft||!control.dataset.spriteIdentity)return;const definition=this.currentDraft.sprite_character;const key=control.dataset.spriteIdentity;if(key==='character_name'){definition.identity.character_name=control.value;this.currentDraft.display_name=control.value.slice(0,120);}else definition.identity[key]=control.value;if(definition.master.status==='approved'&&JSON.stringify(definition.identity)!==JSON.stringify(definition.master.identity_snapshot)){definition.master.status='needs_review';const revision=definition.master.revisions.find(item=>item.revision===definition.master.revision);if(revision)revision.status='needs_review';for(const pose of definition.poses)if(pose.asset_id)pose.review_status='needs_review';const prompts=this.spritePromptsByCharacter.get(this.current.character_id);if(prompts)prompts.poses={};}this.updateSpriteDirtyControls();}
  updateSpriteDescription(control){if(!this.currentDraft)return;this.currentDraft.description=control.value.slice(0,2000);this.updateSpriteDirtyControls();}
  updateSpriteAlignmentField(control){const pose=this.currentDraft?.sprite_character?.poses.find(item=>item.pose_id===this.spritePoseByCharacter.get(this.current.character_id)||item.pose_id===this.currentDraft.sprite_character.default_pose_id);if(!pose)return;const value=Number(control.value);if(!Number.isFinite(value))return;if(['anchor_x','anchor_y'].includes(control.dataset.spriteAlignment)){const axis=control.dataset.spriteAlignment==='anchor_x'?'x':'y';pose.anchor[axis]=value;pose.anchor_x=pose.width*pose.anchor.x;pose.anchor_y=pose.height*pose.anchor.y;}else pose.alignment={...normalizeSpriteAlignment(pose.alignment),[control.dataset.spriteAlignment]:value};const output=this.root.querySelector(`[data-sprite-output="${CSS.escape(control.dataset.spriteAlignment)}"]`);if(output)output.textContent=control.dataset.spriteAlignment==='scale'?`${value.toFixed(2)}×`:`${Math.round(value*100)}%`;this.updateSpriteDirtyControls();const host=this.root.querySelector('[data-region="editor"]'),options=this.spritePreviewOptionsByCharacter.get(this.current.character_id)||{ghost:false,bounds:false,toggleIdle:false};void this.renderSpriteCanvas(host,normalizeSpriteProductionDefinition(this.currentDraft.sprite_character),pose,options,++this.spriteRenderToken);}
  updateSpritePreviewOption(control){const options=this.spritePreviewOptionsByCharacter.get(this.current.character_id)||{ghost:false,bounds:false,toggleIdle:false};options[control.dataset.spritePreviewOption]=control.checked;this.spritePreviewOptionsByCharacter.set(this.current.character_id,options);const definition=normalizeSpriteProductionDefinition(this.currentDraft.sprite_character),pose=definition.poses.find(item=>item.pose_id===this.spritePoseByCharacter.get(this.current.character_id)||item.pose_id===definition.default_pose_id);void this.renderSpriteCanvas(this.root.querySelector('[data-region="editor"]'),definition,pose,options,++this.spriteRenderToken);}
  updateSpriteDirtyControls(){const dirty=this.isDirty(),indicator=this.root.querySelector('.character-draft-indicator'),save=this.root.querySelector('[data-action="save"]'),discard=this.root.querySelector('[data-action="discard"]');if(indicator){indicator.classList.toggle('unsaved',dirty);indicator.textContent=dirty?'Unsaved changes':'Draft saved';}if(save)save.disabled=!dirty||this.saving;if(discard)discard.disabled=!dirty;}
  updateSpriteBackgroundReview(control){const master=control.matches('[data-sprite-master-opaque-review]');if(master){const button=this.root.querySelector('[data-action="sprite-approve-master"]');if(button)button.disabled=!this.currentDraft.sprite_character.master.asset_id||this.currentDraft.sprite_character.master.transparency==='opaque'&&!control.checked;return;}const pose=this.currentDraft.sprite_character.poses.find(item=>item.pose_id===control.dataset.spriteReviewAck);if(pose){pose.background_reviewed=control.checked;const button=this.root.querySelector('[data-action="sprite-approve-pose"]');if(button)button.disabled=!pose.asset_id||pose.review_status==='approved'||this.currentDraft.sprite_character.master.status!=='approved'||pose.source_master_revision!==this.currentDraft.sprite_character.master.revision||pose.transparency==='opaque'&&!pose.background_reviewed;this.updateSpriteDirtyControls();}}
  rigEditorState() {
    const id = this.current?.character_id || 'unselected';
    if (!this.rigEditorStateByCharacter.has(id)) this.rigEditorStateByCharacter.set(id, { selectedPartId: '', layout: 'landscape', motion: 'rest', mode: 'assemble', assemblyMode: 'hybrid', time: 0, zoom: 1, panX: 0, panY: 0, skeleton: true, checkerboard: true, keepPosition: true, testJointId: 'left_upper_arm', testRotation: .35, undo: [], redo: [] });
    return this.rigEditorStateByCharacter.get(id);
  }

  getRigEditorModel() {
    if (!this.currentDraft) throw new Error('No character draft is open.');
    const rig = this.currentDraft.rig ? structuredClone(this.currentDraft.rig) : createCanonicalM1EditorRig(`rig_${this.current.character_id.slice(0, 50)}`);
    const artwork = Array.isArray(this.currentDraft.artwork_parts) ? this.currentDraft.artwork_parts : [];
    const fresh = createInitialRigEditorParts(artwork, rig, this.currentDraft.manifest), saved = new Map((this.currentDraft.rig_editor_parts || []).map(part => [part.id, part]));
    let parts = fresh.map(part => {
      const old = saved.get(part.id);
      const artworkItem=artwork.find(item=>item.part_id===part.id);return old ? { ...part, ...structuredClone(old), id: part.id, asset_id: part.asset_id, source_dimensions_px: part.source_dimensions_px, alpha: part.alpha, rig_ready_metadata:structuredClone(artworkItem?.rig_metadata||old.rig_ready_metadata||null), pivot: { ...structuredClone(old.pivot || part.pivot) }, binding: { ...part.binding, ...structuredClone(old.binding || {}) } } : {...part,rig_ready_metadata:structuredClone(artworkItem?.rig_metadata||null)};
    });
    const assemblyCandidate = this.rigEditorState().assemblyCandidate;
    if (assemblyCandidate) { parts = structuredClone(assemblyCandidate.parts); return { rig: structuredClone(assemblyCandidate.rig), parts, artwork }; }
    return { rig, parts, artwork };
  }

  getArtworkParts() { const vocabulary = this.currentDraft?.rig_editor_vocabulary; return resolveArtworkImportParts({ manifest: Array.isArray(vocabulary) && vocabulary.length ? { parts: vocabulary } : this.currentDraft?.manifest, rig: this.currentDraft?.rig }); }

  commitRigEditorParts(parts, rig = this.getRigEditorModel().rig) {
    const draft = structuredClone(this.currentDraft); draft.rig = structuredClone(rig);
    if (!Array.isArray(draft.rig_editor_vocabulary) || !draft.rig_editor_vocabulary.length) {
      try { draft.rig_editor_vocabulary = this.getArtworkParts().map(item => ({ part_id: item.part_id, role: item.role, joint_id: item.joint_id, joint_ids: item.joint_ids, required: item.required })); }
      catch { draft.rig_editor_vocabulary = []; }
    }
    draft.rig_editor_parts = structuredClone(parts);
    if (parts.length) draft.manifest = createDraftAppearanceManifest(this.current.character_id, rig, parts, draft.rig_profile || 'adult');
    this.currentDraft = draft;
  }

  async previewAutoAssembly() {
    const state=this.rigEditorState(),token=state.assemblyPreviewToken=(state.assemblyPreviewToken||0)+1,characterId=this.current.character_id;if(state.assemblyCandidate)state.assemblyCandidate=null;const model=this.getRigEditorModel(),geometryByPart={},images=await this.getRigEditorImages(model.artwork,model.parts);if(this.current?.character_id!==characterId||state.assemblyPreviewToken!==token)return;if(!state.assemblyPreviousWorking)state.assemblyPreviousWorking={rig:structuredClone(model.rig),parts:structuredClone(model.parts)};
    for(const part of model.parts){const image=images.get(part.asset_id);if(!image)continue;const max=1024,scale=Math.min(1,max/Math.max(image.width,image.height)),width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale)),surface=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):document.createElement('canvas');surface.width=width;surface.height=height;const context=surface.getContext('2d',{willReadFrequently:true});context.clearRect(0,0,width,height);context.drawImage(image,0,0,width,height);const info=analyzeAlphaGeometry({width,height,data:context.getImageData(0,0,width,height).data});if(scale<1&&info.alpha_bounds_px){const b=info.alpha_bounds_px,c=info.visible_center_px;info.alpha_bounds_px={x:Math.round(b.x/scale),y:Math.round(b.y/scale),width:Math.round(b.width/scale),height:Math.round(b.height/scale)};info.visible_center_px={x:c.x/scale,y:c.y/scale};info.source_dimensions_px={...part.source_dimensions_px};info.analysis_scale=scale;}geometryByPart[part.id]=info;}
    const candidateOptions={rig:model.rig,parts:model.parts,vocabulary:this.getArtworkParts(),geometryByPart,rigProfile:this.currentDraft.rig_profile||'adult',bodyProportions:this.currentDraft.body_proportions||null};
    const candidate=state.assemblyMode==='force_fit'?createForceFitAssemblyCandidate(candidateOptions):createHybridAssemblyCandidate(candidateOptions);
    for(const record of this.currentDraft.artwork_parts||[]){const note=record.generation_sidecar,semantic=note?.part;if(!semantic)continue;const actual=geometryByPart[record.part_id]?.orientation;if(semantic.orientation&&semantic.orientation!=='unspecified'&&actual&&semantic.orientation!==actual)candidate.diagnostics.push({code:'sidecar_orientation_review',severity:'warning',part_id:record.part_id,message:`Sidecar says ${semantic.orientation}; measured PNG geometry is ${actual}. App geometry wins; review before Apply.`});else candidate.diagnostics.push({code:'sidecar_semantics_loaded',severity:'info',part_id:record.part_id,message:`Validated sidecar joint mapping ${semantic.joint_ids.join(' → ')}; PNG geometry was measured by the app and the sidecar remains unverified.${semantic.seam_notes?` Seam note: ${semantic.seam_notes}`:''}`});}
    state.assemblyCandidate=candidate;this.renderEditor();
  }

  applyAutoAssembly() { const state=this.rigEditorState(),candidate=state.assemblyCandidate;if(!candidate||candidate.status==='blocked')return;const previous=state.assemblyPreviousWorking||{rig:structuredClone(this.currentDraft.rig||createCanonicalM1EditorRig('rig_'+this.current.character_id.slice(0,50))),parts:structuredClone(this.currentDraft.rig_editor_parts||this.getRigEditorModel().parts)};state.previousAssembly=structuredClone(previous);this.pushRigEditorUndo(previous.parts);this.commitRigEditorParts(candidate.parts,candidate.rig);state.assemblyCandidate=null;state.assemblyPreviousWorking=null;this.error=(candidate.mode==='force_fit'?'Force Fit':'Hybrid assembly')+' applied to working draft. Review diagnostics, then Save Draft.';this.renderEditor(); }

  resetAutoAssemblyPrevious() { const state=this.rigEditorState();if(!state.previousAssembly)return;this.pushRigEditorUndo(this.getRigEditorModel().parts);this.commitRigEditorParts(state.previousAssembly.parts,state.previousAssembly.rig);state.previousAssembly=null;state.assemblyCandidate=null;this.error='Restored the snapshot from before the last assembly apply.';this.renderEditor(); }

  refitSelectedAssemblyPart() {
    const state=this.rigEditorState(),model=this.getRigEditorModel(),partId=state.selectedPartId,part=model.parts.find(item=>item.id===partId);if(!part)return;
    const anchors=part.assembly_anchors_px||candidateSourceAnchors(part.assembly_geometry),pair=part.assembly_anchors_px?.target_joint_ids||resolveAnatomicalJointPair(part.id,part.binding);
    if(!anchors||!pair){this.error='Refit needs calibrated source anchors. Run Auto Assemble Rig or calibrate the part first.';this.renderEditor();return;}
    try{const fitted=fitImagePartToJoints({part,rig:model.rig,anchors,targetJointIds:pair,confirmed:true}),parts=model.parts.map(item=>item.id===partId?fitted.part:item);if(state.assemblyCandidate){state.assemblyCandidate.parts=parts;state.assemblyCandidate.errors=state.assemblyCandidate.errors.filter(item=>item.part_id!==partId);state.assemblyCandidate.diagnostics=state.assemblyCandidate.diagnostics.filter(item=>item.part_id!==partId).concat([{code:'manual_refit',severity:'warning',part_id:partId,message:'Selected part was refit to calibrated anchors; inspect residual and seam.'}]);state.assemblyCandidate.status=state.assemblyCandidate.errors.length?'blocked':'review_required';}else{this.pushRigEditorUndo(model.parts);this.commitRigEditorParts(parts,model.rig);}this.error='Refit complete. Review proximal/distal residual before saving.';}catch(error){this.error=error?.message||String(error);}this.renderEditor();
  }

  renderRigEditor(host, tabs) {
    let model; try { model = this.getRigEditorModel(); } catch (error) { host.innerHTML = `${tabs}<div class="character-state character-error">${esc(error.message)}</div>`; return; }
    const state = this.rigEditorState(); if (!model.parts.some(part => part.id === state.selectedPartId)) state.selectedPartId = model.parts[0]?.id || '';
    const selected = model.parts.find(part => part.id === state.selectedPartId) || null, joints = model.rig.joints;
    const options = selected => joints.map(joint => `<option value="${esc(joint.id)}"${joint.id === selected ? ' selected' : ''}>${esc(joint.id)}</option>`).join('');
    const input = (label, field, value, min, max, step = '.01') => `<label>${label}<input type="number" data-rig-field="${field}" value="${Number(value ?? 0)}" min="${min}" max="${max}" step="${step}"></label>`;
    const binding = !selected ? '<div class="rig-inspector-empty">Import a part in Artwork Parts, then select it here.</div>' : `<div class="rig-inspector-identity"><span>PART ID</span><b>${esc(selected.id)}</b><small title="${esc(selected.asset_id)}">Asset ${esc(selected.asset_id.slice(0, 26))}…</small><small>${selected.source_dimensions_px.width} × ${selected.source_dimensions_px.height}px</small></div><label>Binding type<select data-rig-field="binding_mode"><option value="joint"${selected.binding.joint_id ? ' selected' : ''}>Single joint</option><option value="bone"${selected.binding.from_joint_id ? ' selected' : ''}>Two-point bone</option></select></label>${selected.binding.joint_id ? `<label>Attach to joint<select data-rig-field="joint_id">${options(selected.binding.joint_id)}</select></label>` : `<div class="rig-binding-selects"><label>Proximal joint<select data-rig-field="from_joint_id">${options(selected.binding.from_joint_id)}</select></label><label>Distal joint<select data-rig-field="to_joint_id">${options(selected.binding.to_joint_id)}</select></label></div>`}<div class="rig-inspector-section"><b>Source image pixels</b>${input('Pivot X','pivot_x',selected.pivot.x,0,selected.source_dimensions_px.width,1)}${input('Pivot Y','pivot_y',selected.pivot.y,0,selected.source_dimensions_px.height,1)}${selected.binding.attachment_points_px ? `<span>Bone anchors must share a horizontal source-image row.</span>${input('Proximal X','from_x',selected.binding.attachment_points_px.from.x,0,selected.source_dimensions_px.width,1)}${input('Attachment Y','from_y',selected.binding.attachment_points_px.from.y,0,selected.source_dimensions_px.height,1)}${input('Distal X','to_x',selected.binding.attachment_points_px.to.x,0,selected.source_dimensions_px.width,1)}` : ''}</div><div class="rig-inspector-section"><b>Rig-local units</b>${input('Offset X','offset_x',selected.transform.offset.x,-2,2)}${input('Offset Y','offset_y',selected.transform.offset.y,-2,2)}${input('Scale','scale',selected.transform.scale,.05,10)}${input('Rotation (degrees)','rotation',selected.transform.rotation*180/Math.PI,-360,360,1)}${input('z-index','z_index',selected.z_index,-1000,1000,1)}${input('Opacity','opacity',selected.opacity,0,1,.05)}</div><label class="rig-checkbox"><input type="checkbox" data-rig-field="visible"${selected.visible ? ' checked' : ''}> Visible</label><label class="rig-checkbox"><input type="checkbox" data-rig-control="keepPosition"${state.keepPosition ? ' checked' : ''}> Keep artwork position when moving pivot</label><button type="button" class="tool-chip" data-action="rig-reset-part">Reset this part</button><button type="button" class="tool-chip" data-action="rig-refit-selected">Refit Selected Part</button>`;
    const rows = model.parts.map(part => `<div class="rig-part-row${part.id === state.selectedPartId ? ' selected' : ''}" data-selected="${part.id === state.selectedPartId ? 'true' : 'false'}"><button type="button" data-rig-select="${esc(part.id)}"><b>${esc(part.id)}</b><small>${part.binding.joint_id ? esc(part.binding.joint_id) : `${esc(part.binding.from_joint_id)} → ${esc(part.binding.to_joint_id)}`}</small><span>${part.visible ? 'Visible' : 'Hidden'} · ${part.alpha ? 'Validated PNG' : 'Imported Candidate'}</span></button><label class="rig-mini-toggle" title="Visibility"><input type="checkbox" data-rig-field="visible" data-part-id="${esc(part.id)}"${part.visible ? ' checked' : ''}></label><button type="button" class="rig-lock-button" data-action="rig-toggle-lock" data-part-id="${esc(part.id)}" aria-label="Toggle lock ${esc(part.id)}">${part.locked ? '🔒' : '🔓'}</button></div>`).join('');
    const width = state.layout === 'landscape' ? 720 : 405, height = state.layout === 'landscape' ? 405 : 720,seamTest=state.motion==='joint_test';
    const candidate=state.assemblyCandidate,assemblySummary=candidate?`<section class="rig-assembly-diagnostics" data-assembly-status="${esc(candidate.status)}"><b>${candidate.mode==='force_fit'?'Force Fit':'Hybrid'} candidate · ${candidate.status==='valid'?'Valid':candidate.status==='blocked'?'Blocked':'Review Required'}</b>${(candidate.fit_diagnostics||[]).map(item=>`<div class="rig-fit-row ${esc(item.status)}"><b>${esc(item.part_id)}</b><span>Source ${Number.isFinite(item.source_length_px)?item.source_length_px.toFixed(2)+' px':'—'}</span><span>Target ${Number.isFinite(item.target_length_rig_units)?item.target_length_rig_units.toFixed(4)+' units':'—'}</span><span>Scale ${Number.isFinite(item.scale)?item.scale.toFixed(5):'—'}</span><span>Rotation ${Number.isFinite(item.rotation_radians)?(item.rotation_radians*180/Math.PI).toFixed(2)+'°':'—'}</span><span>Distal residual ${Number.isFinite(item.distal_residual_rig_units)?item.distal_residual_rig_units.toFixed(5)+' units':'—'}</span><span>Max residual ${Number.isFinite(item.residual_rig_units)?item.residual_rig_units.toFixed(5)+' units':'—'}</span><strong>${item.status==='valid'?'Valid':item.status==='blocked'?'Blocked':'Review Required'}</strong>${item.reason?`<small>${esc(item.reason)}</small>`:''}</div>`).join('')}</section>`:'';
    host.innerHTML = `${tabs}<div class="character-editor-scroll rig-editor-scroll"><div class="rig-editor-heading"><div><span class="overline">VISUAL RIG BINDING</span><h1>${esc(this.currentDraft.display_name)}</h1><span>${this.currentDraft.rig ? 'Using the rig stored in this draft.' : 'Canonical M1 rest pose is an editor fallback; edits attach it to this draft.'}</span></div><span class="rig-editor-dirty">${this.isDirty() ? 'Unsaved changes' : 'Draft saved'}</span></div><div class="rig-editor-toolbar"><label class="rig-assembly-mode">Assembly mode<select data-rig-control="assemblyMode"><option value="hybrid"${state.assemblyMode==='hybrid'?' selected':''}>Hybrid</option><option value="force_fit"${state.assemblyMode==='force_fit'?' selected':''}>Force Fit</option></select></label><button type="button" class="tool-chip" data-action="rig-auto-assemble">${state.assemblyMode==='force_fit'?'Auto Assemble Rig · Force Fit':'Auto Assemble Rig · Hybrid'}</button><button type="button" class="tool-chip" data-action="rig-refit-all">Refit All</button><button type="button" class="tool-chip" data-action="rig-assembly-cancel"${state.assemblyCandidate ? '' : ' disabled'}>Cancel preview</button><button type="button" class="tool-chip" data-action="rig-assembly-apply"${state.assemblyCandidate && state.assemblyCandidate.status !== 'blocked' ? '' : ' disabled'}>Apply Assembly</button><button type="button" class="tool-chip" data-action="rig-assembly-reset-previous"${state.previousAssembly ? '' : ' disabled'}>Reset to Previous</button><button type="button" class="tool-chip${state.mode === 'assemble' ? ' active' : ''}" data-rig-control="mode" data-value="assemble">Assemble</button><button type="button" class="tool-chip${state.mode === 'bind' ? ' active' : ''}" data-rig-control="mode" data-value="bind">Bind</button><button type="button" class="tool-chip" data-action="rig-undo"${state.undo.length ? '' : ' disabled'}>Undo</button><button type="button" class="tool-chip" data-action="rig-redo"${state.redo.length ? '' : ' disabled'}>Redo</button><button type="button" class="tool-chip${state.layout === 'landscape' ? ' active' : ''}" data-rig-control="layout" data-value="landscape">16:9</button><button type="button" class="tool-chip${state.layout === 'portrait' ? ' active' : ''}" data-rig-control="layout" data-value="portrait">9:16</button><button type="button" class="tool-chip" data-rig-control="checkerboard">${state.checkerboard ? 'Checkerboard on' : 'Checkerboard off'}</button><button type="button" class="tool-chip" data-rig-control="skeleton">${state.skeleton ? 'Skeleton on' : 'Skeleton off'}</button><button type="button" class="tool-chip" data-action="rig-fit">Fit view</button><label>Zoom <input type="range" min=".5" max="2.2" step=".05" value="${state.zoom}" data-rig-control="zoom"></label><label>Pan X <input type="range" min="-.3" max=".3" step=".01" value="${state.panX}" data-rig-control="panX"></label><label>Pan Y <input type="range" min="-.3" max=".3" step=".01" value="${state.panY}" data-rig-control="panY"></label></div><div class="rig-editor-grid"><section class="rig-parts-panel"><div class="section-title">BODY PARTS · ${model.parts.length}</div>${rows || '<div class="rig-inspector-empty">No imported PNG parts yet. Start in Artwork Parts.</div>'}<small>Lock prevents edits. Visibility applies to preview and saved appearance.</small></section><section class="rig-canvas-panel"><div class="rig-canvas-controls"><label>Preview<select data-rig-control="motion"><option value="rest"${state.motion === 'rest' ? ' selected' : ''}>Rest pose</option><option value="idle"${state.motion === 'idle' ? ' selected' : ''}>Idle</option><option value="breathe"${state.motion === 'breathe' ? ' selected' : ''}>Breathe</option><option value="blink"${state.motion === 'blink' ? ' selected' : ''}>Blink</option><option value="joint_test"${state.motion === 'joint_test' ? ' selected' : ''}>Joint seam test</option></select></label><label>Seek <input type="range" min="0" max="8" step=".01" value="${state.time}" data-rig-control="time"><output data-rig-time>${state.time.toFixed(2)}s</output></label><label class="joint-test-control${seamTest?' joint-test-active':''}">Test joint<select data-rig-control="testJointId">${options(state.testJointId)}</select><small data-joint-test-hint ${seamTest?'hidden':''}>Active during Joint seam test.</small></label><label class="joint-test-angle-control${seamTest?' joint-test-active':''}"><span>Joint Test Angle</span><div class="joint-test-angle-row"><input type="range" min="-90" max="90" step="1" value="${state.testRotation*180/Math.PI}" data-rig-control="testRotation"${seamTest?'':' disabled'}><output data-joint-test-angle-value>${signedAngleDegrees(state.testRotation)}</output></div><small data-joint-angle-hint ${seamTest?'hidden':''}>Chọn Joint seam test để điều chỉnh góc khớp.</small></label></div><div class="rig-canvas-wrap${state.checkerboard ? ' checkerboard' : ''}"><canvas data-rig-canvas width="${width}" height="${height}" aria-label="Character rig preview. Assemble moves a part, Bind moves pivot or bone attachments."></canvas></div><p class="rig-coordinate-help">Canvas coordinates map to source image pixels for pivot placement. Rig offsets and joints use normalized rig units. CP2 bone anchors use the horizontal source-X convention; portrait-axis artwork needs a compatible crop/orientation to avoid distortion.</p>${assemblySummary}<div class="rig-preview-diagnostics" data-rig-diagnostics aria-live="polite"></div></section><aside class="rig-part-inspector"><div class="section-title">PART INSPECTOR</div>${binding}</aside></div></div><div class="character-editor-actions"><span class="character-save-status" role="status">${esc(this.error || '')}</span><button type="button" class="tool-chip" data-action="discard"${this.isDirty() ? '' : ' disabled'}>Discard</button><button type="button" class="export-button" data-action="save"${this.isDirty() && !this.saving ? '' : ' disabled'}>Save draft</button></div>`;
    if(state.assemblyCandidate)host.querySelectorAll('[data-rig-field],[data-action="rig-reset-part"],[data-action="rig-toggle-lock"],[data-action="rig-undo"],[data-action="rig-redo"]').forEach(control=>{control.disabled=true;});
    const canvas = host.querySelector('[data-rig-canvas]'); canvas?.addEventListener('pointerdown', event => this.beginRigPivotDrag(event)); canvas?.addEventListener('pointermove', event => this.moveRigPivotDrag(event)); canvas?.addEventListener('pointerup', event => this.endRigPivotDrag(event)); canvas?.addEventListener('pointercancel', () => { this.rigDrag = null; });
    void this.drawRigEditorCanvas();
  }

  async getRigEditorImages(artwork, parts = []) {
    const characterId = this.current.character_id;
    if (!this.rigPreviewImagesByCharacter.has(characterId)) this.rigPreviewImagesByCharacter.set(characterId, new Map());
    const images = this.rigPreviewImagesByCharacter.get(characterId), pending = this.pendingArtworkAssets.get(characterId) || new Map();
    for (const item of artwork) {
      if (images.has(item.asset_id)) { this.setRigAlphaMetrics(characterId, item.asset_id, this.inspectRigImageAlpha(images.get(item.asset_id), parts.find(part => part.id === item.part_id))); continue; }
      const blob = pending.get(item.asset_id) || (await this.storage.getAsset(item.asset_id))?.blob;
      if (!blob) continue;
      let bitmap;
      if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(blob);
      else if (typeof Image === 'function') { const url = URL.createObjectURL(blob); try { bitmap = new Image(); bitmap.src = url; await bitmap.decode(); } finally { URL.revokeObjectURL(url); } }
      else throw new Error('Browser image decoder is unavailable for rig preview.');
      if (bitmap.width !== item.width || bitmap.height !== item.height) { bitmap.close?.(); throw new Error(`Part ${item.part_id} PNG dimensions do not match its draft metadata.`); }
      images.set(item.asset_id, bitmap);
      this.setRigAlphaMetrics(characterId, item.asset_id, this.inspectRigImageAlpha(bitmap, parts.find(part => part.id === item.part_id)));
    }
    return images;
  }

  async drawRigEditorCanvas() {
    const canvas = this.root.querySelector('[data-rig-canvas]'); if (!canvas || !this.currentDraft) return;
    const characterId = this.current.character_id;
    try {
      const model = this.getRigEditorModel(), state = this.rigEditorState(), images = await this.getRigEditorImages(model.artwork, model.parts);
      if (this.current?.character_id !== characterId || !canvas.isConnected) return;
      const width = canvas.width, height = canvas.height, ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height); ctx.fillStyle = state.checkerboard ? '#d7dbe1' : '#151b24'; ctx.fillRect(0, 0, width, height);
      if (state.checkerboard) { const size = 16; ctx.fillStyle = '#b8bec8'; for (let y = 0; y < height; y += size * 2) for (let x = 0; x < width; x += size * 2) { ctx.fillRect(x, y, size, size); ctx.fillRect(x + size, y + size, size, size); } }
      const motion = ['idle', 'breathe', 'blink'].includes(state.motion) ? state.motion : 'rest', time = motion === 'rest' ? 0 : state.time;
      const pose = resolveRigEditorPreview(model.rig, model.parts, time, { width, height, motion, zoom: state.zoom, panX: state.panX, panY: state.panY, testJointId: state.motion === 'joint_test' ? state.testJointId : null, testRotation: state.testRotation });
      const character = { status: 'ready', pose, appearance: { parts: model.parts }, assets: images, transform: { opacity: 1 } };
      drawImageBackedCharacter(ctx, character, width, height);
      const selected = model.parts.find(part => part.id === state.selectedPartId && part.visible);
      this.rigCanvasFrame = { character, parts: model.parts, pose, width, height, selectedGeometry: selected ? calculateImagePartCanvasTransform(character, selected, width, height) : null, selectedPart: selected || null };
      this.drawRigSkeletonOverlay(ctx, model.rig, pose, model.parts, character, state.skeleton);
      const diagnostics = createRigEditorDiagnostics(model.rig, model.parts, images);
      const assemblyCandidate=this.rigEditorState().assemblyCandidate;
      if(assemblyCandidate){diagnostics.unshift({code:'assembly_'+assemblyCandidate.status,severity:assemblyCandidate.status==='blocked'?'error':'warning',message:(assemblyCandidate.mode==='force_fit'?'Force Fit':'Hybrid')+' candidate preview only; Apply Assembly is required before it enters the working draft.'});diagnostics.unshift(...assemblyCandidate.diagnostics);}
      try { for (const partId of missingRequiredRigParts(this.getArtworkParts(), model.parts)) diagnostics.unshift({ code: 'missing_part', severity: 'warning', part_id: partId, message: `Required part "${partId}" has not been imported.` }); } catch {}
      this.addRigJointResidualDiagnostics(diagnostics, model, character, width, height);
      const diagHost = this.root.querySelector('[data-rig-diagnostics]');
      if (diagHost) diagHost.innerHTML = `<b>${diagnostics.length ? `${diagnostics.length} QA finding(s)` : 'No binding diagnostics'}</b>${diagnostics.slice(0, 24).map(item => `<div class="rig-diagnostic ${esc(item.severity)}"><code>${esc(item.code)}</code> ${esc(item.part_id ? item.part_id + ': ' : '')}${esc(item.message)}</div>`).join('')}`;
      const timeOutput = this.root.querySelector('[data-rig-time]'); if (timeOutput) timeOutput.textContent = `${state.time.toFixed(2)}s`;
    } catch (error) { this.error = error?.message || String(error); const diag = this.root.querySelector('[data-rig-diagnostics]'); if (diag) diag.innerHTML = `<div class="rig-diagnostic error">${esc(this.error)}</div>`; }
  }

  drawRigSkeletonOverlay(ctx, rig, pose, parts, character, showSkeleton = true) {
    const width = ctx.canvas.width, height = ctx.canvas.height;
    ctx.save(); ctx.lineWidth = Math.max(1.4, Math.min(width, height) * .003); ctx.strokeStyle = '#ff4d66'; ctx.fillStyle = '#ffdd4d';
    if (showSkeleton) for (const joint of rig.joints) { const point = pose.joints[joint.id], parent = joint.parent_id ? pose.joints[joint.parent_id] : null; if (parent) { ctx.beginPath(); ctx.moveTo(parent.x, parent.y); ctx.lineTo(point.x, point.y); ctx.stroke(); } ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(3, Math.min(width, height) * .009), 0, Math.PI * 2); ctx.fill(); }
    for (const part of parts.filter(item => item.visible)) {
      const geometry = calculateImagePartCanvasTransform(character, part, width, height); if (!geometry) continue;
      const metadata=part.rig_ready_metadata,metadataAnchors=Number.isFinite(metadata?.proximal_anchor?.x)&&Number.isFinite(metadata?.proximal_anchor?.y)?{from:{x:metadata.proximal_anchor.x,y:metadata.proximal_anchor.y},...(Number.isFinite(metadata.distal_anchor?.x)&&Number.isFinite(metadata.distal_anchor?.y)?{to:{x:metadata.distal_anchor.x,y:metadata.distal_anchor.y}}:{})}:null,sourceAnchors=part.assembly_anchors_px||part.binding.attachment_points_px||metadataAnchors,points = [part.pivot, ...(sourceAnchors ? [sourceAnchors.from, ...(sourceAnchors.to?[sourceAnchors.to]:[])] : [])];
      for (let index = 0; index < points.length; index++) { const point = canvasPointFromSource(points[index], geometry); ctx.fillStyle = index ? index === 1 ? '#42e59b' : '#ff5c67' : part.id === this.rigEditorState().selectedPartId ? '#54e9ff' : '#f1f4fb'; ctx.beginPath(); ctx.arc(point.x, point.y, index ? 4 : 5, 0, Math.PI * 2); ctx.fill(); }
      if(part.assembly_anchors_px?.target_joint_ids){const ids=part.assembly_anchors_px.target_joint_ids,from=pose.joints[ids[0]],to=pose.joints[ids[1]],a=canvasPointFromSource(part.assembly_anchors_px.from,geometry),b=canvasPointFromSource(part.assembly_anchors_px.to,geometry);if(from&&to){ctx.save();ctx.setLineDash([5,4]);ctx.strokeStyle='#d4a7ff';ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#ff8c73';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(from.x,from.y);ctx.moveTo(b.x,b.y);ctx.lineTo(to.x,to.y);ctx.stroke();ctx.restore();}}
      else if(metadataAnchors){const ids=[metadata.proximal_anchor?.joint,metadata.distal_anchor?.joint].filter(Boolean),from=pose.joints[ids[0]],to=ids[1]?pose.joints[ids[1]]:null,a=canvasPointFromSource(metadataAnchors.from,geometry),b=metadataAnchors.to?canvasPointFromSource(metadataAnchors.to,geometry):null;if(from){ctx.save();ctx.setLineDash([5,4]);ctx.strokeStyle=metadata.validation_status==='verified'?'#d4a7ff':'#9e91c6';if(to){ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();}ctx.setLineDash([]);ctx.strokeStyle='#ff8c73';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(from.x,from.y);if(to&&b){ctx.moveTo(b.x,b.y);ctx.lineTo(to.x,to.y);}ctx.stroke();ctx.restore();}}
      if (part.id === this.rigEditorState().selectedPartId) { const pivot = canvasPointFromSource(part.pivot, geometry); ctx.strokeStyle = '#40d8f5'; ctx.beginPath(); ctx.moveTo(pivot.x - 9, pivot.y); ctx.lineTo(pivot.x + 9, pivot.y); ctx.moveTo(pivot.x, pivot.y - 9); ctx.lineTo(pivot.x, pivot.y + 9); ctx.stroke(); }
    }
    ctx.restore();
  }

  addRigJointResidualDiagnostics(diagnostics, model, character, width, height) {
    for (const part of model.parts) {
      const geometry = calculateImagePartCanvasTransform(character, part, width, height); if (!geometry) continue;
      const metadata=part.rig_ready_metadata,metadataAnchors=Number.isFinite(metadata?.proximal_anchor?.x)&&Number.isFinite(metadata?.proximal_anchor?.y);
      if(part.assembly_anchors_px?.target_joint_ids){const ids=part.assembly_anchors_px.target_joint_ids;for(const [label,source,jointId]of [['proximal',part.assembly_anchors_px.from,ids[0]],['distal',part.assembly_anchors_px.to,ids[1]]]){const target=character.pose.joints[jointId];if(!target)continue;const mapped=canvasPointFromSource(source,geometry),residual=Math.hypot(mapped.x-target.x,mapped.y-target.y);diagnostics.push({code:'anatomical_anchor_residual',severity:residual>Math.max(2,Math.min(width,height)*.006)?'warning':'info',part_id:part.id,message:label+' anchor → '+jointId+': '+residual.toFixed(2)+' canvas px ('+(part.assembly_anchors_px.residual?.[label]??0).toFixed(4)+' rig units at rest). Dashed purple is target bone; coral connector is residual.'});}continue;}
      const anchors = part.binding.attachment_points_px ? [['from', part.binding.attachment_points_px.from, part.binding.from_joint_id], ['to', part.binding.attachment_points_px.to, part.binding.to_joint_id]] : [['pivot', part.pivot, part.binding.joint_id]];
      if(metadataAnchors){for(const[key,anchor]of [['proximal_anchor',metadata.proximal_anchor],['distal_anchor',metadata.distal_anchor]]){if(!anchor||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y))continue;const target=character.pose.joints[anchor.joint],mapped=canvasPointFromSource(anchor,geometry);if(target){const residual=Math.hypot(mapped.x-target.x,mapped.y-target.y);diagnostics.push({code:'rig_metadata_anchor_residual',severity:residual>2?'warning':'info',part_id:part.id,message:`${key} → ${anchor.joint}: ${residual.toFixed(2)} canvas px; metadata ${metadata.validation_status}, source ${metadata.provenance}.`});}}}
      for (const [label, source, jointId] of anchors) {
        if (!jointId || !character.pose.joints[jointId]) continue;
        const mapped = canvasPointFromSource(source, geometry), joint = character.pose.joints[jointId], angle = part.binding.joint_id ? joint.rotation : Math.atan2(character.pose.joints[part.binding.to_joint_id].y - character.pose.joints[part.binding.from_joint_id].y, character.pose.joints[part.binding.to_joint_id].x - character.pose.joints[part.binding.from_joint_id].x), unit = Math.min(width, height), offset = part.transform.offset, offsetX = (offset.x * Math.cos(angle) - offset.y * Math.sin(angle)) * unit * joint.scale, offsetY = (offset.x * Math.sin(angle) + offset.y * Math.cos(angle)) * unit * joint.scale, residual = Math.hypot(mapped.x - (joint.x + offsetX), mapped.y - (joint.y + offsetY));
        diagnostics.push({ code: 'joint_transform_residual', severity: residual > 1 ? 'warning' : 'info', part_id: part.id, message: `${label} → ${jointId}: ${residual.toFixed(2)} canvas px. Joint transform residual is measured separately from PNG alpha coverage.` });
        const metrics = this.rigAlphaMetricsByCharacter.get(this.current.character_id)?.get(part.asset_id), coverage = metrics?.coverage?.[`${Math.round(source.x)},${Math.round(source.y)}`];
        if (coverage != null && coverage < .05) diagnostics.push({ code: 'artwork_coverage_gap', severity: 'warning', part_id: part.id, message: `Only ${(coverage * 100).toFixed(0)}% of sampled nearby alpha pixels cover the ${label} attachment. This is an artwork coverage warning; joint transform residual is ${residual.toFixed(2)} px.` });
      }
      const bounds = this.rigAlphaMetricsByCharacter.get(this.current.character_id)?.get(part.asset_id)?.bounds;
      if (bounds) diagnostics.push({ code: 'alpha_bounds', severity: 'info', part_id: part.id, message: `Approximate decoded alpha bounds: x=${bounds.x}, y=${bounds.y}, ${bounds.width}×${bounds.height}px (downsampled inspection).` });
    }
  }

  inspectRigImageAlpha(image, part) {
    const max = 384, scale = Math.min(1, max / Math.max(image.width, image.height)), width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.clearRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height); const pixels = context.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (pixels[(y * width + x) * 4 + 3] > 16) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    const bounds = maxX < 0 ? null : { x: Math.round(minX / scale), y: Math.round(minY / scale), width: Math.round((maxX - minX + 1) / scale), height: Math.round((maxY - minY + 1) / scale) };
    const coverage = {}, points = [part?.pivot, part?.binding?.attachment_points_px?.from, part?.binding?.attachment_points_px?.to].filter(Boolean);
    for (const point of points) {
      const cx = Math.round(point.x / image.width * width), cy = Math.round(point.y / image.height * height), radius = Math.max(2, Math.round(4 * scale)); let count = 0, total = 0;
      for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y++) for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x++) { total++; if (pixels[(y * width + x) * 4 + 3] > 16) count++; }
      coverage[`${Math.round(point.x)},${Math.round(point.y)}`] = total ? count / total : 0;
    }
    return { bounds, coverage };
  }
  setRigAlphaMetrics(characterId, assetId, metrics) { if (!this.rigAlphaMetricsByCharacter.has(characterId)) this.rigAlphaMetricsByCharacter.set(characterId, new Map()); this.rigAlphaMetricsByCharacter.get(characterId).set(assetId, metrics); }

  syncJointTestControls() {
    const seamTest=this.rigEditorState().motion==='joint_test',angle=this.root.querySelector('[data-rig-control="testRotation"]'),angleLabel=angle?.closest('.joint-test-angle-control'),jointLabel=this.root.querySelector('[data-rig-control="testJointId"]')?.closest('.joint-test-control');
    if(angle)angle.disabled=!seamTest;
    angleLabel?.classList.toggle('joint-test-active',seamTest);jointLabel?.classList.toggle('joint-test-active',seamTest);
    const angleHint=this.root.querySelector('[data-joint-angle-hint]'),jointHint=this.root.querySelector('[data-joint-test-hint]');
    if(angleHint)angleHint.hidden=seamTest;if(jointHint)jointHint.hidden=!seamTest;
  }

  updateRigEditorControl(control) {
    const state = this.rigEditorState(), key = control.dataset.rigControl, value = control.type === 'checkbox' ? control.checked : control.value;
    if (key === 'layout') { state.layout = control.dataset.value || value; this.renderEditor(); return; }
    if (key === 'mode') { state.mode = control.dataset.value || value; this.renderEditor(); return; }
    if (key === 'assemblyMode') { state.assemblyMode = control.dataset.value || value; this.renderEditor(); return; }
    if (key === 'keepPosition') state.keepPosition = Boolean(value);
    else if (key === 'checkerboard' || key === 'skeleton') state[key] = !state[key];
    else if (key === 'zoom' || key === 'panX' || key === 'panY' || key === 'time') state[key] = Number(value);
    else if (key === 'motion') { state.motion = String(value); if (state.motion === 'joint_test' && !state.testJointId) state.testJointId = 'left_upper_arm';this.syncJointTestControls(); }
    else if (key === 'testJointId') state.testJointId = String(value);
    else if (key === 'testRotation') { state.testRotation = Number(value) * Math.PI / 180;const output=this.root.querySelector('[data-joint-test-angle-value]');if(output)output.textContent=signedAngleDegrees(state.testRotation); }
    void this.drawRigEditorCanvas();
  }

  updateRigEditorField(control) {
    if(this.rigEditorState().assemblyCandidate)return;
    const partId = control.dataset.partId || this.rigEditorState().selectedPartId, model = this.getRigEditorModel(), parts = structuredClone(model.parts), part = parts.find(item => item.id === partId);
    if (!part || part.locked) return;
    const key = control.dataset.rigField, value = control.type === 'checkbox' ? control.checked : control.value, number = Number(value);
    if (control.type !== 'checkbox' && !Number.isFinite(number)) return;
    if (key === 'visible') part.visible = Boolean(value);
    else if (key === 'binding_mode') {
      if (value === 'joint') { const joint_id = part.binding.joint_id || part.binding.from_joint_id; part.binding = { joint_id: model.rig.joints.some(joint => joint.id === joint_id) ? joint_id : 'root' }; }
      else { const side = part.id.startsWith('right_') ? 'right' : 'left', from = part.id.includes('forearm') ? `${side}_forearm` : part.id.includes('shin') ? `${side}_shin` : part.id.includes('thigh') ? `${side}_thigh` : `${side}_upper_arm`, to = part.id.includes('forearm') ? `${side}_hand` : part.id.includes('shin') ? `${side}_foot` : part.id.includes('thigh') ? `${side}_shin` : `${side}_forearm`, width = part.source_dimensions_px.width, y = part.source_dimensions_px.height / 2; part.binding = { from_joint_id: from, to_joint_id: to, attachment_points_px: { from: { x: 0, y }, to: { x: width, y } } }; part.pivot = { space: 'image_px', x: 0, y }; }
    } else if (key === 'joint_id') part.binding = { joint_id: String(value) };
    else if (key === 'from_joint_id' || key === 'to_joint_id') part.binding[key] = String(value);
    else if (key === 'pivot_x' || key === 'pivot_y') { const point = clampSourcePoint({ ...part.pivot, [key.endsWith('_x') ? 'x' : 'y']: number }, part.source_dimensions_px); this.applyRigPivot(part, point, this.rigEditorState().keepPosition); }
    else if (['from_x', 'from_y', 'to_x'].includes(key)) {
      const anchors = part.binding.attachment_points_px, endpoint = key.startsWith('from') ? 'from' : 'to', axis = key.endsWith('_x') ? 'x' : 'y';
      anchors[endpoint] = clampSourcePoint({ ...anchors[endpoint], [axis]: number }, part.source_dimensions_px);
      if (key === 'from_y') { anchors.to.y = anchors.from.y; part.pivot = { space: 'image_px', ...anchors.from }; }
      if (key === 'from_x') part.pivot = { space: 'image_px', ...anchors.from };
    } else if (key === 'offset_x' || key === 'offset_y') part.transform.offset[key.endsWith('_x') ? 'x' : 'y'] = number;
    else if (key === 'scale') part.transform.scale = Math.max(.05, Math.min(10, number));
    else if (key === 'rotation') part.transform.rotation = number * Math.PI / 180;
    else if (key === 'z_index') part.z_index = Math.round(number);
    else if (key === 'opacity') part.opacity = Math.max(0, Math.min(1, number));
    if(['binding_mode','joint_id','from_joint_id','to_joint_id','pivot_x','pivot_y','from_x','from_y','to_x','offset_x','offset_y','scale','rotation'].includes(key)){part.user_confirmed=true;if(part.binding)part.binding.user_confirmed=true;if(key==='pivot_x'||key==='pivot_y')part.pivot.user_confirmed=true;}
    if(key==='z_index')part.z_index_confirmed=true;
    if(['binding_mode','joint_id','from_joint_id','to_joint_id'].includes(key)){const draft=structuredClone(this.currentDraft),artwork=draft.artwork_parts?.find(item=>item.part_id===partId);if(artwork?.rig_metadata){artwork.rig_metadata.validation_status='stale';artwork.rig_metadata.validation_reasons=['Rig joint mapping changed; revalidate this metadata against the active M1 mapping.'];this.currentDraft=draft;}}
    this.pushRigEditorUndo(model.parts);
    try { this.commitRigEditorParts(parts, model.rig); this.error = ''; } catch (error) { this.error = error.message; }
    this.renderEditor();
  }

  applyRigPivot(part, point, keepPosition) {
    const old = part.pivot, dimensions = part.source_dimensions_px;
    if (part.binding.from_joint_id) {
      const anchors = part.binding.attachment_points_px, dx = Math.max(-anchors.from.x, Math.min(dimensions.width - anchors.to.x, point.x - anchors.from.x)), dy = Math.max(-anchors.from.y, Math.min(dimensions.height - anchors.from.y, point.y - anchors.from.y));
      const delta = { x: dx, y: dy }; anchors.from = { x: anchors.from.x + dx, y: anchors.from.y + dy }; anchors.to = { x: anchors.to.x + dx, y: anchors.to.y + dy }; part.pivot = { space: 'image_px', ...anchors.from };
      const frame = this.rigCanvasFrame, geometry = frame?.selectedGeometry;
      if (keepPosition && geometry && frame.pose.joints[part.binding.from_joint_id]) { const from = frame.pose.joints[part.binding.from_joint_id], unit = Math.min(frame.width, frame.height), angle = part.transform.rotation, px = Math.cos(angle) * delta.x * geometry.pixelScaleX - Math.sin(angle) * delta.y * geometry.pixelScaleY, py = Math.sin(angle) * delta.x * geometry.pixelScaleX + Math.cos(angle) * delta.y * geometry.pixelScaleY; part.transform.offset.x += px / (unit * from.scale); part.transform.offset.y += py / (unit * from.scale); }
    } else {
      const next = clampSourcePoint(point, dimensions), delta = { x: next.x - old.x, y: next.y - old.y }; part.pivot = { space: 'image_px', ...next };
      const frame = this.rigCanvasFrame, geometry = frame?.selectedGeometry, joint = frame?.pose.joints[part.binding.joint_id];
      if (keepPosition && geometry && joint) { const scale = geometry.pixelScaleX / (Math.min(frame.width, frame.height) * joint.scale), angle = part.transform.rotation, dx = Math.cos(angle) * delta.x - Math.sin(angle) * delta.y, dy = Math.sin(angle) * delta.x + Math.cos(angle) * delta.y; part.transform.offset.x += dx * scale; part.transform.offset.y += dy * scale; }
    }
  }

  pushRigEditorUndo(parts) { const state = this.rigEditorState(); state.undo.push(structuredClone(parts)); if (state.undo.length > 60) state.undo.shift(); state.redo.length = 0; }

  beginRigPivotDrag(event) {
    const frame = this.rigCanvasFrame, canvas = event.currentTarget,state=this.rigEditorState(); if (!frame || !canvas || (state.assemblyCandidate&&state.mode!=='bind')) return;
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const point = { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
    const candidates = [...frame.parts].filter(part => part.visible).sort((a, b) => b.z_index - a.z_index);
    let hit = candidates.find(part => { const geometry = calculateImagePartCanvasTransform(frame.character, part, frame.width, frame.height); if (!geometry) return false; const source = sourcePointFromCanvas(point, geometry), { width, height } = part.source_dimensions_px; return source.x >= 0 && source.y >= 0 && source.x <= width && source.y <= height; });
    if (!hit && frame.selectedPart) hit = frame.selectedPart;
    if (!hit || hit.locked) return;
    if (state.selectedPartId !== hit.id) { state.selectedPartId = hit.id; this.renderEditor(); }
    const geometry = calculateImagePartCanvasTransform(frame.character, hit, frame.width, frame.height);
    if (!geometry || ![geometry.x, geometry.y, geometry.rotation, geometry.pixelScaleX, geometry.pixelScaleY].every(Number.isFinite) || !geometry.pixelScaleX || !geometry.pixelScaleY) { this.error = 'Coordinate input geometry unavailable: preview is rebuilding. Try the drag again.'; this.renderEditor(); return; }
    const source = clampSourcePoint(sourcePointFromCanvas(point, geometry), hit.source_dimensions_px), anchors = hit.assembly_anchors_px || hit.binding.attachment_points_px;
    const dragTarget = state.mode === 'bind' && anchors ? (Math.hypot(source.x - anchors.from.x, source.y - anchors.from.y) <= Math.hypot(source.x - anchors.to.x, source.y - anchors.to.y) ? 'from' : 'to') : 'pivot';
    this.rigDrag = { pointerId: event.pointerId, canvas, partId: hit.id, geometry, dimensions: hit.source_dimensions_px, point: source, startCanvas: point, mode: state.mode, dragTarget, startParts: structuredClone(frame.parts) };
    canvas.setPointerCapture?.(event.pointerId);
  }
  moveRigPivotDrag(event) { if (!this.rigDrag || event.pointerId !== this.rigDrag.pointerId) return; const rect = this.rigDrag.canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return; const point = { x: (event.clientX - rect.left) * this.rigDrag.canvas.width / rect.width, y: (event.clientY - rect.top) * this.rigDrag.canvas.height / rect.height }; this.rigDrag.point = clampSourcePoint(sourcePointFromCanvas(point, this.rigDrag.geometry), this.rigDrag.dimensions); this.rigDrag.endCanvas = point; }
  endRigPivotDrag(event) {
    if (!this.rigDrag || event.pointerId !== this.rigDrag.pointerId) return;
    const drag = this.rigDrag; this.rigDrag = null; const model = this.getRigEditorModel(), parts = structuredClone(model.parts), part = parts.find(item => item.id === drag.partId);
    if (!part || part.locked) return;
    if (drag.mode === 'assemble') {
      const frame = this.rigCanvasFrame, endCanvas = drag.endCanvas || drag.startCanvas, dx = endCanvas.x - drag.startCanvas.x, dy = endCanvas.y - drag.startCanvas.y;
      const isBone = Boolean(part.binding.from_joint_id), firstJointId = part.binding.joint_id || part.binding.from_joint_id, joint = frame?.pose?.joints?.[firstJointId];
      if (!joint || !Number.isFinite(joint.scale) || !drag.geometry.pixelScaleX || !drag.geometry.pixelScaleY) { this.error = 'Coordinate input geometry unavailable: preview frame is stale. Try again after the preview redraws.'; return; }
      const localX = (dx * Math.cos(drag.geometry.rotation) + dy * Math.sin(drag.geometry.rotation)) / drag.geometry.pixelScaleX, localY = (-dx * Math.sin(drag.geometry.rotation) + dy * Math.cos(drag.geometry.rotation)) / drag.geometry.pixelScaleY, unit = Math.min(frame.width, frame.height), jointAngle = isBone ? Math.atan2(frame.pose.joints[part.binding.to_joint_id].y - joint.y, frame.pose.joints[part.binding.to_joint_id].x - joint.x) : joint.rotation, angle = jointAngle;
      part.transform.offset.x += (Math.cos(angle) * localX - Math.sin(angle) * localY) / (unit * joint.scale);
      part.transform.offset.y += (Math.sin(angle) * localX + Math.cos(angle) * localY) / (unit * joint.scale);
    } else if (drag.dragTarget !== 'pivot' && (part.assembly_anchors_px || part.binding.attachment_points_px)) {
      const anchors = part.assembly_anchors_px || part.binding.attachment_points_px, moved = drag.dragTarget;
      const x = Math.max(0, Math.min(part.source_dimensions_px.width, drag.point.x));
      const y = Math.max(0, Math.min(part.source_dimensions_px.height, drag.point.y));
      if(part.assembly_anchors_px){anchors[moved]={x,y};anchors.user_confirmed=true;const pair=anchors.target_joint_ids||resolveAnatomicalJointPair(part.id,part.binding);if(!pair){this.error='No canonical proximal/distal joint pair is available for this part.';return;}try{Object.assign(part,fitImagePartToJoints({part,rig:model.rig,anchors,targetJointIds:pair,confirmed:true}).part);}catch(error){this.error=error.message;return;}}
      else {if (moved === 'from') { const max = Math.min(part.source_dimensions_px.width - anchors.to.x, part.source_dimensions_px.width - anchors.from.x); const dx = Math.max(-anchors.from.x, Math.min(max, x - anchors.from.x)); anchors.from.x += dx; anchors.to.x += dx; }
      else anchors.to.x = Math.max(anchors.from.x + 1, x);
      anchors.from.y = anchors.to.y = y; part.pivot = { space: 'image_px', ...anchors.from };part.binding.user_confirmed=true;}
    } else this.applyRigPivot(part, drag.point, this.rigEditorState().keepPosition);
    if(drag.mode==='assemble')part.user_confirmed=true;else if(drag.dragTarget==='pivot'){part.user_confirmed=true;part.pivot.user_confirmed=true;}
    const state=this.rigEditorState();if(state.assemblyCandidate){state.assemblyCandidate.parts=parts;state.assemblyCandidate.errors=state.assemblyCandidate.errors.filter(item=>item.part_id!==part.id);state.assemblyCandidate.diagnostics=state.assemblyCandidate.diagnostics.filter(item=>item.part_id!==part.id||!['vertical_source_axis_joint_fit','anchor_residual','manual_refit','vertical_source_axis_incompatible_with_cp2_bone'].includes(item.code)).concat([{code:'manual_refit',severity:'warning',part_id:part.id,message:'Anchors were calibrated and refit; inspect rendered residual before Apply.'}]);state.assemblyCandidate.status=state.assemblyCandidate.errors.length?'blocked':'review_required';}else{this.pushRigEditorUndo(drag.startParts);try { this.commitRigEditorParts(parts, model.rig); this.error = ''; } catch (error) { this.error = error.message; }}
    this.renderEditor();
  }

  applyRigEditorHistory(direction) {
    const state = this.rigEditorState();if(state.assemblyCandidate)return;const from = direction === 'undo' ? state.undo : state.redo, to = direction === 'undo' ? state.redo : state.undo;
    if (!from.length) return;
    to.push(structuredClone(this.currentDraft.rig_editor_parts || [])); const parts = from.pop();
    this.commitRigEditorParts(parts, this.getRigEditorModel().rig); this.renderEditor();
  }

  toggleRigEditorPartLock(partId) { if(this.rigEditorState().assemblyCandidate)return;const model = this.getRigEditorModel(), parts = structuredClone(model.parts), part = parts.find(item => item.id === partId); if (!part) return; part.locked = !part.locked; this.commitRigEditorParts(parts, model.rig); this.renderEditor(); }
  resetRigEditorPart() { if(this.rigEditorState().assemblyCandidate)return;const model = this.getRigEditorModel(), item = model.artwork.find(art => art.part_id === this.rigEditorState().selectedPartId); if (!item) return; const defaults = createInitialRigEditorParts([item], model.rig, null)[0], parts = model.parts.map(part => part.id === item.part_id ? defaults : part); this.pushRigEditorUndo(model.parts); this.commitRigEditorParts(parts, model.rig); this.renderEditor(); }

  renderArtworkParts(host, tabs) {
    const draft = this.currentDraft;
    let parts = [], diagnostic = '';
    try { parts = this.getArtworkParts(); } catch (error) { diagnostic = error?.message || String(error); }
    const artwork = Array.isArray(draft.artwork_parts) ? draft.artwork_parts : [];
    const byPart = new Map(artwork.map(item => [item.part_id, item]));
    const partErrors = this.artworkErrorsByCharacter.get(this.current.character_id) || new Map();
    const dirty = this.isDirty();
    const selectedGuide=this.jointGuidePartByCharacter.get(this.current.character_id)||'';
    const rows = parts.map(part => {
      const item = byPart.get(part.part_id);
      const state = !item ? partErrors.has(part.part_id) ? 'Invalid' : 'Missing' : item.validation_state === 'validated_png' ? 'Validated PNG' : 'Imported Candidate';
      const metadata=item?.rig_metadata,guideOpen=selectedGuide===part.part_id,preview = item ? `<div class="artwork-part-preview" data-artwork-preview="${esc(part.part_id)}">${guideOpen?`<canvas data-joint-guide="${esc(part.part_id)}" width="640" height="480" aria-label="Joint marker guide for ${esc(part.part_id)}"></canvas>`:'<span>Loading preview…</span>'}</div>` : '<div class="artwork-part-preview artwork-part-empty">No artwork imported</div>';
      const anchorFields=guideOpen&&metadata?['proximal_anchor','distal_anchor'].filter(key=>metadata[key]).map(key=>`<label>${key==='proximal_anchor'?'Proximal':'Distal'} X <input type="number" min="0" max="${item.width}" step="0.1" value="${Number.isFinite(metadata[key].x)?metadata[key].x:''}" data-joint-anchor="${key}" data-part-id="${esc(part.part_id)}" data-axis="x"></label><label>Y <input type="number" min="0" max="${item.height}" step="0.1" value="${Number.isFinite(metadata[key].y)?metadata[key].y:''}" data-joint-anchor="${key}" data-part-id="${esc(part.part_id)}" data-axis="y"></label>`).join(''):'';
      const guideTools=guideOpen&&metadata?`<div class="joint-guide-tools"><div><b>Joint Marker Guide · ${esc(metadata.validation_status)}</b><span>${esc(metadata.orientation?.observed||'orientation unavailable')} · source_image_px · ${metadata.alpha_bounds?`alpha ${metadata.alpha_bounds.x},${metadata.alpha_bounds.y} ${metadata.alpha_bounds.width}×${metadata.alpha_bounds.height}`:'alpha bounds unavailable'}</span><span>Green proximal: ${esc(metadata.proximal_anchor?.joint||'unmapped')} · Red distal: ${esc(metadata.distal_anchor?.joint||'single-anchor part')}</span></div><div class="artwork-part-actions"><button type="button" class="tool-chip" data-action="joint-guide-view" data-view="fit">Fit</button><button type="button" class="tool-chip" data-action="joint-guide-view" data-view="zoom" data-step="-1">Zoom −</button><button type="button" class="tool-chip" data-action="joint-guide-view" data-view="zoom" data-step="1">Zoom +</button><button type="button" class="tool-chip" data-action="joint-guide-view" data-view="panX" data-step="-1">←</button><button type="button" class="tool-chip" data-action="joint-guide-view" data-view="panX" data-step="1">→</button><button type="button" class="tool-chip" data-action="joint-guide-view" data-view="panY" data-step="-1">↑</button><button type="button" class="tool-chip" data-action="joint-guide-view" data-view="panY" data-step="1">↓</button></div><div class="joint-guide-coordinates">${anchorFields}</div><div class="artwork-part-actions"><button type="button" class="tool-chip" data-action="joint-guide-place" data-part-id="${esc(part.part_id)}" data-anchor="proximal_anchor">Set proximal</button>${metadata.distal_anchor?`<button type="button" class="tool-chip" data-action="joint-guide-place" data-part-id="${esc(part.part_id)}" data-anchor="distal_anchor">Set distal</button>`:''}<button type="button" class="tool-chip" data-action="joint-guide-reset" data-part-id="${esc(part.part_id)}">Reset to Candidate</button><button type="button" class="tool-chip" data-action="joint-guide-verify" data-part-id="${esc(part.part_id)}">Verify Anchors</button><button type="button" class="tool-chip" data-action="joint-guide-export" data-part-id="${esc(part.part_id)}">Export Guide PNG</button></div>${metadata.validation_reasons?.length?`<small>${esc(metadata.validation_reasons.join(' · '))}</small>`:''}</div>`:'';
      return `<article class="artwork-part-card" data-part-card="${esc(part.part_id)}"><div class="artwork-part-heading"><div><h3>${esc(part.part_id)}</h3><span>${esc(part.role)} · ${esc(part.joint_ids.join(' · '))}</span></div><span class="artwork-part-state ${item?.validation_state === 'validated_png' ? 'validated' : ''}">${state}</span></div>${preview}${guideTools}<div class="artwork-part-meta"><span>${part.required ? 'Required part' : 'Optional part'}</span>${item ? `<span>${esc(item.file_name)}</span><span>${item.width} × ${item.height}px · ${formatAssetSize(item.size)}</span><span>Alpha: ${item.has_transparency ? 'transparent pixels found' : 'none detected'}</span><span>Rig metadata: ${esc(metadata?.validation_status||'missing')}</span><span>Rig sidecar: ${item.generation_sidecar?'semantic · unverified':'none'}</span>${item.generation_sidecar?.look_configuration?`<span>Look: ${esc(item.generation_sidecar.look_configuration.profile?.label||item.generation_sidecar.look_configuration.starter_template)} · ${esc(item.generation_sidecar.look_configuration.outfit)}</span>`:''}<code title="${esc(item.sha256)}">SHA-256 ${esc(item.sha256.slice(0, 16))}…</code>` : `<span>Semantic joints: ${esc(part.joint_ids.join(', '))}</span>`}${partErrors.has(part.part_id) ? `<span class="artwork-part-error">${esc(partErrors.get(part.part_id))}</span>` : ''}</div><div class="artwork-part-actions"><button type="button" class="tool-chip" data-action="import-part" data-part-id="${esc(part.part_id)}">${item ? 'Replace' : 'Import'}</button>${item?`<button type="button" class="tool-chip" data-action="metadata-candidate" data-part-id="${esc(part.part_id)}">${metadata?'Refresh metadata candidate':'Create metadata candidate'}</button><button type="button" class="tool-chip" data-action="joint-guide" data-part-id="${esc(part.part_id)}">${guideOpen?'Hide Joint Markers':'Show Joint Markers'}</button><button type="button" class="tool-chip" data-action="import-metadata" data-part-id="${esc(part.part_id)}">Import metadata JSON</button><input hidden type="file" accept="application/json,.json" data-file-metadata="${esc(part.part_id)}">`:''}${item ? `<button type="button" class="tool-chip" data-action="remove-part" data-part-id="${esc(part.part_id)}">Remove</button>` : ''}<input hidden type="file" accept="image/png,.png" data-file-part="${esc(part.part_id)}"></div></article>`;
    }).join('');
    host.innerHTML = `${tabs}<div class="character-editor-scroll artwork-parts-scroll"><div class="character-editor-heading"><div><span class="overline">ARTWORK PARTS</span><h1>${esc(draft.display_name)}</h1><span class="character-id-inline">Import PNG candidates into this editable draft. No publish or rig binding happens here.</span></div></div><div class="artwork-parts-toolbar"><div><b>${parts.length} available parts</b><span>${draft.manifest?.parts?.length ? 'Vocabulary from this draft manifest.' : 'Canonical M1 fallback vocabulary; no appearance manifest is attached yet.'}</span></div><label class="export-button artwork-multiple-button">Import multiple PNGs<input hidden type="file" accept="image/png,.png" multiple data-file-multiple></label><label class="tool-chip artwork-multiple-button">Import PNGs + rig JSON<input hidden type="file" accept="image/png,.png,application/json,.json" multiple data-file-bundle></label></div>${diagnostic ? `<div class="character-error artwork-import-error" role="alert">${esc(diagnostic)}</div>` : ''}${this.error ? `<div class="character-error artwork-import-error" role="alert">${esc(this.error)}</div>` : ''}<div class="artwork-part-grid">${rows || '<div class="character-state">No compatible artwork parts are available.</div>'}</div><div class="artwork-state-legend"><span>Missing</span><span>Imported Candidate · alpha absent</span><span>Validated PNG · decoded with transparent pixels</span><span>Rig sidecar: semantic mapping only; geometry is measured from each PNG and still needs preview review.</span><span>Ready for Rig Binding is reserved for a later checkpoint with pivot, binding and preview QA.</span></div></div><div class="character-editor-actions"><span class="character-save-status" role="status">${dirty ? 'Unsaved artwork changes' : this.saving ? 'Saving…' : this.error ? esc(this.error) : ''}</span><button type="button" class="tool-chip" data-action="discard"${dirty ? '' : ' disabled'}>Discard</button><button type="button" class="export-button" data-action="save"${dirty && !this.saving ? '' : ' disabled'}>Save draft</button></div>`;
    const token = ++this.artworkRenderToken;
    void this.loadArtworkPreviews(parts, byPart, token);
  }

  async loadArtworkPreviews(parts, byPart, token) {
    for (const part of parts) {
      const item = byPart.get(part.part_id); if (!item) continue;
      try {
        const pending = this.pendingArtworkAssets.get(this.current.character_id)?.get(item.asset_id);
        const stored = pending ? null : await this.storage.getAsset(item.asset_id);
        if (stored && stored.sha256 !== item.sha256) throw new Error('Draft asset metadata checksum does not match the verified Blob.');
        const blob = pending || stored?.blob;
        if (!blob) throw new Error('Draft references an asset that is missing from Character Library storage.');
        if (!this.artworkPreviewUrls) this.artworkPreviewUrls = new Map();
        let url = this.artworkPreviewUrls.get(item.asset_id);
        if (!url) { url = URL.createObjectURL(blob); this.artworkPreviewUrls.set(item.asset_id, url); }
        if (token !== this.artworkRenderToken) return;
        const region = this.root.querySelector(`[data-artwork-preview="${CSS.escape(part.part_id)}"]`);
        if (region) { if(this.jointGuidePartByCharacter.get(this.current.character_id)===part.part_id){const metadata=item.rig_metadata;region.innerHTML=`<canvas data-joint-guide="${esc(part.part_id)}" width="640" height="480" aria-label="Joint marker guide for ${esc(part.part_id)}"></canvas>`;const guide=region.querySelector('canvas'),image=new Image();image.onload=()=>{if(token===this.artworkRenderToken&&guide.isConnected)this.drawJointGuideCanvas(guide,image,metadata);};image.src=url;}else region.innerHTML = `<img src="${url}" alt="${esc(part.part_id)} artwork preview">`; }
      } catch (error) {
        if (token !== this.artworkRenderToken) return;
        const region = this.root.querySelector(`[data-artwork-preview="${CSS.escape(part.part_id)}"]`);
        if (region) region.textContent = `Asset unavailable: ${error?.message || error}`;
        const card = region?.closest('.artwork-part-card'), state = card?.querySelector('.artwork-part-state');
        if (state) { state.textContent = 'Invalid'; state.classList.remove('validated'); }
      }
    }
  }

  async importArtworkFiles(entries, semanticSidecar = null) {
    if (!this.currentDraft) return;
    this.error = '';
    try {
      const allowed = new Map(this.getArtworkParts().map(part => [part.part_id, part]));
      const draft = structuredClone(this.currentDraft);
      const mapped = new Map((draft.artwork_parts || []).map(item => [item.part_id, item]));
      const pending = new Map(this.pendingArtworkAssets.get(this.current.character_id) || []);
      const errors = [];
      const partErrors = new Map(this.artworkErrorsByCharacter.get(this.current.character_id) || []);
      for (const { file, part_id } of entries) {
        try {
          if (!allowed.has(part_id)) throw new Error(`Unknown part ID "${part_id}" for this character rig.`);
          if(/\.guide\.png$/i.test(file?.name||''))throw new Error('This is a QA Joint Marker Guide PNG, not clean artwork. Import the original PNG instead.');
          const stableBlob = await snapshotArtworkBlob(file);
          const checked = await validateArtworkPng(stableBlob);
          partErrors.delete(part_id);
          const previous = mapped.get(part_id);
          const group=/^(left|right)_(upper_arm|forearm|hand)$/.test(part_id)?'arms':/^(left|right)_(thigh|shin|foot)$/.test(part_id)?'legs':'head_body',template=this.rigReadyMetadataTemplate(part_id,group),rig_metadata=createImportedRigReadyMetadata(template,{asset:{asset_id:checked.asset_id,sha256:checked.sha256,width:checked.width,height:checked.height},geometry:checked.geometry,previous:mapped.get(part_id)?.rig_metadata});
          const semantic=semanticSidecar?.parts.find(item=>item.part_id===part_id&&item.file_name.toLowerCase()===String(file.name).toLowerCase());
          mapped.set(part_id, { part_id, asset_id: checked.asset_id, sha256: checked.sha256, file_name: file.name, width: checked.width, height: checked.height, size: checked.size, has_transparency: checked.has_transparency, validation_state: checked.validation_state,rig_metadata,...(semantic?{generation_sidecar:{schema_version:semanticSidecar.schema_version,master_reference:semanticSidecar.master_reference,look_configuration:structuredClone(semanticSidecar.look_configuration),part:structuredClone(semantic),provenance:'chatgpt_semantic_sidecar_unverified'}}:{}) });
          pending.set(checked.asset_id, stableBlob);
          if (previous?.asset_id !== checked.asset_id && ![...mapped.values()].some(item => item.part_id !== part_id && item.asset_id === previous?.asset_id)) pending.delete(previous?.asset_id);
        } catch (error) { const message = error?.message || String(error); errors.push(`${file?.name || part_id}: ${message}`); if (allowed.has(part_id)) partErrors.set(part_id, message); }
      }
      this.artworkErrorsByCharacter.set(this.current.character_id, partErrors);
      if (mapped.size !== (draft.artwork_parts || []).length || entries.length) {
        draft.artwork_parts = [...mapped.values()];
        const oldPartAssetIds = new Set((this.currentDraft.artwork_parts || []).map(item => item.asset_id));
        const preserved = (draft.asset_refs || []).filter(id => !oldPartAssetIds.has(id));
        draft.asset_refs = [...new Set([...preserved, ...draft.artwork_parts.map(item => item.asset_id)])];
        this.currentDraft = draft; this.pendingArtworkAssets.set(this.current.character_id, pending);
      }
      this.error = errors.join(' · ');
    } catch (error) { this.error = error?.message || String(error); }
    this.renderEditor();
  }

  async importMultipleArtworkFiles(files) {
    let parts;
    try { parts = this.getArtworkParts(); } catch (error) { this.error = error.message; this.renderEditor(); return; }
    const matches = [], errors = [], assigned = new Set();
    for (const file of files) {
      try { const part_id = matchArtworkFileToPart(file.name, parts, this.currentDraft.role || ''); if (assigned.has(part_id)) throw new Error(`More than one selected file maps to "${part_id}"; import only one candidate per part at a time.`); assigned.add(part_id); matches.push({ file, part_id }); }
      catch (error) { errors.push(error.message); }
    }
    await this.importArtworkFiles(matches);
    if (errors.length) { this.error = [this.error, ...errors].filter(Boolean).join(' · '); this.renderEditor(); }
  }

  async importArtworkBundleFiles(files) {
    try {
      const jsonFiles=files.filter(file=>/\.json$/i.test(file.name)),pngFiles=files.filter(file=>/\.png$/i.test(file.name));
      if(jsonFiles.length!==1)throw new Error('Select exactly one rig-sidecar JSON together with its PNG part files.');
      if(!pngFiles.length)throw new Error('Select the PNG parts listed in the rig-sidecar JSON.');
      const raw=JSON.parse(await jsonFiles[0].text()),activeParts=this.getArtworkParts(),mapped=new Set();
      for(const file of pngFiles){const partId=matchArtworkFileToPart(file.name,activeParts,this.currentDraft.role||'');if(mapped.has(partId))throw new Error(`More than one PNG maps to "${partId}".`);mapped.add(partId);}
      const sidecar=validateRigArtworkSidecar(raw,{characterId:this.current.character_id,rigProfile:this.currentDraft.rig_profile||'adult',parts:activeParts,files:pngFiles});
      if(sidecar.parts.length!==pngFiles.length||sidecar.parts.some(part=>!mapped.has(part.part_id)))throw new Error('The sidecar must describe every selected PNG exactly once.');
      await this.importArtworkFiles(pngFiles.map(file=>({file,part_id:matchArtworkFileToPart(file.name,activeParts,this.currentDraft.role||'')})),sidecar);
      if(!this.error)this.error=`Imported ${sidecar.parts.length} PNG part(s) with validated semantic sidecar. Pixel geometry remains app-measured; assembly is still a review candidate.`;
    } catch(error) { this.error=error?.message||String(error);this.renderEditor(); }
  }

  removeArtworkPart(partId) {
    if (!this.currentDraft) return;
    const draft = structuredClone(this.currentDraft), removed = draft.artwork_parts?.find(item => item.part_id === partId);
    if (!removed) return;
    if(removed.rig_metadata)draft.rig_metadata_archive=[...(draft.rig_metadata_archive||[]),structuredClone(removed.rig_metadata)].slice(-50);
    const partErrors = new Map(this.artworkErrorsByCharacter.get(this.current.character_id) || []); partErrors.delete(partId); this.artworkErrorsByCharacter.set(this.current.character_id, partErrors);
    draft.artwork_parts = draft.artwork_parts.filter(item => item.part_id !== partId);
    const oldIds = new Set((this.currentDraft.artwork_parts || []).map(item => item.asset_id));
    const stillUsed = new Set(draft.artwork_parts.map(item => item.asset_id));
    draft.asset_refs = [...new Set([...(draft.asset_refs || []).filter(id => !oldIds.has(id)), ...stillUsed])];
    const pending = new Map(this.pendingArtworkAssets.get(this.current.character_id) || []);
    if (!stillUsed.has(removed.asset_id)) pending.delete(removed.asset_id);
    this.pendingArtworkAssets.set(this.current.character_id, pending); this.currentDraft = draft; this.error = ''; this.renderEditor();
  }

  artworkRecord(partId){return(this.currentDraft?.artwork_parts||[]).find(item=>item.part_id===partId)||null;}
  rigReadyMetadataTemplate(partId,group){const semantic=this.getArtworkParts().find(part=>part.part_id===partId);if(!semantic)throw new Error('Part is not in the active manifest.');const editor=this.currentDraft.rig_editor_parts?.find(part=>part.id===partId),binding=editor?.binding,part={...semantic,part_id:partId,group,...(binding?.from_joint_id&&binding?.to_joint_id?{joint_ids:[binding.from_joint_id,binding.to_joint_id]}:binding?.joint_id?{joint_ids:[binding.joint_id]}:{})};return createRigReadyMetadataTemplates({characterId:this.current.character_id,rigProfile:this.currentDraft.rig_profile||'adult',bodyProportions:this.currentDraft.body_proportions||{},rig:this.currentDraft.rig||createCanonicalM1EditorRig('rig_'+this.current.character_id.slice(0,50)),parts:[part],group})[0];}
  rigMetadataJointMappingMatches(metadata,template){return metadata?.proximal_anchor?.joint===template?.proximal_anchor?.joint&&(metadata?.distal_anchor?.joint||null)===(template?.distal_anchor?.joint||null)&&metadata?.parent_joint===template?.parent_joint&&metadata?.child_joint===template?.child_joint;}
  updateArtworkRecord(partId,update){const draft=structuredClone(this.currentDraft),index=draft.artwork_parts.findIndex(item=>item.part_id===partId);if(index<0)throw new Error('Imported artwork part was not found.');draft.artwork_parts[index]=update(draft.artwork_parts[index]);this.currentDraft=draft;return draft.artwork_parts[index];}
  async generateRigMetadataCandidate(partId,{reset=false}={}){try{const record=this.artworkRecord(partId);if(!record)throw new Error('Import the clean PNG before creating metadata.');const staged=this.pendingArtworkAssets.get(this.current.character_id)?.get(record.asset_id),stored=staged?null:await this.storage.getAsset(record.asset_id),blob=staged||stored?.blob;if(!blob)throw new Error('PNG Blob is unavailable.');const bitmap=await createImageBitmap(blob);let geometry;try{const surface=typeof OffscreenCanvas==='function'?new OffscreenCanvas(bitmap.width,bitmap.height):document.createElement('canvas');surface.width=bitmap.width;surface.height=bitmap.height;const ctx=surface.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);geometry=analyzeAlphaGeometry({width:bitmap.width,height:bitmap.height,data:ctx.getImageData(0,0,bitmap.width,bitmap.height).data});}finally{bitmap.close?.();}const group=/^(left|right)_(upper_arm|forearm|hand)$/.test(partId)?'arms':/^(left|right)_(thigh|shin|foot)$/.test(partId)?'legs':'head_body',template=this.rigReadyMetadataTemplate(partId,group),previous=record.rig_metadata,metadata=createImportedRigReadyMetadata(template,{asset:{asset_id:record.asset_id,sha256:record.sha256,width:record.width,height:record.height},geometry,previous:reset?null:previous});if(reset&&previous)metadata.metadata_history=[...(previous.metadata_history||[]),structuredClone(previous)].slice(-5);this.updateArtworkRecord(partId,item=>({...item,rig_metadata:metadata}));this.jointGuidePartByCharacter.set(this.current.character_id,partId);this.error='Metadata candidate generated from the imported PNG. Alpha-derived anchors remain unverified.';}catch(error){this.error=error?.message||String(error);}this.renderEditor();}
  updateArtworkAnchorField(input){try{const field=input.dataset.jointAnchor,axis=input.dataset.axis,partId=input.dataset.partId,record=this.artworkRecord(partId),metadata=record?.rig_metadata;if(!metadata)throw new Error('Rig metadata is missing for this artwork.');const point={x:Number.isFinite(metadata[field]?.x)?metadata[field].x:0,y:Number.isFinite(metadata[field]?.y)?metadata[field].y:0};point[axis]=Number(input.value);const next=updateRigReadyAnchor(metadata,field,point);this.updateArtworkRecord(partId,item=>({...item,rig_metadata:next}));this.error='';this.renderEditor();}catch(error){this.error=error.message;this.renderEditor();}}
  async verifyArtworkAnchors(partId){try{const record=this.artworkRecord(partId);if(!record?.rig_metadata)throw new Error('Rig metadata is missing. Import the PNG again to create a candidate template.');if(record.has_transparency!==true)throw new Error('This PNG has no transparent pixels; verify a clean transparent artwork asset before its anchors.');const group=/^(left|right)_(upper_arm|forearm|hand)$/.test(partId)?'arms':/^(left|right)_(thigh|shin|foot)$/.test(partId)?'legs':'head_body',template=this.rigReadyMetadataTemplate(partId,group);if(!this.rigMetadataJointMappingMatches(record.rig_metadata,template))throw new Error('Metadata joint mapping conflicts with the current manifest or Rig Editor binding. Refresh the template, recalibrate, then verify.');const staged=this.pendingArtworkAssets.get(this.current.character_id)?.get(record.asset_id),stored=staged?null:await this.storage.getAsset(record.asset_id),asset={asset_id:record.asset_id,sha256:record.sha256,width:record.width,height:record.height},blob=staged||stored?.blob;if(!blob)throw new Error('The PNG Blob for this metadata is unavailable.');if(stored&&stored.sha256!==record.sha256)throw new Error('Asset checksum mismatch: metadata is stale.');const verified=verifyRigReadyMetadata(record.rig_metadata,asset,this.currentDraft.rig||createCanonicalM1EditorRig('rig_'+this.current.character_id.slice(0,50)),this.currentDraft.rig_profile||'adult');this.updateArtworkRecord(partId,item=>({...item,rig_metadata:verified}));this.error='Anchors verified for this exact PNG asset. This does not certify motion or seam QA.';}catch(error){this.error=error?.message||String(error);}this.renderEditor();}
  async importRigMetadataSidecar(file,partId){try{if(!file||file.type!=='application/json'&&!file.name.toLowerCase().endsWith('.json'))throw new Error('Choose a JSON metadata sidecar.');const parsed=JSON.parse(await file.text()),metadata=parsed.rig_metadata||parsed,record=this.artworkRecord(partId);if(!record)throw new Error('Import the clean PNG before its metadata sidecar.');if(metadata.part_id!==partId)throw new Error('Sidecar part_id does not match the selected artwork part.');const candidate=structuredClone(metadata);candidate.validation_status='review_required';candidate.provenance='imported_candidate';delete candidate.verified_at;delete candidate.verified_asset_checksum;for(const key of ['proximal_anchor','distal_anchor'])if(candidate[key]){candidate[key].provenance='imported_candidate';candidate[key].status='review_required';}let check=validateRigReadyMetadata(candidate,{partId,assetId:record.asset_id,sha256:record.sha256,width:record.width,height:record.height,rig:this.currentDraft.rig||createCanonicalM1EditorRig('rig_'+this.current.character_id.slice(0,50)),rigProfile:this.currentDraft.rig_profile||'adult'});const group=/^(left|right)_(upper_arm|forearm|hand)$/.test(partId)?'arms':/^(left|right)_(thigh|shin|foot)$/.test(partId)?'legs':'head_body';if(!this.rigMetadataJointMappingMatches(candidate,this.rigReadyMetadataTemplate(partId,group)))check={valid:false,reasons:[...check.reasons,'Sidecar M1 joint mapping conflicts with the current manifest.']};if(!check.valid){candidate.validation_status='stale';candidate.validation_reasons=check.reasons;}else candidate.validation_reasons=['Imported sidecar values are candidates; review markers and explicitly verify.'];this.updateArtworkRecord(partId,item=>({...item,rig_metadata:candidate}));this.error=check.valid?'Sidecar imported as an unverified candidate.':'Sidecar retained as stale: '+check.reasons.join(' ');}catch(error){this.error=error?.message||String(error);}this.renderEditor();}
  guidePoint(canvas,event,metadata){const rect=canvas.getBoundingClientRect(),map=canvas._rigGuideMapping;if(!map)throw new Error('Joint guide geometry unavailable. Wait for the PNG preview, then try again.');const px=(event.clientX-rect.left)*canvas.width/rect.width,py=(event.clientY-rect.top)*canvas.height/rect.height,point=sourcePointFromCanvas({x:px,y:py},map);if(point.x<0||point.y<0||point.x>metadata.source_width||point.y>metadata.source_height)return null;return clampSourcePoint(point,{width:metadata.source_width,height:metadata.source_height});}
  beginJointGuideDrag(event,canvas){const partId=canvas.dataset.jointGuide,record=this.artworkRecord(partId);if(!record?.rig_metadata)return;const metadata=record.rig_metadata;let point;try{point=this.guidePoint(canvas,event,metadata);}catch(error){this.error=error.message;return;}if(!point)return;const placement=this.jointGuidePlacementByCharacter.get(this.current.character_id);if(placement){try{const next=updateRigReadyAnchor(metadata,placement,point);this.updateArtworkRecord(partId,item=>({...item,rig_metadata:next}));this.jointGuidePlacementByCharacter.delete(this.current.character_id);this.renderEditor();}catch(error){this.error=error.message;this.renderEditor();}return;}
    const map=canvas._rigGuideMapping,rect=canvas.getBoundingClientRect(),cx=(event.clientX-rect.left)*canvas.width/rect.width,cy=(event.clientY-rect.top)*canvas.height/rect.height,distances=['proximal_anchor','distal_anchor'].filter(key=>metadata[key]&&Number.isFinite(metadata[key].x)&&Number.isFinite(metadata[key].y)).map(key=>{const p=canvasPointFromSource(metadata[key],map);return{key,distance:Math.hypot(p.x-cx,p.y-cy)};}).sort((a,b)=>a.distance-b.distance);if(!distances.length||distances[0].distance>18)return;event.preventDefault();canvas.setPointerCapture?.(event.pointerId);this.jointGuideDrag={pointerId:event.pointerId,canvas,partId,key:distances[0].key};}
  moveJointGuideDrag(event){const drag=this.jointGuideDrag;if(!drag||event.pointerId!==drag.pointerId)return;const record=this.artworkRecord(drag.partId);if(!record?.rig_metadata)return;try{const point=this.guidePoint(drag.canvas,event,record.rig_metadata);if(!point)return;const metadata=updateRigReadyAnchor(record.rig_metadata,drag.key,point);this.updateArtworkRecord(drag.partId,item=>({...item,rig_metadata:metadata}));this.drawJointGuideCanvas(drag.canvas,drag.canvas._rigGuideImage,metadata);const panel=drag.canvas.closest('.artwork-part-card');for(const input of panel.querySelectorAll('[data-joint-anchor]')){const value=metadata[input.dataset.jointAnchor]?.[input.dataset.axis];input.value=Number.isFinite(value)?String(Math.round(value*10)/10):'';}}catch(error){this.error=error.message;}}
  endJointGuideDrag(event){if(this.jointGuideDrag&&(!event||event.pointerId===this.jointGuideDrag.pointerId)){this.jointGuideDrag=null;this.renderEditor();}}
  drawJointGuideCanvas(canvas,image,metadata){if(!canvas||!image||!metadata)return;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#111720';ctx.fillRect(0,0,canvas.width,canvas.height);const view=canvas.dataset.jointGuide?(this.jointGuideViewByCharacter.get(this.current.character_id)||{zoom:1,panX:0,panY:0}):{zoom:1,panX:0,panY:0},scale=Math.min(canvas.width/image.width,canvas.height/image.height)*view.zoom,x=(canvas.width-image.width*scale)/2+view.panX,y=(canvas.height-image.height*scale)/2+view.panY,mapping={x,y,rotation:0,pixelScaleX:scale,pixelScaleY:scale,sourceOriginX:0,sourceOriginY:0};ctx.drawImage(image,x,y,image.width*scale,image.height*scale);canvas._rigGuideMapping=mapping;canvas._rigGuideImage=image;if(metadata.alpha_bounds){const b=metadata.alpha_bounds;ctx.save();ctx.strokeStyle='#55c8ef';ctx.setLineDash([5,4]);ctx.lineWidth=2;const p=canvasPointFromSource({x:b.x,y:b.y},mapping);ctx.strokeRect(p.x,p.y,b.width*scale,b.height*scale);ctx.restore();}const anchors=[['proximal_anchor','#42e59b','P'],['distal_anchor','#ff5c67','D']].filter(([key])=>metadata[key]&&Number.isFinite(metadata[key].x)&&Number.isFinite(metadata[key].y));if(anchors.length===2){const a=canvasPointFromSource(metadata.proximal_anchor,mapping),b=canvasPointFromSource(metadata.distal_anchor,mapping);ctx.strokeStyle='#ffd85b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}for(const[key,color,label]of anchors){const a=metadata[key],point=canvasPointFromSource(a,mapping);ctx.fillStyle=color;ctx.strokeStyle='#10151d';ctx.lineWidth=2;ctx.beginPath();ctx.arc(point.x,point.y,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.font='bold 13px system-ui';ctx.fillStyle=color;ctx.fillText(label+' '+a.joint,point.x+9,point.y-9);}ctx.font='12px system-ui';ctx.fillStyle='#dbe4f2';ctx.fillText('source_image_px · '+metadata.source_width+'×'+metadata.source_height,10,18);}
  async exportJointMarkerGuide(partId){try{const record=this.artworkRecord(partId);if(!record?.rig_metadata)throw new Error('Rig metadata is unavailable.');const staged=this.pendingArtworkAssets.get(this.current.character_id)?.get(record.asset_id),stored=staged?null:await this.storage.getAsset(record.asset_id),blob=staged||stored?.blob;if(!blob)throw new Error('PNG Blob is unavailable.');const url=URL.createObjectURL(blob),image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;this.drawJointGuideCanvas(canvas,image,record.rig_metadata);const output=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));URL.revokeObjectURL(url);if(!output)throw new Error('Guide PNG export failed.');const link=document.createElement('a'),href=URL.createObjectURL(output);link.href=href;link.download=partId+'.guide.png';link.click();URL.revokeObjectURL(href);this.error='Exported QA guide only; this is not a clean artwork asset.';}catch(error){this.error=error?.message||String(error);}this.renderEditor();}

  getPromptOptions() {
    const overrides = this.promptOptionsByCharacter.get(this.current.character_id) || {};
    const draft = this.currentDraft;
    const defaultTemplate=starterCharacterProfiles.find(profile=>profile.role===(draft.role||this.current.source_metadata?.role))?.id||'engineer',starter=getStarterProfile(overrides.starter_template||defaultTemplate);
    return {
      role: draft.role || this.current.source_metadata?.role || 'custom',
      rig_profile: draft.rig_profile || this.current.source_metadata?.rig_profile || 'adult',
      motion_style: draft.motion_style || this.current.source_metadata?.motion_style || 'natural',
      description: draft.description || '',
      style: MOTION_TO_ART_STYLE[draft.motion_style || this.current.source_metadata?.motion_style] || 'educational_cartoon',
      output_stage: 'concept', workflow_stage: 'head_body', language: 'vi', hair: '', clothing: '', accessories: '', facial_features: '', colors: '',
      starter_template:starter.id,skin_tone:starter.skin_tone,hair_style:starter.hair_style,face_style:starter.face_style,outfit:starter.outfit,
      reference_enabled: false, reference_traits: '',
      ...overrides
    };
  }

  renderPromptBuilder(host, tabs) {
    const options = this.getPromptOptions();
    const generated = this.generatedPromptByCharacter.get(this.current.character_id) || '';
    const dirty = this.isDirty();
    const appearanceStyleLabels = { educational_cartoon: 'Educational cartoon', minimal_cartoon: 'Minimal cartoon', mechanical_cartoon: 'Friendly mechanical cartoon' };
    const starterTemplates=starterCharacterProfiles.map(profile=>[profile.id,profile.label]);
    const appearanceOptionMarkup=key=>optionMarkup(starterAppearanceOptions[key],options[key]);
    let stageParts=[],stageDiagnostic='',usesDraftManifest=Array.isArray(this.currentDraft.manifest?.parts)&&this.currentDraft.manifest.parts.length>0;
    try { if(options.output_stage==='concept'||options.workflow_stage==='master')stageParts=[];else {const parts=resolveArtworkPromptParts({manifest:this.currentDraft.manifest,rig:this.currentDraft.rig});const groups=groupArtworkPromptParts(parts);stageParts=options.workflow_stage==='qa'?parts:groups[options.workflow_stage]||[];} }
    catch(error){stageDiagnostic=error?.message||String(error);}
    const stageOptions=characterArtworkStages.map(stage=>`<option value="${esc(stage.id)}"${stage.id===options.workflow_stage?' selected':''}>${esc(stage.label)}</option>`).join('');
    const stagedControl=options.output_stage==='rig_ready_parts'?`<label>Rig-Ready stage<select name="workflow_stage">${stageOptions}</select></label>`:'';
    const stagePartsMarkup=options.output_stage==='concept'?'<div class="character-stage-parts"><b>Concept preview</b><span>One full-body master concept. Review it before continuing to the part stages.</span></div>':stageDiagnostic?`<div class="character-stage-parts stage-error"><b>Stage parts unavailable</b><span>${esc(stageDiagnostic)}</span></div>`:`<div class="character-stage-parts"><b>${options.workflow_stage==='qa'?'QA checklist covers':'Parts in this stage'} · ${stageParts.length}</b><span>${stageParts.length?stageParts.map(part=>`<code>${esc(part.part_id)}</code>`).join(' '):options.workflow_stage==='master'?'Master concept has no separated parts.':'No required parts in this stage.'}</span><small>${usesDraftManifest?'Derived from this draft appearance manifest and rig.':'Using canonical M1 part vocabulary because this draft has no appearance manifest yet.'}</small></div>`;
    host.innerHTML = `${tabs}<div class="character-editor-scroll character-prompt-scroll"><div class="character-editor-heading"><div><span class="overline">ARTWORK PROMPT</span><h1>${esc(this.currentDraft.display_name)}</h1><span class="character-id-inline">Prompt options belong to this character · draft metadata is not saved here</span></div></div>
      <form class="character-prompt-form" data-form="prompt" autocomplete="off">
        <div class="character-prompt-intro">Configure an external artwork request. Generation is local and deterministic; no ChatGPT API is called.</div>
        <div class="character-form-grid character-prompt-grid"><label>Character role<select name="role">${optionMarkup(CHARACTER_ROLES, options.role)}</select></label><label>Appearance style<select name="style">${optionMarkup(CHARACTER_ART_STYLES, options.style, appearanceStyleLabels)}</select></label><label>Rig profile<select name="rig_profile">${optionMarkup(CHARACTER_RIG_PROFILES, options.rig_profile)}</select></label><label>Motion style<select name="motion_style">${optionMarkup(CHARACTER_MOTION_STYLES, options.motion_style)}</select></label><label>Output mode<select name="output_stage"><option value="concept"${options.output_stage === 'concept' ? ' selected' : ''}>Concept Artwork</option><option value="rig_ready_parts"${options.output_stage === 'rig_ready_parts' ? ' selected' : ''}>Rig-Ready Parts</option></select></label>${stagedControl}<label>Prompt language<select name="language"><option value="vi"${options.language === 'vi' ? ' selected' : ''}>Tiếng Việt</option><option value="en"${options.language === 'en' ? ' selected' : ''}>English</option></select></label></div>
        <section class="character-starter-look"><div><b>Starter appearance · Free in-app presets</b><small>These settings guide generated artwork; they do not alter PNG files or rig transforms.</small></div><div class="character-form-grid character-prompt-grid"><label>Starter template<select name="starter_template">${optionMarkup(starterTemplates,options.starter_template)}</select></label><label>Skin / material<select name="skin_tone">${appearanceOptionMarkup('skin_tone')}</select></label><label>Hair style<select name="hair_style">${appearanceOptionMarkup('hair_style')}</select></label><label>Face style<select name="face_style">${appearanceOptionMarkup('face_style')}</select></label><label>Outfit<select name="outfit">${appearanceOptionMarkup('outfit')}</select></label></div></section>
        <label class="character-prompt-field">Character description <small>Defaults from the open draft; prompt-only edits do not change the draft.</small><textarea name="description" maxlength="500" rows="2">${esc(options.description)}</textarea></label>
        <div class="character-form-grid character-prompt-grid"><label>Hair<textarea name="hair" maxlength="500" rows="2" placeholder="Hair style, color, shape">${esc(options.hair)}</textarea></label><label>Clothing<textarea name="clothing" maxlength="500" rows="2" placeholder="Clothing and colors">${esc(options.clothing)}</textarea></label><label>Accessories<textarea name="accessories" maxlength="500" rows="2" placeholder="Accessories">${esc(options.accessories)}</textarea></label><label>Facial features<textarea name="facial_features" maxlength="500" rows="2" placeholder="Eyes, expression, face shape">${esc(options.facial_features)}</textarea></label><label>Color palette<textarea name="colors" maxlength="500" rows="2" placeholder="Main, secondary and accent colors">${esc(options.colors)}</textarea></label></div>
        <label class="character-reference-toggle"><input name="reference_enabled" type="checkbox"${options.reference_enabled ? ' checked' : ''}> Use a reference image</label>
        <label class="character-prompt-field">Traits to preserve from reference <small>Choose only the features you want to carry over.</small><textarea name="reference_traits" maxlength="500" rows="2" placeholder="Hairstyle, eye shape, face details, colors, demeanor">${esc(options.reference_traits)}</textarea></label>
        ${stagePartsMarkup}
      </form>
      <section class="character-generated-prompt"><div class="character-generated-heading"><div><span class="overline">GENERATED PROMPT</span><span class="character-prompt-feedback" role="status">${esc(this.promptFeedback)}</span></div><div class="character-prompt-actions"><button type="button" class="tool-chip character-prompt-action" data-action="select-prompt"${generated ? '' : ' disabled'}>Select All</button><button type="button" class="tool-chip character-prompt-action" data-action="copy-prompt"${generated ? '' : ' disabled'}>Copy Prompt</button><button type="button" class="export-button character-prompt-action" data-action="generate-prompt">${generated ? 'Regenerate Prompt' : 'Generate Prompt'}</button></div></div><textarea class="character-prompt-output" data-generated-prompt readonly aria-label="Generated artwork prompt" placeholder="Choose options, then generate a prompt.">${esc(generated)}</textarea></section></div><div class="character-editor-actions"><span class="character-save-status">${dirty ? 'Unsaved metadata changes' : ''}</span><button type="button" class="tool-chip" data-action="discard"${dirty ? '' : ' disabled'}>Discard</button><button type="button" class="export-button" data-action="save"${dirty && !this.saving ? '' : ' disabled'}>Save draft</button></div>`;
  }

  updatePromptField(field) {
    if (!this.current || field.form?.dataset.form !== 'prompt') return;
    const options = { ...(this.promptOptionsByCharacter.get(this.current.character_id) || {}) };
    options[field.name] = field.type === 'checkbox' ? field.checked : field.value;
    if(field.name==='starter_template')for(const key of ['skin_tone','hair_style','face_style','outfit'])delete options[key];
    this.promptOptionsByCharacter.set(this.current.character_id, options);
    this.generatedPromptByCharacter.delete(this.current.character_id);
    this.promptFeedback = '';
    if(field.name==='starter_template')this.renderEditor();
  }

  generatePrompt() {
    if (!this.current || !this.currentDraft) return;
    const options = this.getPromptOptions();
    try {
      const result = generatePromptStageForCharacter(this.currentDraft, options, this.current.character_id);
      this.generatedPromptByCharacter.set(this.current.character_id, result.prompt);
      this.promptFeedback = '';
      this.showStudioToast('Prompt generated.');
    } catch (error) { this.promptFeedback = error?.message || 'Could not generate prompt.'; this.showStudioToast(this.promptFeedback,{kind:'error'}); }
    this.renderEditor();
  }

  async copyPrompt() {
    const prompt = this.generatedPromptByCharacter.get(this.current?.character_id);
    if (!prompt) return;
    try {
      const output = this.root.querySelector('[data-generated-prompt]');
      await copyPromptText(prompt, { output });
      this.promptFeedback = 'Prompt copied.';
      this.showStudioToast('Prompt copied to clipboard.');
    } catch (error) { this.promptFeedback = `Copy failed: ${error?.message || 'clipboard permission unavailable'}`; this.showStudioToast(this.promptFeedback,{kind:'error'}); }
    this.renderEditor();
  }

  selectPrompt() {
    const output = this.root.querySelector('[data-generated-prompt]');
    if (!output) return;
    output.focus(); output.select(); this.promptFeedback = 'Prompt selected. Copy it with Ctrl+C.';
    this.showStudioToast('Prompt selected. Press Ctrl+C to copy.');
    const feedback = this.root.querySelector('.character-prompt-feedback'); if (feedback) feedback.textContent = this.promptFeedback;
  }

  renderInspector() {
    const host = this.root.querySelector('[data-region="inspector"]'); if (!host) return;
    if (!this.current) { host.innerHTML = '<div class="character-inspector-empty"><span class="overline">INSPECTOR</span><p>Select a character to view its metadata and published versions.</p></div>'; return; }
    const meta = this.current.source_metadata || {},characterType=normalizeCharacterType(this.current.character_type??this.currentDraft?.character_type);
    const versions = this.current.published_versions || [];
    host.innerHTML = `<span class="overline">CHARACTER DETAILS</span><h2>${esc(this.current.display_name)}</h2><dl><dt>Character ID</dt><dd class="character-id-value"><code title="${esc(this.current.character_id)}">${esc(shortenCharacterId(this.current.character_id))}</code><button type="button" class="character-copy-id" data-action="copy-id" aria-label="Copy full Character ID">Copy</button><span class="character-copy-status" role="status">${esc(this.copyStatus)}</span></dd><dt>Character type</dt><dd><span class="character-type-badge ${characterType}">${characterType==='sprite'?'Sprite':'Rigged'}</span></dd><dt>Role</dt><dd>${esc(roleName(meta.role))}</dd>${characterType==='rigged'?`<dt>Rig profile</dt><dd>${esc(meta.rig_profile || 'Not set')}</dd><dt>Motion style</dt><dd>${esc(meta.motion_style || meta.style_profile || 'Not set')}</dd>`:''}<dt>Modified</dt><dd>${esc(this.current.updated_at ? new Date(this.current.updated_at).toLocaleString() : '—')}</dd><dt>Validation</dt><dd>${characterType==='sprite'?'Sprite publication validation is available in the editor.':'Metadata draft · no published validation report'}</dd></dl><div class="section-title">PUBLISHED VERSIONS</div>${versions.length ? `<ul class="character-version-list">${versions.map(version => `<li><span>v${esc(version)}</span><small>Immutable</small>${characterType==='sprite'?`<button type="button" class="tool-chip" data-action="sprite-open-published" data-version="${esc(version)}">View</button>`:''}</li>`).join('')}</ul>` : '<p class="character-inspector-muted">No published versions yet.</p>'}${characterType==='sprite'?'<p class="character-inspector-muted">Published Sprite versions are immutable, read-only snapshots.</p>':''}`;
  }

  async copyCharacterId() {
    if (!this.current) return;
    try { await navigator.clipboard.writeText(this.current.character_id); this.copyStatus = 'Copied'; this.showStudioToast('Character ID copied.'); }
    catch { this.copyStatus = 'Copy unavailable'; this.showStudioToast('Could not copy Character ID. Check clipboard permission.',{kind:'error'}); }
    this.renderInspector();
  }

  updateField(field) {
    if (field.form?.dataset.form !== 'editor' || !this.currentDraft) return;
    if (field.name in this.currentDraft) {const previous=this.currentDraft[field.name];this.currentDraft[field.name] = field.value;if(field.name==='rig_profile'&&previous!==field.value)for(const item of this.currentDraft.artwork_parts||[])if(item.rig_metadata){item.rig_metadata.validation_status='review_required';item.rig_metadata.validation_reasons=['Rig profile changed; confirm proportion guidance and revalidate metadata compatibility.'];}}
    this.generatedPromptByCharacter.delete(this.current?.character_id);
    this.promptFeedback = '';
    const dirty = this.isDirty();
    const indicator = this.root.querySelector('.character-draft-indicator');
    if (indicator) { indicator.textContent = dirty ? 'Unsaved changes' : 'Draft saved'; indicator.classList.toggle('unsaved', dirty); }
    const save = this.root.querySelector('[data-action="save"]'); if (save) save.disabled = !dirty || this.saving;
    const discard = this.root.querySelector('[data-action="discard"]'); if (discard) discard.disabled = !dirty;
  }

  openCreate() {
    const form = this.root.querySelector('[data-form="create"]');
    this.syncCreateDefaults(form);
    const dialog = this.root.querySelector('[data-region="create-dialog"]');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    form.elements.display_name.focus();
  }

  closeCreate() { const dialog = this.root.querySelector('[data-region="create-dialog"]'); if (dialog.open) dialog.close(); else dialog.removeAttribute('open'); }

  syncCreateDefaults(form) {
    if (!form) return;
    const sprite=form.elements.character_type.value==='sprite',riggedFields=form.querySelector('[data-create-rigged]'),spriteFields=form.querySelector('[data-create-sprite]');if(riggedFields)riggedFields.hidden=sprite;if(spriteFields)spriteFields.hidden=!sprite;for(const name of ['rig_profile','motion_style'])form.elements[name].required=!sprite;form.elements.sprite_template.required=sprite;
    const role = form.elements.role.value;
    if(sprite)return;
    if (role === 'student' && form.elements.rig_profile.value === 'adult') form.elements.rig_profile.value = 'student';
    if (role === 'humanoid_robot') { form.elements.rig_profile.value = 'humanoid_robot'; form.elements.motion_style.value = 'robotic'; }
  }

  async createFromForm(form) {
    const errorHost = this.root.querySelector('[data-region="create-error"]'); errorHost.textContent = '';
    let draft;
    try { draft = createMetadataDraft(Object.fromEntries(new FormData(form))); }
    catch (error) { errorHost.textContent = error.message; return; }
    const previous = this.current?.character_id;
    if (previous && !this.confirmDiscard()) return;
    this.activeSection = 'overview'; this.promptFeedback = '';
    const character_id = createCharacterId(draft.display_name);
    try {
      const source_metadata=draft.character_type==='rigged'?{role:draft.role,rig_profile:draft.rig_profile,motion_style:draft.motion_style,style_profile:draft.motion_style}:{role:draft.role};
      const record = await this.storage.createCharacter({ character_id, character_type:draft.character_type, display_name: draft.display_name, description: draft.description, source_metadata });
      this.current = record;
      this.currentDraft = await this.storage.getCharacterDraft(character_id);
      this.currentDraft = { ...this.currentDraft, ...draft };
      this.savedDraft = structuredClone(this.currentDraft);
      await this.storage.saveCharacterDraft(character_id, this.currentDraft);
      this.savedDraft = structuredClone(this.currentDraft);
      await this.refresh();
      this.current = this.characters.find(item => item.character_id === character_id) || record;
      this.closeCreate(); form.reset(); this.render();
    } catch (error) { errorHost.textContent = error?.message || 'Could not create character draft.'; }
  }

  async openCharacter(characterId) {
    if (this.current?.character_id === characterId || !this.confirmDiscard()) return;
    this.error = ''; this.promptFeedback = ''; this.current = null; this.currentDraft = null; this.savedDraft = null; this.render();
    try {
      const record = this.characters.find(item => item.character_id === characterId) || await this.storage.getCharacter(characterId);
      if (!record) throw new Error('Character no longer exists in this library.');
      const draft = await this.storage.getCharacterDraft(characterId);
      if (!draft) throw new Error('Draft data is missing for this character.');
      const character_type=normalizeCharacterType(draft.character_type??record.character_type),role=draft.role||record.source_metadata?.role||'custom';this.current = {...record,character_type}; this.currentDraft = { ...structuredClone(draft),character_type, ...(character_type==='sprite'?{sprite_character:normalizeSpriteProductionDefinition(draft.sprite_character?{...draft.sprite_character,identity:{...SPRITE_IDENTITY_DEFAULTS,character_name:draft.display_name,role_or_profession:roleName(role),starter_profile:SPRITE_PROFILE_BY_ROLE[role]||'teacher',...draft.sprite_character.identity}}:createSpriteProductionDefinition(createSampleSpriteCharacterDefinition(),{...SPRITE_IDENTITY_DEFAULTS,character_name:draft.display_name,role_or_profession:roleName(role),starter_profile:SPRITE_PROFILE_BY_ROLE[role]||'teacher'}))}:{}),role, ...(character_type==='rigged'?{rig_profile:draft.rig_profile||record.source_metadata?.rig_profile||'adult',motion_style:draft.motion_style||record.source_metadata?.motion_style||record.source_metadata?.style_profile||'natural'}:{}) }; this.savedDraft = structuredClone(this.currentDraft);
    } catch (error) { this.error = error?.message || String(error); }
    this.render();
  }

  async saveDraft() {
    if (!this.currentDraft || this.saving) return;
    try {
      const normalized = createMetadataDraft({...this.currentDraft,character_type:this.currentDraft.character_type||this.current.character_type||'rigged'});
      this.saving = true; this.error = ''; this.renderEditor();
      const pending = this.pendingArtworkAssets.get(this.current.character_id) || new Map();
      const assets = [...new Set((this.currentDraft.asset_refs || []))].map(asset_id => ({ asset_id, blob: pending.get(asset_id) })).filter(entry => entry.blob);
      const saved = await this.storage.saveCharacterDraft(this.current.character_id, { ...this.currentDraft, asset_refs:normalized.character_type==='sprite'?collectSpriteAssetReferences(this.currentDraft.sprite_character):this.currentDraft.asset_refs, character_type:normalized.character_type, display_name: normalized.display_name, description: normalized.description, role: normalized.role, ...(normalized.character_type==='rigged'?{rig_profile:normalized.rig_profile,motion_style:normalized.motion_style}:{sprite_character:normalizeSpriteProductionDefinition(this.currentDraft.sprite_character)}) }, { assets });
      this.pendingArtworkAssets.set(this.current.character_id, new Map());
      this.currentDraft = structuredClone(saved); this.savedDraft = structuredClone(saved);
      this.characters = await this.storage.listCharacters(); this.current = this.characters.find(item => item.character_id === this.current.character_id) || this.current;
      this.error = ''; this.render(); this.showStudioToast('Draft saved.');
    } catch (error) { this.error = error?.message || String(error); this.showStudioToast(`Save failed: ${this.error}`,{kind:'error',duration:4200}); this.renderEditor(); }
    finally { this.saving = false; this.renderEditor(); this.renderInspector(); }
  }

  discardChanges() { if (!this.isDirty()) return; this.currentDraft = structuredClone(this.savedDraft); if (this.current) this.pendingArtworkAssets.set(this.current.character_id, new Map()); this.error = ''; this.render(); }
}

export function initializeCharacterStudio(root = document.querySelector('#character-studio-workspace'), options = {}) {
  if (!root) return null;
  const manager = new CharacterStudioManager(root, options);
  manager.ready = manager.mount();
  return manager;
}
