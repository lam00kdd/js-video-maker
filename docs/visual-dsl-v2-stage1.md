# LAM AI LAB Motion Studio — Visual DSL v2, Giai đoạn 1

## Tương thích

Visual DSL v2 tiếp tục dùng project `version:2`, `scene_graph.version:2`, `coordinate_space:"normalized"` và Canvas2D object renderer hiện tại. Root JSON dùng `visual_dsl_version:2`. Visual DSL v1 vẫn được import; object không có `z_index` nhận giá trị 0, `draw_on` giữ cách cũ làm opacity reveal cả object. Classic, Canvas2D legacy, Asset2D và project cũ giữ schema cũ.

## Thuộc tính và hành động

- Mọi object có `z_index` hữu hạn, mặc định 0. Sibling render theo z tăng dần; trùng z giữ nguyên thứ tự JSON. Group sắp xếp children riêng bên trong group. Preview và export gọi cùng `renderObjectScene`.
- Group là node cha có transform translation/rotation/scale. Transform con dùng tọa độ local theo hệ chuẩn hóa và được nhân với transform cha; group lồng nhau áp dụng từ ngoài vào trong. Opacity cũng cộng dồn qua Canvas global alpha. Cây group sâu tối đa 8, tổng tối đa 500 node; ID phải duy nhất trong scene.
- `follow_path` nằm trong `actions[]` của object cấp gốc. Params: `{ "path_id":"curve", "orient_to_path":true }`; loop ở action: `none`, `repeat`, `ping_pong`. Path ID phải tham chiếu `type:"path"`; path không thể tự follow, và target không thể là path. Q/C được flatten thích ứng theo dung sai pixel để tính chiều dài; vị trí và tiếp tuyến lấy theo tỷ lệ chiều dài thật trong canvas. `none` dừng ở cuối; repeat/ping_pong lặp đến hết scene. Repeat trên path mở trở về đầu và có thể nhảy; dùng path đóng hoặc ping_pong để loop liền mạch. Follow trên object con chưa hỗ trợ; gắn action lên group cha để di chuyển cả nhóm.
- Path có thể chứa nhiều subpath. Khi follow, renderer nối điểm cuối và đầu subpath bằng một đoạn đường thẳng ẩn để vật không nhảy vị trí; đoạn nối không thuộc nét path. M/L/Q/C/Z đều được dùng trong path metrics.
- `draw_path` chỉ nhận object `type:"path"`. Tiến độ 0–100% chia theo tổng chiều dài nét, bao gồm đường cong; nhiều subpath lần lượt được reveal mà không vẽ đoạn nối ẩn. `Z` khép đoạn path khi tiến độ đến cuối. Trong lúc vẽ, renderer stroke phần nét đã lộ; fill chỉ xuất hiện khi đường hoàn tất. `draw_on` tiếp tục giữ hành vi v1.

Action chuẩn gồm `start_seconds`, `duration_seconds`, `easing`, `params`; `follow_path` thêm `loop`. Cùng property channel không được chồng thời gian; follow path có `orient_to_path:true` chiếm cả position và rotation.

## Prompt Generator

Tùy chọn Visual DSL tạo root version 2 và in registry thực tế từ schema. Hướng dẫn nhấn mạnh tính đúng và dễ hiểu trong hình khoa học, vector nhiều lớp khi cần, nhãn tránh cấu trúc chính, animation gắn với narration, bỏ trang trí không phục vụ nội dung và chừa vùng an toàn logo/phụ đề.

## Fixture và kiểm thử

- `examples/Visual_DSL_v1_Cell.json` và `examples/Visual_DSL_v1_Curved_Motion.json` là hồi quy v1.
- `examples/Visual_DSL_v2_Follow_Path_Group_Draw.json` kiểm tra follow path cubic nhiều subpath, mũi tên tiếp tuyến, group chuyển động đồng bộ, draw path có Q/C, và lớp chồng z-index.
- Renderer preview và export dùng chung `renderSceneObjectGraph` → `renderObjectScene`. Nên kiểm tra lần lượt 0%, giữa và 100% ở browser thật cùng file video đã xuất.

## Hạn chế

Follow path trên object con chưa hỗ trợ; áp dụng action lên group cha. Đo chiều dài Bézier dùng flatten thích ứng theo pixel nên là xấp xỉ rất nhỏ, không tích phân đóng dạng. Đoạn nối subpath là đường du hành ẩn và có thể không phù hợp nếu cần biểu diễn quỹ đạo gián đoạn. Group dùng tọa độ local chuẩn hóa theo canvas, không có hệ tọa độ theo bounds riêng hoặc anchor/pivot tùy chỉnh. `draw_path` giới hạn ở primitive `path`; clipping fill trung gian chưa áp dụng. Không có editor timeline/vector UI cho action mới.
