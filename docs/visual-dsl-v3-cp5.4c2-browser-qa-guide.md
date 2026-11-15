# Hướng dẫn QA trình duyệt CP5.4C-2 · Visual Anchors

## Chuẩn bị

Mở Video Studio từ địa chỉ local hiện đang dùng trong Chrome hoặc Edge. Không mở generator bằng `file://`, vì generator cần đọc IndexedDB theo cùng origin. Trên server mặc định của repository, trang generator là:

`http://127.0.0.1:4173/qa/anchor-fixtures/index.html`

Trang này là tiện ích QA tách biệt, không thêm nút vào luồng Video Studio. Nó chỉ đọc Visual Asset Registry và ghi các JSON/package vào thư mục bạn chọn. Nó không cập nhật metadata, project đang mở hay asset đã đăng ký.

## 1. Lấy đúng asset ID cảm biến

1. Trong Video Studio, mở biểu tượng `▧` có tooltip **Quản lý hình minh họa**.
2. Tìm asset cảm biến tiệm cận điện cảm. Xem mã `visual_<64 ký tự>` trong card nếu cần đối chiếu.
3. Bấm **Sửa Visual Anchors** và xác nhận có anchor `mat_cam_bien` (mặt cảm biến). Lưu thay đổi nếu bạn vừa chỉnh.
4. Mở trang generator ở trên, chọn asset cảm biến trong **Asset cảm biến đã đăng ký**. Danh sách chỉ hiện asset có `mat_cam_bien`.
5. Kiểm tra asset ID, tên anchor và trạng thái đang hiện. Fingerprint được tính từ `spatial_metadata` thật trong IndexedDB; không nhập ID hoặc fingerprint bằng tay.

Nếu danh sách trống, kiểm tra đúng origin/tab của Video Studio và xác nhận anchor `mat_cam_bien` đã lưu. Generator không tạo ID giả thay thế.

## 2. Tạo và nhập Fixture A

1. Bấm **Tạo và xác thực bộ QA**.
2. Chọn thư mục cha QA trong hộp thoại trình duyệt. Generator tạo thư mục mới `CP5.4C-2-QA-<thời gian>` bên trong, gồm Fixture A–E, `Batch_Kit` và `Conflict_Companion_Package`.
3. Đọc kết quả trên trang: Fixture A–D phải báo `SCHEMA_AND_PREFLIGHT_PASS`; Fixture E phải báo `EXPECTED_PREFLIGHT_REJECTION`.
4. Quay lại Video Studio. Trong inspector ở khu vực **AI WORKFLOW**, bấm **Import script · auto build**, chọn `01_Fixture_A_Basic_Anchor_Callout.json`.
5. Ở hộp thoại nhập, chọn **Tạo project mới** để chạy QA trong session/tab riêng. Đừng chọn **Thay thế project hiện tại** nếu không muốn thay project đang mở.

Fixture A dài 12 giây, tỉ lệ ngang 16:9, có ảnh cảm biến thật trong registry, nhãn “Mặt cảm biến”, leader và highlight tại `mat_cam_bien`. Vị trí ảnh phụ thuộc anchor bạn đã lưu.

## 3. Xem callout, highlight, phát và tua

Bấm nút phát màu xanh ở Video Studio. Leader phải kết thúc tại điểm anchor trên mặt cảm biến; ellipse highlight phải đặt quanh cùng điểm. Dùng thanh timeline để dừng và kéo playhead tới đầu, giữa và cuối. Tua qua lại nhiều lần: marker không được trôi khỏi điểm ảnh. Nếu không thấy annotation, xem lỗi render/preflight trên màn hình và kiểm tra asset ID cùng fingerprint hiển thị khi tạo bộ.

## 4. Fixture B · Chuyển động và camera

Import `02_Fixture_B_Motion_Camera.json` qua **Import script · auto build** và chọn **Tạo project mới**. Bấm phát, sau đó tua ngược và phát lại. Ảnh có translation và rotation; camera có pan/zoom. Callout và highlight phải đi theo mặt cảm biến. Kết quả ở cùng timestamp phải ổn định khi seek lặp lại.

## 5. Fixture C · Dọc 9:16

Import `03_Fixture_C_Portrait.json`. Đây là bố cục độc lập 9:16, không phải bản kéo giãn của ngang. Chọn **Tạo project mới**, phát và xem nhãn, leader cùng ảnh có nằm gọn trong khung dọc không. Khi xuất, dialog **Tạo video** sẽ khóa tỉ lệ theo project V3 này.

## 6. Fixture D · Hai instance cùng ảnh

