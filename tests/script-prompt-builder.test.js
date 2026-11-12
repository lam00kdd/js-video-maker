import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptPublishedCharacterCapabilities, assembleScriptPrompt, buildCharacterDirectionPrompt, buildScriptStructureGuide, describePublishedPromptCatalog, filterPublishedPromptCharacters, loadPublishedPromptCharacters, validateCharacterAwareScript, validateScriptCharacterDirections } from '../src/render/script-prompt-builder.js';

const checksum='a'.repeat(64),identity=(character_id,character_type='sprite')=>({character_id,character_type,display_name:character_id,published_versions:['1.0.0']});
const spriteRecord={character_id:'char_robot_1',character_type:'sprite',version:'1.0.0',content_checksum:checksum,validation_status:'validated',diagnostics:[],sprite_snapshot:{schema_version:1,character_id:'char_robot_1',version:'1.0.0',default_pose_id:'idle',poses:[{pose_id:'idle',label:'Idle'},{pose_id:'greet',label:'Greet'}],clips:[{clip_id:'wave',label:'Wave',fps:8,frame_count:8,frames:Array.from({length:8},()=>({duration_seconds:.125}))}]}};
const riggedRecord={character_id:'char_teacher',version:'2.0.0',content_checksum:'b'.repeat(64),validation_status:'validated',diagnostics:[],compatible_motion_features:['idle','breathe','blink','wave','teleport'],motion_style:'natural',rig:{joints:[]},manifest:{parts:[]}};

test('capability adapter exposes only immutable, validated Sprite capabilities and clip timing',()=>{
 const result=adaptPublishedCharacterCapabilities(identity('char_robot_1'),spriteRecord);
 assert.equal(result.character_type,'sprite');assert.equal(result.published_version,'1.0.0');assert.equal(result.published_checksum,checksum);
 assert.deepEqual(result.available_poses.map(item=>item.pose_id),['idle','greet']);assert.deepEqual(result.available_clips.map(item=>[item.clip_id,item.fps,item.duration_seconds]),[['wave',8,1]]);
 assert.equal(buildCharacterDirectionPrompt(result).includes('wave'),true);assert.match(buildCharacterDirectionPrompt(result),/immutable version 1\.0\.0/);
 assert.match(buildCharacterDirectionPrompt(result),/CHATGPT SELECTS/);assert.match(buildCharacterDirectionPrompt(result,{useMode:'required'}),/at least one suitable scene/);assert.match(buildCharacterDirectionPrompt(result),/variants\.landscape\.scenes/);assert.match(buildCharacterDirectionPrompt(result),/independent placement/);
});

test('Rigged adapter retains only runtime-supported published motions',()=>{
 const result=adaptPublishedCharacterCapabilities(identity('char_teacher','rigged'),riggedRecord);
 assert.deepEqual(result.available_motions,['idle','breathe','blink']);assert.equal(result.available_motions.includes('wave'),false);assert.equal(result.default_action,'idle');
 assert.match(buildCharacterDirectionPrompt(result),/Do not use Sprite pose or clip IDs/);
});

test('published listing reads published versions only and filters All/Sprite/Rigged',async()=>{
 let draftsRead=0,spriteListingCalls=0;const teacher={...identity('char_teacher','rigged'),published_versions:['2.0.0']},robot={...identity('char_robot_1'),published_versions:[]},storage={listCharacters:async()=>[robot,teacher,{character_id:'char_draft_only',character_type:'sprite',display_name:'Draft',published_versions:[]}],listPublishedSpriteVersions:async()=>{spriteListingCalls++;return[{character_id:'char_robot_1',character_type:'sprite',version:'1.0.0',content_checksum:checksum,display_name:'Robot 1',poses:[{pose_id:'idle'},{pose_id:'greet'}],clips:[{clip_id:'wave'}]}];},resolvePublishedSpriteCharacter:async()=>({status:'resolved',character_id:'char_robot_1',version:'1.0.0',snapshot:spriteRecord.sprite_snapshot,content_checksum:checksum}),getCharacterVersion:async()=>riggedRecord,getCharacterDraft:async()=>{draftsRead++;throw Error('must not read drafts');}};
 const listed=await loadPublishedPromptCharacters(storage);assert.equal(listed.capabilities.length,2,'Sprite discovery comes from the immutable versions store even when its identity version list is stale');assert.equal(listed.capabilities.find(item=>item.character_type==='sprite').published_version,'1.0.0');assert.deepEqual(listed.capabilities.find(item=>item.character_type==='sprite').available_poses.map(item=>item.pose_id),['idle','greet']);assert.deepEqual(listed.capabilities.find(item=>item.character_type==='sprite').available_clips.map(item=>item.clip_id),['wave']);assert.equal(draftsRead,0);assert.equal(spriteListingCalls,1);assert.equal(filterPublishedPromptCharacters(listed.capabilities).length,2);assert.deepEqual(filterPublishedPromptCharacters(listed.capabilities,'sprite').map(item=>item.character_id),['char_robot_1']);assert.deepEqual(filterPublishedPromptCharacters(listed.capabilities,'rigged').map(item=>item.character_id),['char_teacher']);
 await loadPublishedPromptCharacters(storage);assert.equal(spriteListingCalls,2,'calling the loader again refreshes the published-version index when the builder is reopened');
});

