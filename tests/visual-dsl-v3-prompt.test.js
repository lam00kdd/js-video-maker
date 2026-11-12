import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {visualDslV3Capabilities,visualDslV3GeometryFields,validateVisualDslV3} from '../src/visual-dsl-v3.js';
import {buildVisualDirectorGuidance,buildVisualDslV3SinglePrompt,buildVisualDslV3SeriesPrompt,createVisualDslV3CanonicalExamples,validateVisualDslV3CanonicalExamples,visualDslV3PromptContract} from '../src/render/visual-dsl-v3-prompt.js';

const extractExample=prompt=>{const match=prompt.match(/```json\n([\s\S]*?)\n```/);assert(match,'prompt includes one complete JSON example');return JSON.parse(match[1]);};

test('runtime capability manifest exposes the exact geometry, timeline, easing, loop and preset contract',()=>{
 assert.deepEqual(visualDslV3Capabilities.geometry_fields,visualDslV3GeometryFields);
 assert.deepEqual(visualDslV3Capabilities.style_presets,['scientific_premium','educational_cartoon_premium']);
 assert.deepEqual(visualDslV3Capabilities.easing,['linear','ease_in','ease_out','ease_in_out']);
 assert.deepEqual(visualDslV3Capabilities.font_weights,['normal','600','bold']);
 assert.deepEqual(visualDslV3Capabilities.loop_modes,['repeat','ping_pong']);
 assert(visualDslV3Capabilities.nodes.includes('symbol_instance'));
 assert(visualDslV3Capabilities.reserved_unavailable.includes('character_instance'));
 const contract=visualDslV3PromptContract();for(const field of ['visual_dsl_version','geometry_fields','timeline_track_fields','keyframe_fields','loop_modes','180','Published Characters'])assert(contract.includes(field));
});

test('font_weight prompt, manifest, and validator share one strict supported set',()=>{
 const document=createVisualDslV3CanonicalExamples()['cp53a-animated-vector.json'];
 const geometry=document.scenes[0].root.children.find(node=>node.id==='title').geometry;
 assert(visualDslV3PromptContract().includes('font_weight chỉ nhận: normal / 600 / bold'));
 for(const weight of visualDslV3Capabilities.font_weights){geometry.font_weight=weight;assert.equal(validateVisualDslV3(document),true,weight);}
 for(const weight of ['500','700',500,700]){geometry.font_weight=weight;assert.throws(()=>validateVisualDslV3(document),/font_weight must be normal, 600, bold/,String(weight));}
});

test('all compact canonical single, animated, premium, portrait and BOTH examples pass the actual validator and match checked-in fixtures',async()=>{
 const expected=createVisualDslV3CanonicalExamples(),checked=validateVisualDslV3CanonicalExamples();
 for(const [name,document]of Object.entries(expected)){
  assert.deepEqual(checked[name],document);assert.equal(validateVisualDslV3(document),true);
  const stored=JSON.parse(await readFile(new URL(`../examples/visual_dsl_v3/cp53a/${name}`,import.meta.url),'utf8'));
  assert.deepEqual(stored,document,name);
 }
 assert.equal(expected['cp53a-minimal-landscape.json'].aspect_ratio,'16:9');
 assert.equal(expected['cp53a-portrait-cartoon.json'].aspect_ratio,'9:16');
 assert.equal(expected['cp53a-portrait-cartoon.json'].art_direction.preset,'educational_cartoon_premium');
 assert.equal(expected['cp53a-both-aspects.json'].variants.portrait.scenes[0].stage.height,1600);
 assert.equal(expected['cp53a-both-aspects.json'].variants.landscape.scenes[0].stage.height,900);
});

test('single prompt asks for exact V3 scenes and chooses a validated example for every requested aspect',()=>{
 for(const aspect of ['16:9','9:16','both']){
  const prompt=buildVisualDslV3SinglePrompt({topic:'Máy bơm xe đạp',audience:'Học sinh lớp 6',aspectRatio:aspect,duration:'60',preset:aspect==='9:16'?'educational_cartoon_premium':'scientific_premium',subtitleSize:'large',scientificDetailLevel:'advanced',scientificPlanner:true});
  const example=extractExample(prompt);assert.equal(example.aspect_ratio,aspect);assert.equal(validateVisualDslV3(example),true);
  for(const phrase of ['Visual DSL v3','timeline','draw_progress','duration_seconds','1.200','180 giây','characters chưa','Published Characters','JavaScript','variants.landscape'])assert(prompt.toLowerCase().includes(phrase.toLowerCase()),`${aspect}: missing ${phrase}`);
  assert(prompt.length<27000,'the shared prompt contract remains within a practical copy/paste size');
 }
 assert.throws(()=>buildVisualDslV3SinglePrompt({preset:'custom_runtime_preset'}),/không hỗ trợ/);
});

