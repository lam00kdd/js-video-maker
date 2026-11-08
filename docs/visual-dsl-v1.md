# LAM AI LAB Motion Studio — Visual DSL v1

## Trạng thái và tương thích

Visual DSL v1 là lớp tương thích trên project `version: 2` và renderer Scene Graph hiện có (`scene_graph.version: 2`, `coordinate_space: "normalized"`). Root document có `visual_dsl_version: 1`, `motion_mode: "scenegraph"`, `title` và `scenes`. Các file cũ không có trường DSL vẫn đi qua importer cũ; các chế độ `classic`, `canvas2d`, Scene Graph v2 và Asset2D không bị đổi cấu trúc lưu trữ.

Mỗi scene có `scene_number`, `title`, `narration` (tối đa 1.200 ký tự), `estimated_seconds` (1–300), `visual_description`, `scene_graph` và có thể có `animations`. Tổng số scene là 1–100. Import Visual DSL v1 kiểm tra tổng `estimated_seconds` không vượt 180 giây; importer script và batch cũng áp dụng giới hạn này. Export kiểm tra thời lượng hiệu lực sau khi đồng bộ audio và cộng outro, nên vẫn có thể từ chối nếu voice/outro làm tổng vượt 180 giây. Project cũ không có `visual_dsl_version` tiếp tục qua importer tương thích.

## Object model

Mọi object dùng ID duy nhất trong scene, `transform: {x,y,scale,rotation,opacity}`, `style` (`fill`, `stroke`, `stroke_width`, line/font options), `geometry`, `properties` và `actions`. Tọa độ transform chuẩn hóa: (0,0) là trái/trên, (1,1) là phải/dưới; vùng -2..2 được chấp nhận cho chuyển động ngoài khung. Kích thước/stroke là tỉ lệ theo kích thước canvas nhỏ hơn, trừ font size (theo chiều cao). Thiết kế 16:9 và 9:16 cần bố cục riêng.

Renderer nhận các primitive registry sau: `line`, `polyline`, `circle`, `ellipse`, `arc`, `spline`, `polygon`, `triangle`, `rectangle`, `rounded_rectangle`, `arrow`, `path`, `connector`, `axis`, `dimension`, `label`, `text`, `asset`, `group`. Asset phải có `properties.asset_id` trong catalog. Path dùng `geometry.commands` với M/L có một point, Q hai point, C ba point, Z không point; tổng tối đa 100 command. Mọi tọa độ được kiểm tra hữu hạn trong -2..2. Label và text đều được vẽ với màu chữ và nền tùy chọn. Connector/dimension vẽ đầu mũi tên ở renderer hiện tại.

Visual DSL v1 bỏ qua các tính năng mới. Visual DSL v2 bổ sung `z_index`, transform group local-to-parent và action `follow_path`/`draw_path`; xem [giai đoạn 1](visual-dsl-v2-stage1.md). Group lồng nhau được kiểm tra theo cây JSON, ID phải duy nhất toàn scene. Hạn mức schema là 200 object cấp gốc, 500 node tổng, depth 8 và 100 action/object.

## Animation

Action per-object đã chạy qua resolver: `move`, `rotate`, `scale`, `fade`, `draw_on`, `pulse`, `show`, `hide`, `set_text`, `highlight`, `set_energized`. Action cùng thuộc tính render không được chồng lấn (show/hide/fade cùng chiếm opacity); thời lượng phải nằm trong cảnh. Trước thời điểm bắt đầu, move/rotate/scale/fade dùng giá trị `from` đầu tiên nếu có. `draw_on` đang reveal bằng opacity toàn object, không theo chiều dài stroke.

Prompt v1 có animation cấp scene cho `move`, `rotate`, `scale`, `fade`, `draw`, `change_text`; `draw` dùng `draw_on` và giữ hành vi reveal opacity cũ. `follow_path`, `draw_path`, loop và z-order có trong v2.

## Validation và bảo mật

Validator kiểm tra phiên bản DSL, mảng scenes, thời lượng, narration, scene graph v2, khóa object đã đăng ký, ID, shape/path geometry, finite coordinates, color, asset registry, action/channel overlap và trường target animation. Chỉ dữ liệu JSON declarative; không dùng eval/Function hay diễn giải HTML/JS. Lỗi có scene/object/field trong phần lớn validation geometry/action. Parser JSON vẫn là JSON.parse.

Giới hạn tương thích hiện có: 100 scene, 1–300 giây/scene. Visual DSL v1 giới hạn 80 animation/scene và 100 command/path. Schema renderer cho tối đa 200 object cấp gốc/500 node gồm group. Narration tối đa 1.200 ký tự cho document DSL.

## Fixture

- `examples/Visual_DSL_v1_Cell.json`: màng, tế bào chất, nhân, ty thể vẽ bằng primitive/path, chú thích, arrow và hoạt cảnh xuất hiện/highlight. Đây là sơ đồ đơn giản hóa; không theo tỉ lệ.
- `examples/Visual_DSL_v1_Curved_Motion.json`: path cubic, vật hình tròn di chuyển theo timeline và vector hướng.

## Phân loại codebase sau kiểm tra

| Hạng mục | Kết quả |
|---|---|
| Đã hỗ trợ đầy đủ | JSON cũ import/export; classic/canvas2d/Scene Graph/asset2d; preview/export video, voice/subtitles; primitives cơ bản và object actions cũ |
| Đã có và kiểm tra bằng fixture | Visual DSL v1 validator/import adapter; primitive/path/label Canvas2D dispatch; animation resolver; giới hạn 180 giây; prompt generator |
| Bổ sung ở v2 giai đoạn 1 | `follow_path`, `z_index`, group transforms, `draw_path`, prompt khoa học và fixture tích hợp |
| Còn giới hạn | Timeline UI cho object animation, UI vector editor, ratio-aware auto layout; xem thêm tài liệu v2 |

## Kiểm thử

Project chưa khai báo unit/integration test runner. Hai fixture v1 là hồi quy bắt buộc khi chạy kiểm thử v2. Browser preview/export cần xác nhận trên trình duyệt thực tế trước khi xem chất lượng video là đã duyệt. Export video dựa vào `HTMLCanvasElement.captureStream`, `MediaRecorder` và codec MP4/WebM mà trình duyệt cung cấp.
