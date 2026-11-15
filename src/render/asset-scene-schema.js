const ASSETS = new Set(['classroom_lab_01', 'student_child_01', 'ruler_30cm', 'wood_block']);
const METHODS = new Set(['walk_to', 'reach', 'pick_up', 'place', 'step_back', 'point_to']);
const finite = (value, label, sceneNumber, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} ở scene ${sceneNumber} không hợp lệ.`);
  return number;
};
const idPattern = /^[a-z][a-z0-9_-]{0,39}$/;

/** Validate the current hand-authored Asset Animation pack and its timeline. */
export function normalizeAssetSceneGraph(value, duration, sceneIndex = 0) {
  const sceneNumber = sceneIndex + 1;
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`scene_graph ở scene ${sceneNumber} phải là object.`);
  if (Number(value.version) !== 1) throw new Error(`scene_graph ở scene ${sceneNumber} cần version 1.`);
  if (value.background_asset !== 'classroom_lab_01') throw new Error(`scene_graph ở scene ${sceneNumber} cần background_asset classroom_lab_01.`);
  if (!Array.isArray(value.entities) || value.entities.length < 3 || value.entities.length > 8) throw new Error(`scene_graph ở scene ${sceneNumber} cần từ 3 đến 8 entities.`);
  const measurementValue = finite(value.measurement?.value_cm ?? 5, 'measurement.value_cm', sceneNumber, 1, 20);
  if (Math.round(measurementValue * 10) !== measurementValue * 10) throw new Error(`measurement.value_cm ở scene ${sceneNumber} chỉ nhận tối đa một chữ số thập phân.`);
  const ids = new Set(), assets = new Set();
  const entities = value.entities.map((entity, index) => {
    if (!entity || typeof entity !== 'object' || Array.isArray(entity) || !idPattern.test(String(entity.id || ''))) throw new Error(`Entity ${index + 1} ở scene ${sceneNumber} không hợp lệ.`);
    if (ids.has(entity.id)) throw new Error(`Entity id ${entity.id} bị trùng ở scene ${sceneNumber}.`);
    if (!ASSETS.has(entity.asset_id)) throw new Error(`Asset ${entity.asset_id || '(trống)'} chưa có trong catalog Asset Animation.`);
    if (assets.has(entity.asset_id)) throw new Error(`Asset ${entity.asset_id} chỉ được dùng một lần trong scene ${sceneNumber}.`);
    ids.add(entity.id); assets.add(entity.asset_id);
    const transform = entity.transform && typeof entity.transform === 'object' ? entity.transform : {};
    const kind = entity.asset_id === 'student_child_01' ? 'rigged_character' : entity.asset_id === 'ruler_30cm' ? 'articulated_prop' : entity.asset_id === 'classroom_lab_01' ? 'background' : 'prop';
    return { id: entity.id, asset_id: entity.asset_id, kind, transform: { x: finite(transform.x, `${entity.id}.transform.x`, sceneNumber, 0, 1280), y: finite(transform.y, `${entity.id}.transform.y`, sceneNumber, 0, 720), scale: finite(transform.scale ?? 1, `${entity.id}.transform.scale`, sceneNumber, .4, 1.6) }, properties: { facing: entity.properties?.facing === 'left' ? 'left' : 'right' } };
  });
  for (const [assetId, entityId] of [['classroom_lab_01','lab'],['student_child_01','student'],['ruler_30cm','ruler'],['wood_block','block']]) {
    const entity = entities.find(item => item.asset_id === assetId);
    if (!entity) throw new Error(`scene_graph ở scene ${sceneNumber} thiếu asset ${assetId}.`);
    if (entity.id !== entityId) throw new Error(`Asset ${assetId} ở scene ${sceneNumber} phải có entity id ${entityId}.`);
  }
  const entityIds = new Set(entities.map(entity => entity.id));
  if (!Array.isArray(value.timeline) || value.timeline.length !== 6) throw new Error(`timeline ở scene ${sceneNumber} cần đúng 6 action được hỗ trợ.`);
  const timeline = value.timeline.map((item, index) => {
    if (!item || typeof item !== 'object' || item.entity !== 'student' || !entityIds.has(item.entity) || !METHODS.has(item.method)) throw new Error(`Action ${index + 1} ở scene ${sceneNumber} phải gọi student bằng method được hỗ trợ.`);
    const at = finite(item.at, `timeline[${index}].at`, sceneNumber, 0, duration);
    const params = item.params && typeof item.params === 'object' && !Array.isArray(item.params) ? item.params : {};
    const result = { at, entity: item.entity, method: item.method, params: { ...params } };
    if (['walk_to', 'step_back', 'reach'].includes(item.method)) result.params.x = finite(params.x, `timeline[${index}].params.x`, sceneNumber, 0, 1280);
    if (['reach'].includes(item.method)) result.params.y = finite(params.y, `timeline[${index}].params.y`, sceneNumber, 0, 720);
    if (item.method === 'point_to' && params.x != null) result.params.x = finite(params.x, `timeline[${index}].params.x`, sceneNumber, 0, 1280);
    if (item.method === 'point_to' && params.y != null) result.params.y = finite(params.y, `timeline[${index}].params.y`, sceneNumber, 0, 720);
    if (['reach', 'pick_up', 'place', 'walk_to', 'step_back', 'point_to'].includes(item.method)) result.params.duration = finite(params.duration, `timeline[${index}].params.duration`, sceneNumber, .1, 30);
    if (item.method === 'pick_up' && params.target !== 'block') throw new Error(`pick_up ở scene ${sceneNumber} chỉ nhận target block.`);
    if (item.method === 'place' && params.target !== 'block') throw new Error(`place ở scene ${sceneNumber} chỉ nhận target block.`);
    if (item.method === 'point_to' && !['ruler.measurement_mark','ruler.five_cm_mark'].includes(params.target)) throw new Error(`point_to ở scene ${sceneNumber} cần chỉ ruler.measurement_mark.`);
    if (item.method === 'point_to') result.params.target = 'ruler.measurement_mark';
    if (item.method === 'place' && params.anchor !== 'ruler.zero_mark') throw new Error(`place ở scene ${sceneNumber} cần anchor ruler.zero_mark.`);
    return result;
  }).sort((a, b) => a.at - b.at);
  for (const item of timeline) if (item.params.duration && item.at + item.params.duration > duration + .05) throw new Error(`Action ${item.method} vượt thời lượng scene ${sceneNumber}.`);
  for (const method of METHODS) if (timeline.filter(item => item.method === method).length !== 1) throw new Error(`timeline ở scene ${sceneNumber} cần đúng một action ${method}.`);
  const actionOrder = ['walk_to','reach','pick_up','place','step_back','point_to'].map(method => timeline.findIndex(item => item.method === method));
  if (actionOrder.some((position, index) => index > 0 && position <= actionOrder[index - 1])) throw new Error(`timeline ở scene ${sceneNumber} sai thứ tự action.`);
  for (let index = 0; index < timeline.length - 1; index++) {
    const current = timeline[index], next = timeline[index + 1];
    if (current.at + current.params.duration > next.at + .05) throw new Error(`Action ${current.method} ở scene ${sceneNumber} chồng lên action kế tiếp.`);
  }
  const events = Array.isArray(value.events) && value.events.length === 2 ? value.events.map((event,index) => {
    if (!event || typeof event !== 'object' || !entityIds.has(event.entity) || !Number.isFinite(Number(event.at)) || Number(event.at) < 0 || Number(event.at) > duration) throw new Error(`Event ${index + 1} ở scene ${sceneNumber} không hợp lệ.`);
    if (event.method === 'attach' && event.entity === 'block' && event.to === 'student.hand.right') return { at: Number(event.at), method: 'attach', entity: event.entity, to: event.to };
    if (event.method === 'detach' && event.entity === 'block' && event.anchor === 'ruler.zero_mark') return { at: Number(event.at), method: 'detach', entity: event.entity, anchor: event.anchor };
    throw new Error(`Event ${event.method || '(trống)'} chưa được hỗ trợ ở scene ${sceneNumber}.`);
  }) : [];
  if (!events || !events.some(e => e.method === 'attach') || !events.some(e => e.method === 'detach')) throw new Error(`scene_graph ở scene ${sceneNumber} cần đúng event attach và detach.`);
  const pickup = timeline.find(item => item.method === 'pick_up'), placement = timeline.find(item => item.method === 'place'), attach = events.find(event => event.method === 'attach'), detach = events.find(event => event.method === 'detach');
  if (Math.abs(attach.at - pickup.at) > .05 || Math.abs(detach.at - (placement.at + placement.params.duration)) > .05) throw new Error(`Event attach/detach ở scene ${sceneNumber} không khớp với hành động nhặt/đặt.`);
  return { version: 1, background_asset: 'classroom_lab_01', measurement: { value_cm: measurementValue }, entities, timeline, events };
}