test('unavailable published versions are excluded with actionable diagnostics',async()=>{
 const storage={listCharacters:async()=>[identity('char_robot_1')],listPublishedSpriteVersions:async()=>[{character_id:'char_robot_1',version:'1.0.0',display_name:'Robot 1'}],resolvePublishedSpriteCharacter:async()=>({status:'missing_version',diagnostics:[{message:'Pinned version unavailable'}]})};
 const result=await loadPublishedPromptCharacters(storage);assert.equal(result.capabilities.length,0);assert.match(result.diagnostics[0].message,/Pinned version unavailable/);
});

test('Sprite selector recovers immutable versions omitted by the convenience index',async()=>{
 const robot=identity('char_robot_1');let resolved=0;
 const storage={listCharacters:async()=>[robot],listPublishedSpriteVersions:async()=>[],resolvePublishedSpriteCharacter:async(id,version)=>{resolved++;return{status:'resolved',character_id:id,version,snapshot:spriteRecord.sprite_snapshot,content_checksum:checksum};}};
 const result=await loadPublishedPromptCharacters(storage);
 assert.equal(resolved,1);assert.deepEqual(result.capabilities.map(item=>item.character_id),['char_robot_1']);assert.equal(result.diagnostics.length,0);
});

test('empty, loading, type-mismatch, manifest-error and IndexedDB-error states are distinct',async()=>{
 assert.equal(describePublishedPromptCatalog({loading:true}).state,'loading');assert.equal(describePublishedPromptCatalog({catalog:{capabilities:[],diagnostics:[],sourceErrors:[]}}).state,'empty');
 const onlySprite={capabilities:[adaptPublishedCharacterCapabilities(identity('char_robot_1'),spriteRecord)],diagnostics:[],sourceErrors:[]};assert.equal(describePublishedPromptCatalog({catalog:onlySprite,type:'rigged'}).state,'no_match');assert.match(describePublishedPromptCatalog({catalog:onlySprite,type:'rigged'}).message,/shared SQLite catalog/);
 assert.equal(describePublishedPromptCatalog({catalog:{capabilities:[],diagnostics:[],sourceErrors:[],unpublished:[{character_id:'char_robot_1',character_type:'sprite',display_name:'Robot 1'}]},type:'sprite'}).state,'needs_publish');
 const wrongTypeOnly={capabilities:[adaptPublishedCharacterCapabilities(identity('char_teacher','rigged'),{...riggedRecord,character_id:'char_teacher',version:'2.0.0'})],diagnostics:[{character_id:'char_robot_1',character_type:'sprite',message:'Frame 1 is missing.'}],sourceErrors:[]};assert.equal(describePublishedPromptCatalog({catalog:wrongTypeOnly,type:'sprite'}).state,'validation_error');assert.match(describePublishedPromptCatalog({catalog:wrongTypeOnly,type:'sprite'}).message,/Frame 1 is missing/);
 assert.equal(describePublishedPromptCatalog({catalog:{capabilities:[],diagnostics:[{message:'bad snapshot'}],sourceErrors:[]}}).state,'validation_error');assert.equal(describePublishedPromptCatalog({catalog:{capabilities:[],diagnostics:[],sourceErrors:[{message:'IndexedDB blocked'}]}}).message,'Character Library access error: IndexedDB blocked');
 const failed=await loadPublishedPromptCharacters({listCharacters:async()=>[],listPublishedSpriteVersions:async()=>{throw new Error('IndexedDB blocked');}});assert.match(describePublishedPromptCatalog({catalog:failed}).message,/IndexedDB blocked/);
});