Import `04_Fixture_D_Duplicate_Instances.json`. Hai image node dùng cùng asset ID nhưng có node ID, vị trí và annotation riêng. Kiểm tra nhãn bên trái nối với cảm biến bên trái, nhãn bên phải nối với ảnh bên phải; không được lấy nhầm instance đầu tiên.

## 7. Fixture E · Anchor không tồn tại

Import `05_Fixture_E_Missing_Anchor_NEGATIVE.json`. JSON hợp lệ về schema để đi đến bước kiểm tra dependency, nhưng target `qa_anchor_does_not_exist` không tồn tại. Khi chạy render/export, ứng dụng phải báo lỗi preflight anchor rõ ràng trước khi mã hóa; không được thay bằng tâm ảnh. Fixture này chỉ dùng kiểm tra âm tính.

## 8. MP4

Với Fixture A hoặc B, bấm **Tạo Video**. Trong dialog, chọn **MP4 · recommended**, tỉ lệ **Chỉ 16:9**, rồi bấm **Tạo video hiện tại**. Mở MP4 tải về và kiểm tra frame gần 0%, 25%, 50%, 75% và cuối video. Fixture B phải giữ marker đúng khi ảnh/camera chuyển động. Đây là bước QA thủ công; việc generator/preflight pass không tự xác minh nội dung MP4.

## 9. Folder batch cô lập

Trong thư mục `Batch_Kit` có:

- `01_valid_anchor_aware.json` — dự kiến xuất thành công nếu registry hiện tại còn đúng asset và metadata.
- `02_valid_vector_only_v3.json` — dự kiến xuất thành công, không cần image registry.
- `03_invalid_missing_anchor.json` — dự kiến lỗi preflight và ở lại thư mục nguồn, không chuyển vào `processed-scripts`.
- `04_valid_legacy_v1.json` — ví dụ V1 có sẵn trong repository, dự kiến đi qua tuyến legacy nếu môi trường vẫn hỗ trợ pipeline đó.

1. Bấm **Tạo Video** để mở batch dialog.
2. Bấm **Chọn thư mục nguồn** và chọn `Batch_Kit`.
3. Bấm **Chọn thư mục output** và chọn một thư mục output QA riêng.
4. Đặt **MP4 · recommended** và tỉ lệ **Chỉ 16:9**.
5. Bấm **Xem danh sách JSON** để xem kế hoạch; tiếp tục theo dialog batch.
6. Kiểm tra từng file độc lập. File lỗi phải ở lại nguồn; file thành công có output và được chuyển vào `processed-scripts` theo chính sách hiện hành. Ghi lại tên output và trạng thái từng script.

Không chọn thư mục kịch bản sản xuất. Batch có quyền chuyển các JSON thành công ra khỏi thư mục nguồn.

## 10. Companion package và fingerprint conflict

Generator tạo `Conflict_Companion_Package` chứa đúng asset bytes/ID hiện tại nhưng spatial metadata trong manifest bị đổi nhẹ có chủ ý. Package này chỉ là ca âm tính, không được nhập bằng **Nhập gói asset** trong Visual Asset Manager.

Để kiểm tra an toàn, chạy batch với một script anchor hợp lệ làm nguồn, thư mục output QA riêng và bấm **Chọn gói Visual Asset (tùy chọn)** để chọn `Conflict_Companion_Package`. Kỳ vọng: preflight báo `V3_ANCHOR_PACKAGE_CONFLICT`; registry local vẫn giữ nguyên và không có MP4 cho script lỗi. Bỏ chọn package để chạy các fixture hợp lệ bình thường. Không cần sửa JSON hay anchor trong registry.

## 11. Khôi phục Video Studio

Luôn chọn **Tạo project mới** khi import fixture. Khi hoàn tất, đóng tab/session QA và quay lại tab Video Studio ban đầu; project đang mở được giữ nguyên. Nếu bạn đã chọn nhầm **Thay thế project hiện tại**, khôi phục bằng backup đã tải trước đó qua **Mở project**; thao tác đó yêu cầu xác nhận vì sẽ thay project trong session hiện tại.

## Kết quả và giới hạn

Generator hiển thị asset ID/fingerprint thật và kết quả kiểm schema, project normalization, export preflight. Test tự động trong repository dùng metadata/ID synthetic; nó không thay thế việc chạy generator trên registry trình duyệt của bạn. QA MP4 và batch chỉ được xem là đã xác minh sau khi bạn kiểm tra output thật.

Nếu registry không cùng origin, thiếu anchor, asset bytes hỏng, quyền chọn thư mục bị từ chối hoặc trình duyệt không hỗ trợ File System Access, generator/batch sẽ báo lỗi. Dùng Chrome/Edge mới và giữ generator cùng origin với Video Studio.