test('series prompt supports exact and automatic count, independent numbered files, zip limits, BOTH variants, and one consistent preset',()=>{
 for(const count of [3,'auto']){
  const prompt=buildVisualDslV3SeriesPrompt({topic:'Năng lượng và môi trường',audience:'Học sinh lớp 7',episodeCount:count,maxDuration:90,aspectRatio:'both',preset:'educational_cartoon_premium',seriesSlug:'Năng lượng',styleDescription:'Minh họa thân thiện, nhiều lớp'});
  const example=extractExample(prompt);assert.equal(validateVisualDslV3(example),true);assert.equal(example.aspect_ratio,'both');
  for(const phrase of ['visual_dsl_version','variants.landscape.scenes','variants.portrait.scenes','mỗi tập một file độc lập','Tap_01','Tap_02','không lặp','không quá 90 giây','không vượt 180 giây','ZIP','educational_cartoon_premium'])assert(prompt.toLowerCase().includes(phrase.toLowerCase()),`${count}: missing ${phrase}`);
  if(count===3)assert(prompt.includes('chính xác 3 tập'));else assert(prompt.includes('ít nhất hợp lý'));
  assert(prompt.length<28000,'the series contract and validated aspect-specific example remain a practical copy/paste size');
 }
});

test('shared Visual Director guidance plans scientific objects, scene diversity, narration alignment, continuity and supported motion',()=>{
 const guidance=buildVisualDirectorGuidance({scientificDetailLevel:'detailed',audience:'học sinh lớp 6'});
 for(const phrase of ['dáng bao dễ nhận biết','bộ phận thiết yếu','đầu vào/đầu ra','Mỗi cảnh phải giải thích hoặc củng cố lời dẫn','mặt cắt','Giữ thiết bị xuất hiện nhiều lần nhất quán','Chỉ dùng timeline/camera V3 thực sự hỗ trợ','Mâu thuẫn khoa học'])assert(guidance.includes(phrase),`missing ${phrase}`);
 assert(guidance.includes('học sinh lớp 6'));
 assert(buildVisualDirectorGuidance({scientificDetailLevel:'basic'}).includes('KHÁI NIỆM:'));
 assert(buildVisualDirectorGuidance({scientificDetailLevel:'advanced'}).includes('KỸ THUẬT CHI TIẾT:'));
 assert(buildVisualDirectorGuidance({series:true}).includes('mục tiêu tập riêng'));
 assert(!guidance.includes('visual_fidelity')&&!guidance.includes('scientific_object_plan:'));
});

test('single-video V3 integrates detail-aware Visual Director only when planner is enabled and retains capability contract',()=>{
 const enabled=buildVisualDslV3SinglePrompt({topic:'Máy bơm xe đạp',audience:'Học sinh lớp 6',scientificDetailLevel:'advanced',scientificPlanner:true});
 const disabled=buildVisualDslV3SinglePrompt({topic:'Máy bơm xe đạp',audience:'Học sinh lớp 6',scientificDetailLevel:'advanced',scientificPlanner:false});
 assert(enabled.includes('LẬP ĐẶC TẢ VẬT THỂ KHOA HỌC'));
 assert(enabled.includes('KỸ THUẬT CHI TIẾT:'));
 assert(enabled.includes('khớp hình với lời dẫn')||enabled.includes('Mỗi cảnh phải giải thích'));
 assert(disabled.includes('Scientific Visual Planner đang tắt'));
 assert(!disabled.includes('AI VISUAL DIRECTOR — LẬP KẾ HOẠCH NỘI BỘ'));
 for(const phrase of ['visual_dsl_version','geometry_fields','target_id','duration_seconds'])assert(enabled.includes(phrase));
 assert(enabled.length<24000);
});