test('optional character OFF adds no character contract while duration guide enforces scene budget',()=>{
 const off=buildScriptStructureGuide({targetDuration:120,outroEnabled:true,outroDuration:8});
 assert.doesNotMatch(off,/character_directions|Published Character|capability manifest/i);assert.match(off,/không vượt 172 giây/);assert.match(off,/1–100 cảnh/);assert.match(buildScriptStructureGuide({targetDuration:120}),/ví dụ JSON một cảnh bên dưới chỉ minh họa cấu trúc/);
 const capability=adaptPublishedCharacterCapabilities(identity('char_robot_1'),spriteRecord),base='existing prompt',withCharacter=assembleScriptPrompt({basePrompt:base,structureGuide:off,characterEnabled:true,capability}),requiredCharacter=assembleScriptPrompt({basePrompt:base,structureGuide:off,characterEnabled:true,capability,characterUseMode:'required'}),withoutCharacter=assembleScriptPrompt({basePrompt:base,structureGuide:off,characterEnabled:false,capability});assert.match(withCharacter,/CHATGPT SELECTS/);assert.match(requiredCharacter,/at least one suitable scene/);assert.doesNotMatch(withoutCharacter,/character_directions|char_robot_1|Published Character/);assert.equal(assembleScriptPrompt({basePrompt:base,structureGuide:off,characterEnabled:false}),withoutCharacter);assert.throws(()=>assembleScriptPrompt({basePrompt:base,characterEnabled:true}),/Select and revalidate/);
 const shortMode=buildScriptStructureGuide({targetDuration:8,singleScene:true});assert.match(shortMode,/đúng một scene/);
});

test('direction validator checks exact pin, type, capability, timing and placement',()=>{
 const sprite=adaptPublishedCharacterCapabilities(identity('char_robot_1'),spriteRecord),valid={character_id:'char_robot_1',character_type:'sprite',published_version:'1.0.0',published_checksum:checksum,animation:{type:'clip',id:'wave',start_seconds:0,duration_seconds:.8,loop:false,hold_last_frame:true},placement:{x:.5,y:.8,scale:1}};
 assert.deepEqual(validateScriptCharacterDirections([valid],{capabilities:[sprite],sceneDuration:3}),[]);
 const errors=validateScriptCharacterDirections([{...valid,character_type:'rigged',published_checksum:'0'.repeat(64),animation:{type:'motion',id:'teleport',start_seconds:-1},placement:{x:2,y:.5,scale:99}}],{capabilities:[sprite],sceneDuration:3});assert(errors.length>=4);
});

test('character-aware output validator is opt-in and checks nine-scene aspect variants without changing Scene Graph content',()=>{
 const sprite=adaptPublishedCharacterCapabilities(identity('char_robot_1'),spriteRecord),originalObjects=[{id:'diagram',type:'circle'}];
 const makeScene=(portrait=false)=>({estimated_seconds:5,scene_graph:{version:2,objects:structuredClone(originalObjects)},character_directions:[{character_id:'char_robot_1',character_type:'sprite',published_version:'1.0.0',published_checksum:checksum,animation:{type:'clip',id:'wave',start_seconds:0,duration_seconds:1,loop:false,hold_last_frame:true},placement:{x:portrait?.5:.78,y:.65,scale:portrait?.8:1}}]});
 const script={aspect_ratio:'both',variants:{landscape:{scenes:Array.from({length:9},(_,i)=>makeScene(false))},portrait:{scenes:Array.from({length:9},(_,i)=>makeScene(true))}}};
 assert.deepEqual(validateCharacterAwareScript(script,{enabled:false,capability:sprite}),[]);
 assert.deepEqual(validateCharacterAwareScript(script,{enabled:true,capability:sprite,useMode:'required'}),[]);
 assert.deepEqual(script.variants.landscape.scenes[0].scene_graph.objects,originalObjects,'validation must preserve existing illustration objects');
 const missing=structuredClone(script);missing.variants.portrait.scenes.forEach(scene=>delete scene.character_directions);
 assert(validateCharacterAwareScript(missing,{enabled:true,capability:sprite,useMode:'required'}).some(error=>error.startsWith('portrait: Character Direction was enabled')));
 const invalid=structuredClone(script);invalid.variants.landscape.scenes[3].character_directions[0].placement={x:2,y:.5,scale:1};invalid.variants.landscape.scenes[3].character_directions[0].animation.id='not-published';
 const errors=validateCharacterAwareScript(invalid,{enabled:true,capability:sprite});assert(errors.some(error=>error.includes('landscape scene 4')));assert(errors.some(error=>error.includes('animation type or ID is unsupported')));assert(errors.some(error=>error.includes('placement must use normalized')));
});

