import { VISUAL_DSL_VERSION, visualDslPromptGuide } from './visual-dsl.js';
import { formatVisualQualityReport } from './render/visual-quality-inspector.js';

const VARIANT_BY_RATIO = Object.freeze({ '16:9': 'landscape', '9:16': 'portrait' });

export function buildVisualDslRepairPrompt(report) {
  const issues = Array.isArray(report?.issues) ? report.issues : [];
  const groups = Array.isArray(report?.groups) ? report.groups : [];
  const sharedLayout = issues.some(issue => issue.code === 'shared-ratio-layout');
  const affected = [...new Set([...issues.map(issue => VARIANT_BY_RATIO[issue.aspect_ratio]), ...(sharedLayout ? ['landscape', 'portrait'] : [])].filter(Boolean))];
  const scope = sharedLayout
    ? `- Bố cục dùng chung đang được kiểm tra ở cả hai tỷ lệ. Chuyển nội dung sang variants.landscape.scenes và variants.portrait.scenes; dựng lại từng variant theo tỷ lệ, không chỉ sao chép nguyên tọa độ. Giữ cùng số cảnh/thứ tự, scene ID, narration, estimated_seconds, nội dung bài học và voice settings.\n${affected.map(variant => `- ${variant}: chỉ chỉnh variants.${variant}.scenes theo các issue của tỷ lệ đó.`).join('\n')}`
    : affected.length
    ? affected.map(variant => `- ${variant}: sửa riêng variants.${variant}.scenes của các scene được liệt kê. Không thay đổi variant khác nếu variant đó không có issue tương ứng.`).join('\n')
    : '- Báo cáo hiện không có issue gắn với tỷ lệ hợp lệ; không tự ý thay đổi bố cục.';
  const reportText = formatVisualQualityReport(report || { counts: { error: 0, warning: 0, info: 0 }, issues: [] });
  const mechanismGroups = groups.filter(group => group.mechanism);
  const mechanismContext = mechanismGroups.length
    ? mechanismGroups.map(group => `- Scene ${group.scene} · ${group.aspect_ratio}: mechanism ${group.mechanism.id} (${group.mechanism.type}); binding roles ${JSON.stringify(group.mechanism.bindings)}; affected objects ${group.object_ids.join(', ')}; samples ${group.times.join(', ')}s.`).join('\n')
    : '- Báo cáo không nhóm issue nào vào cơ cấu parametric.';

  return `Bạn là chuyên gia hiệu chỉnh JSON Visual DSL của LAM AI LAB Motion Studio. Hãy sửa bố cục dựa trên JSON gốc và báo cáo Quality Inspector được cung cấp bên dưới.

PHIÊN BẢN VÀ CONTRACT
- Visual DSL hiện hành: v${VISUAL_DSL_VERSION}. Có thể đọc project Visual DSL v1 cũ; không nâng cấp hoặc đổi phiên bản nếu không cần thiết.
- Chỉ dùng schema, primitive, action, mechanism, binding và giới hạn được mô tả trong registry hiện hành bên dưới. Không suy diễn trường mới.
- Registry/import contract đầy đủ của ứng dụng:
${visualDslPromptGuide()}

ISSUE QUALITY INSPECTOR
${reportText}

NHÓM NGUYÊN NHÂN VÀ CƠ CẤU LIÊN QUAN
${mechanismContext}
- Các issue được nhóm là cùng nguyên nhân để rà soát chung; chi tiết từng object và từng sample time vẫn nằm trong báo cáo. Không xóa cảnh báo chỉ để giảm số lượng.
- subtitle-overlap có confidence "rendered-panel-geometry" nghĩa là bounding box hình giao panel phụ đề thật mà renderer vẽ ở sample đó; chưa chứng minh phần nét/hình quan trọng bị che. "fallback-reserved-region" chỉ là nguy cơ theo vùng dự phòng, không phải xác nhận phụ đề đang che hình. Kiểm tra trực quan trước khi thay đổi nội dung.

PHẠM VI SỬA THEO TỶ LỆ
${scope}
- 16:9 tương ứng variants.landscape.scenes; 9:16 tương ứng variants.portrait.scenes.
- Nếu chỉ một tỷ lệ có issue, chỉ chỉnh variant đó. Nếu cả hai có issue, xử lý riêng từng variant với bố cục phù hợp tỷ lệ; không dùng chung một bố cục cho cả hai.
- Liên hệ đúng scene theo tên/index và đúng object theo ID trong từng issue. Dùng thời điểm báo cáo để kiểm tra trạng thái animation; chỉ chỉnh animation khi issue thực sự do chuyển động gây ra.
- Vùng an toàn: giữ nội dung quan trọng cách mép ít nhất 0.08 tọa độ chuẩn hóa; chừa x=0.80–0.98 ở phía trên cho logo và y=0.74–0.94 cho phụ đề. Không đặt nhãn quan trọng trong các vùng đó.

QUY TẮC HIỆU CHỈNH
- Chỉ sửa thuộc tính cần thiết để xử lý issue; ưu tiên vị trí, kích thước, bố cục và vị trí nhãn.
- Giữ nguyên narration, số lượng cảnh, thời lượng từng cảnh và tổng thời lượng.
- Giữ nguyên cấu trúc variants và metadata. Giữ nguyên title, video metadata, voice, subtitle, social_post, youtube cùng các trường khác khi không có lý do trực tiếp từ issue để đổi.
- Giữ nguyên ID object trừ khi bắt buộc phải sửa tham chiếu; không tự ý xóa hoặc bỏ bộ phận khoa học.
- Khi issue liên quan object thuộc slider_crank, giữ nguyên các binding piston, connecting_rod, crank và cấu trúc liên kết đầu khớp. Không dịch riêng một bộ phận đã bind. Nếu cần đổi bố cục, ưu tiên điều chỉnh toàn cơ cấu bằng crank_center hoặc một transform chung hợp lệ, đồng bộ mọi chi tiết/phụ thuộc liên quan.
- Giữ nguyên toàn bộ scene_graph.synchronizations, master_id, dependent_id, ratio, phase_offset, mechanism IDs và mọi bindings; không xóa/sửa liên kết để giảm warning bố cục. Giữ timeline master và local_geometry_space:'isotropic'.
- Không thay công thức cơ khí, crank_radius, connecting_rod_length, cylinder_axis, initial_angle, rotational_speed hay timeline chỉ để loại bỏ cảnh báo. Nếu thu nhỏ cơ cấu thật sự cần thiết, scale đồng bộ tham số hình học, artwork bound, xi-lanh, khớp và đối tượng phụ thuộc; giữ connecting_rod_length > crank_radius và kiểm tra lại các đầu khớp bằng resolver.
- Khi issue liên quan gear_pair, giữ bindings driver/driven, số răng, module hoặc pitch_radius, center_angle, pha quay và timeline; không dịch/scale từng bánh riêng. Nếu cần dàn lại bố cục, cập nhật driver_center và dựng lại artwork local đối xứng quanh hai tâm, bảo toàn khoảng cách vòng chia và tỷ lệ hình pixel.
- Với gear_pair, chỉ coi polygon răng là minh họa giản lược. Không tự thay đổi profile, pha hoặc thông số để tuyên bố có tiếp xúc involute chính xác; giữ chú thích giới hạn mô hình.
- Khi issue liên quan cam_follower, giữ nguyên cam_center, base_radius, max_lift, follower_axis, initial_angle, rotational_speed, profile/phase_offset, local_geometry_space, bindings cam/follower và timeline run/hold; không dịch hoặc animate riêng bộ phận đã bind. Bảo toàn rise/high dwell/return/low dwell liên tục, luật cosine và giới hạn mô hình lý tưởng hóa.
- Nếu issue chỉ là bố cục, giữ nguyên toàn bộ timeline cơ khí và timeline học tập. Chỉ sửa chúng khi báo cáo xác định rõ lỗi liên quan chuyển động.
- Không tạo primitive, action, asset_id, binding, constraint hay trường JSON ngoài registry. Không chèn JavaScript, biểu thức hoặc mã thực thi.
- Không thay nội dung khoa học/narration để né cảnh báo. Nếu cảnh báo là false positive do chồng lấn có chủ ý, giữ hình học đó và không tạo thay đổi không cần thiết.

ĐẦU VÀO CẦN CUNG CẤP
Quality report đã được nhúng trong prompt này. Nếu JSON gốc chưa có trong cuộc trò chuyện, hãy yêu cầu người dùng dán toàn bộ JSON project gốc trước khi sửa. Không đoán phần JSON bị thiếu.

ĐỊNH DẠNG ĐẦU RA
- Trả về duy nhất một JSON hoàn chỉnh, hợp lệ và import trực tiếp được vào ứng dụng; không trả JSON Patch, diff hoặc bản vá rời rạc.
- Bảo toàn mọi trường và variant không liên quan. Không bọc JSON trong JavaScript hay thêm code fence.
- Không tuyên bố lỗi đã được xác nhận là sửa xong: người dùng sẽ import JSON mới và chạy lại Quality Inspector để xác minh.`;
}
