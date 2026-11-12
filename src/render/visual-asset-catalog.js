import {getCategory,resolveLegacyCategory,normalizeTaxonomyText} from './visual-asset-taxonomy.js';
export const VISUAL_ASSET_SEMANTIC_SCHEMA_VERSION=1;
export const VISUAL_ASSET_SEMANTIC_LIMITS=Object.freeze({title:160,subject:240,category:100,description:800,keywords:24,keyword:80,viewpoint:100,usage:400,domain:160,components:24,component:100,source:300,license:300,search_results:8,catalog_chars:9000,description_chars:240,keywords_per_item:8});
export const VISUAL_ASSET_REVIEW_STATES=Object.freeze(['needs_review','reviewed','verified']);
export const VISUAL_ASSET_VISUAL_TYPES=Object.freeze(['','photo','illustration','technical_diagram','cutaway','icon','chart','other']);
export const VISUAL_ASSET_METADATA_ORIGINS=Object.freeze(['filename_suggestion','ai_generated','user_edited','package_import']);
export const VISUAL_ASSET_SIDECAR_SCHEMA='lam-visual-asset-semantic-sidecar/v1';

const text=(value,max)=>String(value??'').trim().slice(0,max);
const list=(value,maxCount,maxLength)=>[...new Set((Array.isArray(value)?value:String(value??'').split(/[,;\n]/)).map(item=>text(item,maxLength)).filter(Boolean))].slice(0,maxCount);

export function suggestVisualAssetTitle(filename=''){
  return text(String(filename).replace(/\.[^.]+$/,'').replace(/[_.-]+/g,' ').replace(/\s+/g,' '),VISUAL_ASSET_SEMANTIC_LIMITS.title);
}

export function createVisualAssetSemanticMetadata(input={}, {fallbackTitle=''}={}){
  const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  const state=VISUAL_ASSET_REVIEW_STATES.includes(value.review_status)?value.review_status:'needs_review';
  const visualType=VISUAL_ASSET_VISUAL_TYPES.includes(value.visual_type)?value.visual_type:'';
  const legacy=resolveLegacyCategory(value.category),categoryId=text(value.category_id||legacy.category_id,80),metadata={schema_version:VISUAL_ASSET_SEMANTIC_SCHEMA_VERSION,title:text(value.title||fallbackTitle,VISUAL_ASSET_SEMANTIC_LIMITS.title),primary_subject:text(value.primary_subject,VISUAL_ASSET_SEMANTIC_LIMITS.subject),category:text(value.category,VISUAL_ASSET_SEMANTIC_LIMITS.category),category_id:categoryId,subcategory_id:text(value.subcategory_id,120),subcategory_label:text(value.subcategory_label,80),taxonomy_version:Number.isInteger(value.taxonomy_version)?value.taxonomy_version:0,related_domains:list(value.related_domains,8,80),classification_status:['classified','needs_review','unclassified','unresolved'].includes(value.classification_status)?value.classification_status:(categoryId?'classified':legacy.classification_status),description:text(value.description,VISUAL_ASSET_SEMANTIC_LIMITS.description),keywords_vi:list(value.keywords_vi,VISUAL_ASSET_SEMANTIC_LIMITS.keywords,VISUAL_ASSET_SEMANTIC_LIMITS.keyword),aliases_en:list(value.aliases_en,VISUAL_ASSET_SEMANTIC_LIMITS.keywords,VISUAL_ASSET_SEMANTIC_LIMITS.keyword),visual_type:visualType,viewpoint:text(value.viewpoint,VISUAL_ASSET_SEMANTIC_LIMITS.viewpoint),educational_usage:text(value.educational_usage,VISUAL_ASSET_SEMANTIC_LIMITS.usage),scientific_domain:text(value.scientific_domain,VISUAL_ASSET_SEMANTIC_LIMITS.domain),visible_components:list(value.visible_components,VISUAL_ASSET_SEMANTIC_LIMITS.components,VISUAL_ASSET_SEMANTIC_LIMITS.component),source:text(value.source,VISUAL_ASSET_SEMANTIC_LIMITS.source),license:text(value.license,VISUAL_ASSET_SEMANTIC_LIMITS.license),review_status:state,updated_at:text(value.updated_at,40),user_edited:value.user_edited===true,metadata_origin:VISUAL_ASSET_METADATA_ORIGINS.includes(value.metadata_origin)?value.metadata_origin:(value.user_edited===true?'user_edited':'filename_suggestion'),anchors:value.anchors&&typeof value.anchors==='object'&&!Array.isArray(value.anchors)?structuredClone(value.anchors):{}};
  return metadata;
}