test('auto-select mode allows no character when content does not need one; required mode blocks missing directions',()=>{
 const sprite=adaptPublishedCharacterCapabilities(identity('char_robot_1'),spriteRecord),ordinary={aspect_ratio:'16:9',scenes:[{estimated_seconds:4,scene_graph:{version:2,objects:[]}}]};
 assert.deepEqual(validateCharacterAwareScript(ordinary,{enabled:false,capability:sprite}),[]);
 assert.deepEqual(validateCharacterAwareScript(ordinary,{enabled:true,capability:sprite,useMode:'auto'}),[]);
 assert(validateCharacterAwareScript(ordinary,{enabled:true,capability:sprite,useMode:'required'}).some(error=>error.includes('no valid Published Character directions')));
});

test('character-aware output validator supports only published Rigged actions',()=>{
 const rigged=adaptPublishedCharacterCapabilities(identity('char_teacher','rigged'),{...riggedRecord,character_id:'char_teacher',version:'2.0.0'}),scene={estimated_seconds:5,scene_graph:{version:2,objects:[]},character_directions:[{character_id:'char_teacher',character_type:'rigged',published_version:'2.0.0',published_checksum:'b'.repeat(64),animation:{type:'motion',id:'breathe',start_seconds:0,duration_seconds:4,loop:true},placement:{x:.5,y:.7,scale:1}}]};
 assert.deepEqual(validateCharacterAwareScript({aspect_ratio:'16:9',scenes:[scene]},{enabled:true,capability:rigged}),[]);
 const invalid=structuredClone(scene);invalid.character_directions[0].animation.id='teleport';assert(validateCharacterAwareScript({aspect_ratio:'16:9',scenes:[invalid]},{enabled:true,capability:rigged}).some(error=>error.includes('animation type or ID is unsupported')));
});

test('Multi-character AI Director prompt lists each pinned cast capability and validates against the allowed cast',()=>{
 const sprite=adaptPublishedCharacterCapabilities(identity('char_robot_1'),spriteRecord),rigged=adaptPublishedCharacterCapabilities(identity('char_teacher','rigged'),{...riggedRecord,character_id:'char_teacher',version:'2.0.0'}),cast=[{...sprite,role_hint:'Host'},{...rigged,role_hint:'Engineer'}];
 const prompt=assembleScriptPrompt({basePrompt:'base',characterEnabled:true,capability:cast,characterUseMode:'auto'});
 assert.match(prompt,/char_robot_1/);assert.match(prompt,/char_teacher/);assert.match(prompt,/Host/);assert.match(prompt,/Engineer/);assert.match(prompt,/Do not require every selected character to appear/);
 const spriteDirection={character_id:sprite.character_id,character_type:'sprite',published_version:sprite.published_version,published_checksum:sprite.published_checksum,animation:{type:'pose',id:'idle',start_seconds:0,duration_seconds:4},placement:{x:.25,y:.7,scale:1}},riggedDirection={character_id:rigged.character_id,character_type:'rigged',published_version:rigged.published_version,published_checksum:rigged.published_checksum,animation:{type:'motion',id:'breathe',start_seconds:0,duration_seconds:4},placement:{x:.75,y:.7,scale:1}};
 const scene=directions=>({estimated_seconds:5,scene_graph:{version:2,objects:[]},character_directions:directions}),dual={aspect_ratio:'both',variants:{landscape:{scenes:[scene([spriteDirection,riggedDirection])]},portrait:{scenes:[scene([spriteDirection])]}}};
 assert.deepEqual(validateCharacterAwareScript(dual,{enabled:true,capabilities:cast,useMode:'required'}),[]);
 const outside=structuredClone(dual);outside.variants.landscape.scenes[0].character_directions[0].character_id='char_unknown';assert(validateCharacterAwareScript(outside,{enabled:true,capabilities:cast,useMode:'required'}).some(error=>error.includes('unknown character ID or published version')));
 const empty={aspect_ratio:'both',variants:{landscape:{scenes:[scene(undefined)]},portrait:{scenes:[scene(undefined)]}}};assert.deepEqual(validateCharacterAwareScript(empty,{enabled:true,capabilities:cast,useMode:'auto'}),[]);assert(validateCharacterAwareScript(empty,{enabled:true,capabilities:cast,useMode:'required'}).length>0);
});
