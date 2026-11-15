"""Print PNG overdraw and old bone-end gap measurements for the CP2 fixture."""
from pathlib import Path
import json
import math
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "examples" / "character-image-backed-demo"
record = json.loads((PACK / "character-library-record.json").read_text(encoding="utf-8"))
project = json.loads((ROOT / "examples" / "Scientific_Human_Image_Backed_Demo.json").read_text(encoding="utf-8"))
assets = {asset["id"]: asset for asset in record["assets"]}
variants = {"16:9": (1280, 720), "9:16": (720, 1280)}
report = {"character_id": record["character_id"], "version": record["version"], "content_checksum": record["content_checksum"], "measurement": "alpha row at authored attachment center, >=16 alpha threshold; renderer units are canvas pixels", "bone_parts": []}

for appearance_part in record["manifest"]["parts"]:
    anchors = appearance_part["binding"].get("attachment_points_px")
    if not anchors:
        continue
    asset = assets[appearance_part["asset_id"]]
    image = Image.open(PACK / asset["filename"]).convert("RGBA")
    alpha = image.getchannel("A")
    y = round(anchors["from"]["y"])
    row_start, row_end = max(0, y - 2), min(image.height, y + 3)
    alpha_bytes = alpha.crop((0, row_start, image.width, row_end)).tobytes()
    active = [x for row in range(row_end - row_start) for x in range(image.width) if alpha_bytes[row * image.width + x] >= 16]
    if not active:
        report["bone_parts"].append({"part_id": appearance_part["id"], "error": "no alpha at attachment row"})
        continue
    alpha_min, alpha_max = min(active), max(active)
    from_x, to_x = anchors["from"]["x"], anchors["to"]["x"]
    parent_id, child_id = appearance_part["binding"]["from_joint_id"], appearance_part["binding"]["to_joint_id"]
    child = next(joint for joint in record["rig"]["joints"] if joint["id"] == child_id)
    local_length = math.hypot(child["position"]["x"], child["position"]["y"])
    layouts = {}
    for ratio, (width, height) in variants.items():
        instance = project["variants"]["portrait" if ratio == "9:16" else "landscape"]["scenes"][0]["scene_graph"]["character_instances"][0]
        segment_px = local_length * min(width, height) * instance["transform"]["scale"]
        # CP2 v1.0.0 used the original generator's x=5 pivot for all bone parts.
        old_pivot = 5
        old_scale = segment_px / image.width
        new_scale = segment_px / (to_x - from_x)
        layouts[ratio] = {
            "segment_length_px": round(segment_px, 3),
            "previous_binding": {
                "proximal_overdraw_px": round((old_pivot - alpha_min) * old_scale, 3),
                "distal_gap_px": round((image.width - (alpha_max - old_pivot)) * old_scale, 3),
            },
            "attachment_binding": {
                "proximal_overdraw_px": round((from_x - alpha_min) * new_scale, 3),
                "distal_overdraw_px": round((alpha_max - to_x) * new_scale, 3),
                "from_joint_transform_residual_px": 0,
                "to_joint_transform_residual_px": 0,
            },
        }
    report["bone_parts"].append({"part_id": appearance_part["id"], "from_joint": parent_id, "to_joint": child_id, "source_dimensions_px": [image.width, image.height], "alpha_run_px": [alpha_min, alpha_max], "attachment_points_px": [from_x, to_x], "layouts": layouts})

print(json.dumps(report, indent=2))