export function validateVisualAssetSemanticMetadata(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Semantic metadata phải là object.');
  if(Object.keys(input).some(key=>['__proto__','prototype','constructor'].includes(key)))throw new TypeError('Semantic metadata chứa khóa không an toàn.');
  for(const key of ['title','primary_subject','category','category_id','subcategory_id','subcategory_label','description','viewpoint','educational_usage','scientific_domain','source','license'])if(typeof input[key]==='string'&&(/<\s*\/?\s*[a-z!][^>]*>/i.test(input[key])||/javascript\s*:/i.test(input[key])))throw new TypeError(`Trường ${key} không nhận markup hoặc mã thực thi.`);
  if(input.schema_version!=null&&input.schema_version!==VISUAL_ASSET_SEMANTIC_SCHEMA_VERSION)throw new TypeError('schema_version semantic metadata không được hỗ trợ.');
  const normalized=createVisualAssetSemanticMetadata(input);
  for(const key of ['title','primary_subject','category','description','viewpoint','educational_usage','scientific_domain','source','license'])if(String(input[key]??'').length>VISUAL_ASSET_SEMANTIC_LIMITS[key==='primary_subject'?'subject':key==='educational_usage'?'usage':key])throw new RangeError(`Trường ${key} vượt giới hạn.`);
  for(const key of ['keywords_vi','aliases_en','visible_components'])if(input[key]!=null&&(!Array.isArray(input[key])||input[key].length>({keywords_vi:VISUAL_ASSET_SEMANTIC_LIMITS.keywords,aliases_en:VISUAL_ASSET_SEMANTIC_LIMITS.keywords,visible_components:VISUAL_ASSET_SEMANTIC_LIMITS.components}[key])||input[key].some(item=>typeof item!=='string'||item.length>({keywords_vi:VISUAL_ASSET_SEMANTIC_LIMITS.keyword,aliases_en:VISUAL_ASSET_SEMANTIC_LIMITS.keyword,visible_components:VISUAL_ASSET_SEMANTIC_LIMITS.component}[key]))))throw new TypeError(`Danh sách ${key} không hợp lệ.`);
  if(input.review_status!=null&&!VISUAL_ASSET_REVIEW_STATES.includes(input.review_status))throw new TypeError('review_status không hợp lệ.');
  if(input.visual_type!=null&&!VISUAL_ASSET_VISUAL_TYPES.includes(input.visual_type))throw new TypeError('visual_type không hợp lệ.');
  if(input.metadata_origin!=null&&!VISUAL_ASSET_METADATA_ORIGINS.includes(input.metadata_origin))throw new TypeError('metadata_origin không hợp lệ.');
  if(input.anchors!=null&&(!input.anchors||typeof input.anchors!=='object'||Array.isArray(input.anchors)))throw new TypeError('anchors phải là object.');
  for(const key of ['category_id','subcategory_id','subcategory_label'])if(input[key]!=null&&(typeof input[key]!=='string'||input[key].length>(key==='subcategory_label'?80:120)||/[<>\u0000-\u001f]/.test(input[key])))throw new TypeError(`Taxonomy field ${key} không hợp lệ.`);
  if(input.related_domains!=null&&(!Array.isArray(input.related_domains)||input.related_domains.length>8||input.related_domains.some(value=>typeof value!=='string'||value.length>80)))throw new TypeError('related_domains không hợp lệ.');
  if(input.classification_status!=null&&!['classified','needs_review','unclassified','unresolved'].includes(input.classification_status))throw new TypeError('classification_status không hợp lệ.');
  if(input.taxonomy_version!=null&&(!Number.isInteger(input.taxonomy_version)||input.taxonomy_version<0||input.taxonomy_version>1))throw new TypeError('taxonomy_version không hợp lệ.');
  if(normalized.category_id){const category=getCategory(normalized.category_id);if(!category)throw new TypeError('category_id không thuộc taxonomy hiện hành.');if(normalized.subcategory_id){const valid=category.subcategories.some(item=>item.id===normalized.subcategory_id);const custom=normalized.subcategory_id.startsWith(`custom_${category.id}_`)&&Boolean(normalized.subcategory_label);if(!valid&&!custom)throw new TypeError('subcategory_id không thuộc primary category.');}}else if(normalized.subcategory_id)throw new TypeError('subcategory_id yêu cầu category_id.');
  if(normalized.related_domains.some(id=>!getCategory(id)))throw new TypeError('related_domains chứa category ID không hợp lệ.');if(normalized.taxonomy_version>1)throw new TypeError('taxonomy_version không được hỗ trợ.');
  return normalized;
}