test('five static domain benchmark prompts remain reproducible, use shared planning, and contain validator-compatible examples',async()=>{
 const fixture=JSON.parse(await readFile(new URL('../examples/visual_dsl_v3/cp53b/benchmark-topics.json',import.meta.url),'utf8'));
 assert.equal(fixture.benchmarks.length,5);assert(fixture.note.includes('not AI-generated'));
 for(const item of fixture.benchmarks){
  const prompt=buildVisualDslV3SinglePrompt({topic:item.topic,audience:item.audience,aspectRatio:item.aspect_ratio,duration:item.duration,preset:item.preset,scientificDetailLevel:item.scientific_detail_level,scientificPlanner:true});
  assert(prompt.includes(item.topic));assert(prompt.includes('LẬP ĐẶC TẢ VẬT THỂ KHOA HỌC'));assert(prompt.includes('không bịa kích thước/thông số chính xác'));assert(prompt.includes('Chỉ dùng timeline/camera V3 thực sự hỗ trợ'));
  assert.equal(validateVisualDslV3(extractExample(prompt)),true,item.id);assert(item.review_targets.length>=3);
  assert(!prompt.includes('scientific_object_plan:'));
 }
});

test('shared Visual Director appears in series prompts with stable equipment guidance and compact runtime contract',()=>{
 const prompt=buildVisualDslV3SeriesPrompt({topic:'Cảm biến và tự động hóa công nghiệp',audience:'Học sinh lớp 8',episodeCount:3,aspectRatio:'both'});
 for(const phrase of ['LẬP ĐẶC TẢ VẬT THỂ KHOA HỌC','mục tiêu tập riêng','thiết kế thiết bị xuất hiện nhiều lần','variants.landscape.scenes','visual_dsl_version'])assert(prompt.includes(phrase),`missing ${phrase}`);
 assert(prompt.length<24000);
});

test('multi-episode builder applies each selected scientific detail level to its shared visual plan',()=>{
 const expected={basic:'KHÁI NIỆM:',detailed:'GIÁO DỤC CHI TIẾT (khuyến nghị):',advanced:'KỸ THUẬT CHI TIẾT:'};
 for(const [scientificDetailLevel,phrase]of Object.entries(expected)){
  const prompt=buildVisualDslV3SeriesPrompt({topic:'Máy bơm xe đạp',audience:'Học sinh lớp 6',episodeCount:3,aspectRatio:'both',scientificDetailLevel});
  assert(prompt.includes(`MỨC CHI TIẾT KHOA HỌC: ${scientificDetailLevel}`));assert(prompt.includes(phrase));assert.equal(validateVisualDslV3(extractExample(prompt)),true);
 }
});

test('both Video Studio prompt entry points select V3 without replacing legacy choices and retain separate style preferences',async()=>{
 const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
 assert.equal((app.match(/Visual DSL v3 — Premium Animated/g)||[]).length,2);
 assert(app.includes("buildVisualDslV3SinglePromptWithAssets({topic,audience,aspectRatio,duration,preset:v3Preset"));
 assert(app.includes('buildVisualDslV3SeriesPromptWithAssets({topic,audience,episodeCount:count,maxDuration:limit,aspectRatio:aspect,preset:v3Preset,seriesSlug:safeTopic,styleDescription:style,scientificDetailLevel:v3Detail'));
 assert(app.includes("value=\"visualdsl\">Visual DSL v2"));assert(app.includes("value=\"scenegraph\">Scene Graph 2D"));
 assert(app.includes('promptV3Style:v3Preset'));assert(app.includes('batchV3Style:v3Preset'));
 assert(app.includes('batch-v3-detail-wrap'));assert(app.includes("$('#batch-v3-detail').addEventListener('change',e=>persistPreferences({batchV3ScientificDetail:e.target.value}))"));
 assert(app.includes('prompt-v3-character-warning'));assert(app.includes('Published Characters chưa được hỗ trợ'));
 const preferences=await readFile(new URL('../src/preferences.js',import.meta.url),'utf8');
 assert(preferences.includes("batchV3ScientificDetail:'detailed'"));assert(preferences.includes("['basic','detailed','advanced'].includes(value.batchV3ScientificDetail)"));
});