export function parseVisualAssetSemanticSidecar(value){
  let sidecar=value;if(typeof value==='string'){try{sidecar=JSON.parse(value);}catch(error){throw new TypeError(`JSON metadata không hợp lệ: ${error.message}`);}}
  const allowedRoot=new Set(['schema','image_file','image_requirements','semantic_metadata']);
  if(!sidecar||typeof sidecar!=='object'||Array.isArray(sidecar)||sidecar.schema!==VISUAL_ASSET_SIDECAR_SCHEMA||Object.keys(sidecar).some(key=>!allowedRoot.has(key)))throw new TypeError(`Metadata sidecar phải đúng schema ${VISUAL_ASSET_SIDECAR_SCHEMA}.`);
  const imageFile=String(sidecar.image_file||'');if(imageFile.length>180||imageFile!==imageFile.split(/[\\/]/).at(-1)||imageFile.includes('..')||!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|webp)$/i.test(imageFile))throw new TypeError('image_file phải là tên PNG/WebP đơn giản, không có đường dẫn.');
  const requirements=sidecar.image_requirements;if(!requirements||typeof requirements!=='object'||Array.isArray(requirements)||Object.keys(requirements).some(key=>key!=='transparent_background')||typeof requirements.transparent_background!=='boolean')throw new TypeError('image_requirements.transparent_background phải là boolean.');
  const metadataInput=sidecar.semantic_metadata,allowedMetadata=new Set(['schema_version','title','primary_subject','category','category_id','subcategory_id','subcategory_label','taxonomy_version','related_domains','classification_status','description','keywords_vi','aliases_en','visual_type','viewpoint','educational_usage','scientific_domain','visible_components','review_status']);
  if(!metadataInput||typeof metadataInput!=='object'||Array.isArray(metadataInput)||Object.keys(metadataInput).some(key=>!allowedMetadata.has(key)))throw new TypeError('semantic_metadata có field lạ hoặc sai kiểu.');
  const metadata=validateVisualAssetSemanticMetadata(metadataInput);if(!metadata.title||!metadata.primary_subject)throw new TypeError('Sidecar cần title và primary_subject.');if(metadata.review_status!=='needs_review')throw new TypeError('AI metadata phải ở trạng thái needs_review.');
  return{schema:VISUAL_ASSET_SIDECAR_SCHEMA,image_file:imageFile,image_requirements:{transparent_background:requirements.transparent_background},semantic_metadata:metadata};
}

export function visualAssetSidecarBasename(filename=''){
  const name=String(filename).split(/[\\/]/).at(-1)||'';return name.replace(/\.asset\.json$/i,'');
}

export function normalizeVisualAssetSearchText(value=''){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}

const SEARCH_STOPWORDS=new Set(['co','khong','la','va','con','cua','the','mot','nhung','trong','duoc','ve','cho','den','tu','o','voi','and','the','of','a','an','is','for','with','from','to','in','on']);
const words=value=>new Set(normalizeVisualAssetSearchText(value).split(' ').filter(token=>token.length>1&&!SEARCH_STOPWORDS.has(token)));
function metadataOf(asset){return createVisualAssetSemanticMetadata(asset.semantic_metadata||{}, {fallbackTitle:asset.display_name});}
function fieldMatches(query,field){const normalized=normalizeVisualAssetSearchText(field);return normalized&&query.includes(normalized);}

export function scoreVisualAsset(asset,queryInput=''){
  const query=typeof queryInput==='string'?queryInput:[queryInput.topic,queryInput.subject,queryInput.keywords,queryInput.category,queryInput.category_id,queryInput.subcategory_id,queryInput.educational_usage,queryInput.scientific_domain,queryInput.related_domains,queryInput.audience,queryInput.series_theme].filter(Boolean).join(' ');
  const q=normalizeVisualAssetSearchText(query);if(!q)return{score:0,reasons:[],matched_terms:[]};
  const m=metadataOf(asset),verified=m.review_status==='verified',tokens=words(q),reasons=[],matched=new Set();let score=0;
  const primary=[m.primary_subject,m.title,...m.aliases_en];
  for(const value of primary.filter(Boolean))if(fieldMatches(q,value)){const s=verified?140:90;score=Math.max(score,s);reasons.push(verified?'verified_subject_or_alias':'subject_or_alias');}
  const normalizedPrimary=normalizeVisualAssetSearchText(m.primary_subject),normalizedTitle=normalizeVisualAssetSearchText(m.title);
  if(normalizedPrimary&&normalizedPrimary===q||normalizedTitle&&normalizedTitle===q){score=Math.max(score,verified?220:145);reasons.push('exact_subject');}
  for(const alias of m.aliases_en)if(normalizeVisualAssetSearchText(alias)===q){score=Math.max(score,verified?210:100);reasons.push(verified?'verified_alias':'alias');}
  const keywordFields=[...m.keywords_vi,...m.aliases_en],category=getCategory(m.category_id),relatedNames=(m.related_domains||[]).map(id=>getCategory(id)).filter(Boolean).flatMap(item=>[item.label_vi,item.label_en,item.aliases]),identityTokens=new Set(words([...primary,...keywordFields].join(' '))),contextTokens=new Set(words([m.category,category?.label_vi,category?.label_en,category?.aliases,m.subcategory_id,m.subcategory_label,relatedNames,m.description,m.educational_usage,m.scientific_domain,m.viewpoint,m.visual_type].join(' ')));
  let identityMatches=0,contextMatches=0;for(const token of tokens){if(identityTokens.has(token)){identityMatches++;matched.add(token);}else if(contextTokens.has(token)){contextMatches++;matched.add(token);}}
  if(tokens.size){const identityOverlap=identityMatches/tokens.size,contextOverlap=contextMatches/tokens.size;score+=Math.round(identityOverlap*(identityOverlap>=.65?(verified?72:58):12)+contextOverlap*(verified?16:12));if(matched.size)reasons.push('token_overlap');}
  if(fieldMatches(q,m.category)||fieldMatches(q,`${category?.label_vi||''} ${category?.label_en||''} ${category?.aliases||''}`)){score+=15;reasons.push('category_match');}
  if(m.subcategory_id&&fieldMatches(q,`${m.subcategory_id} ${m.subcategory_label}`)){score+=24;reasons.push('subcategory_match');}
  if(m.related_domains?.some(id=>{const item=getCategory(id);return item&&fieldMatches(q,`${item.label_vi} ${item.label_en} ${item.aliases}`);})){score+=8;reasons.push('related_domain_match');}
  if(fieldMatches(q,m.educational_usage)){score+=24;reasons.push('usage_match');}
  if(fieldMatches(q,m.scientific_domain)){score+=20;reasons.push('domain_match');}
  if(fieldMatches(q,m.description)){score+=Math.min(18,4+Math.round(m.description.length/90));reasons.push('description_match');}
  return{score,reasons:[...new Set(reasons)],matched_terms:[...matched].sort()};
}

export function searchVisualAssets(assets,queryInput,{limit=VISUAL_ASSET_SEMANTIC_LIMITS.search_results,minScore=8,categoryId='',subcategoryId='',visualType=''}={}){
  const boundedLimit=Math.max(1,Math.min(5000,Math.floor(Number(limit)||VISUAL_ASSET_SEMANTIC_LIMITS.search_results)));
  const ranked=(assets||[]).map(asset=>({asset,...scoreVisualAsset(asset,queryInput)})).filter(item=>{const m=metadataOf(item.asset);return(!categoryId||m.category_id===categoryId)&&(!subcategoryId||m.subcategory_id===subcategoryId)&&(!visualType||m.visual_type===visualType)&&item.score>=minScore;}).sort((a,b)=>b.score-a.score||Number(b.asset.semantic_metadata?.review_status==='verified')-Number(a.asset.semantic_metadata?.review_status==='verified')||a.asset.asset_id.localeCompare(b.asset.asset_id));
  const ambiguous=ranked.length>1&&ranked[0].score-ranked[1].score<18;
  return{query:typeof queryInput==='string'?queryInput:[queryInput.topic,queryInput.subject,queryInput.keywords].filter(Boolean).join(' '),results:ranked.slice(0,boundedLimit),ambiguous,top_score:ranked[0]?.score||0};
}

export function selectVisualAssetPromptCandidates(searchResult,{limit=4,minScore=42,ambiguityMargin=18}={}){
  const ranked=searchResult?.results||[];if(!ranked.length)return[];
  if(searchResult.ambiguous&&ranked[0].score-ranked[1].score<ambiguityMargin)return[];
  return ranked.filter(item=>item.score>=minScore).slice(0,Math.min(4,Math.max(1,limit))).map(({asset,score,reasons})=>{const m=metadataOf(asset);return{asset_id:asset.asset_id,title:m.title,primary_subject:m.primary_subject,category:m.category,category_id:m.category_id,subcategory_id:m.subcategory_id,subcategory_label:m.subcategory_label,related_domains:m.related_domains,description:m.description,keywords_vi:m.keywords_vi,aliases_en:m.aliases_en,visual_type:m.visual_type,viewpoint:m.viewpoint,educational_usage:m.educational_usage,scientific_domain:m.scientific_domain,review_status:m.review_status,score,reasons};});
}

export function buildVisualAssetPromptCatalog(candidates,{maxChars=VISUAL_ASSET_SEMANTIC_LIMITS.catalog_chars,maxItems=4}={}){
  const maximum=Math.max(256,Math.min(VISUAL_ASSET_SEMANTIC_LIMITS.catalog_chars,Number(maxChars)||VISUAL_ASSET_SEMANTIC_LIMITS.catalog_chars));
  const records=[];for(const candidate of (candidates||[]).slice(0,Math.min(4,maxItems))){if(!/^visual_[a-f0-9]{64}$/.test(candidate.asset_id||''))continue;const row={asset_id:candidate.asset_id,title:text(candidate.title,VISUAL_ASSET_SEMANTIC_LIMITS.title),primary_subject:text(candidate.primary_subject,VISUAL_ASSET_SEMANTIC_LIMITS.subject),description:text(candidate.description,VISUAL_ASSET_SEMANTIC_LIMITS.description_chars),aliases:[...list(candidate.keywords_vi,4,60),...list(candidate.aliases_en,4,60)],visual_type:text(candidate.visual_type,40),viewpoint:text(candidate.viewpoint,80),suggested_usage:text(candidate.educational_usage,180),review_status:VISUAL_ASSET_REVIEW_STATES.includes(candidate.review_status)?candidate.review_status:'needs_review'};if(candidate.category_id)row.category_id=text(candidate.category_id,80);if(candidate.subcategory_id)row.subcategory_id=text(candidate.subcategory_id,120);if(candidate.subcategory_label)row.subcategory_label=text(candidate.subcategory_label,80);if(candidate.related_domains)row.related_domains=list(candidate.related_domains,4,80);records.push(row);}
  let catalog=JSON.stringify({schema:'lam-visual-asset-prompt-catalog/v1',assets:records});while(catalog.length>maximum&&records.length){records.pop();catalog=JSON.stringify({schema:'lam-visual-asset-prompt-catalog/v1',assets:records});}
  const result=catalog.length<=maximum?catalog:JSON.stringify({schema:'lam-visual-asset-prompt-catalog/v1',assets:[]});validateVisualAssetPromptCatalog(result);return result;
}

export function validateVisualAssetPromptCatalog(value){
  let catalog=value;if(typeof value==='string'){try{catalog=JSON.parse(value);}catch{throw new TypeError('Prompt catalog phải là JSON hợp lệ.');}}
  if(!catalog||catalog.schema!=='lam-visual-asset-prompt-catalog/v1'||!Array.isArray(catalog.assets)||catalog.assets.length>4)throw new TypeError('Prompt catalog không đúng schema v1.');
  const allowed=new Set(['asset_id','title','primary_subject','description','aliases','visual_type','viewpoint','suggested_usage','review_status','category_id','subcategory_id','subcategory_label','related_domains']);
  for(const item of catalog.assets){if(!item||typeof item!=='object'||Object.keys(item).some(key=>['__proto__','constructor','prototype'].includes(key)||!allowed.has(key))||!/^visual_[a-f0-9]{64}$/.test(item.asset_id)||typeof item.title!=='string'||!item.title.trim()||typeof item.primary_subject!=='string'||typeof item.description!=='string'||!Array.isArray(item.aliases)||item.aliases.length>8||item.aliases.some(value=>typeof value!=='string')||!VISUAL_ASSET_REVIEW_STATES.includes(item.review_status))throw new TypeError('Prompt catalog chứa asset entry sai schema.');if(item.category_id&&!getCategory(item.category_id))throw new TypeError('Prompt catalog chứa category_id không hợp lệ.');if(item.subcategory_id&&(!item.category_id||!getCategory(item.category_id)||!getCategory(item.category_id).subcategories.some(sub=>sub.id===item.subcategory_id)&&!item.subcategory_id.startsWith(`custom_${item.category_id}_`)))throw new TypeError('Prompt catalog chứa subcategory_id không hợp lệ.');if(item.related_domains!=null&&(!Array.isArray(item.related_domains)||item.related_domains.length>4||item.related_domains.some(id=>!getCategory(id))))throw new TypeError('Prompt catalog chứa related_domains không hợp lệ.');}
  return true;
}
