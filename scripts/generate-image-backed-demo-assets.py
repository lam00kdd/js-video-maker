"""Generate the deterministic, transparent PNG parts used by the CP2 demo fixture."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "examples" / "character-image-backed-demo" / "assets"
OUT.mkdir(parents=True, exist_ok=True)
S = 3


def canvas(name, size, painter):
    image = Image.new("RGBA", (size[0] * S, size[1] * S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    painter(draw)
    image.resize(size, Image.Resampling.LANCZOS).save(OUT / f"{name}.png", optimize=True)


def head(d):
    d.ellipse((24*S, 10*S, 232*S, 250*S), fill="#efbd98", outline="#714638", width=3*S)
    d.ellipse((22*S, 1*S, 234*S, 117*S), fill="#53382e")
    d.polygon([(22*S, 75*S), (42*S, 39*S), (87*S, 62*S), (127*S, 44*S), (170*S, 63*S), (222*S, 37*S), (234*S, 94*S), (218*S, 129*S), (205*S, 91*S), (176*S, 78*S), (145*S, 91*S), (104*S, 79*S), (70*S, 92*S), (45*S, 121*S)], fill="#53382e")
    d.ellipse((9*S, 107*S, 38*S, 157*S), fill="#e9ae87")
    d.ellipse((218*S, 107*S, 247*S, 157*S), fill="#e9ae87")


def neck(d):
    d.rounded_rectangle((26*S, 2*S, 78*S, 80*S), radius=15*S, fill="#e9ad86")


def torso(d):
    # Broad, shaped shoulder yoke follows the authored shoulder joints. The
    # narrow waist ends above the pelvis so the pants and leg attachments show.
    d.polygon([(10*S, 12*S), (246*S, 12*S), (256*S, 56*S), (226*S, 91*S), (202*S, 215*S), (54*S, 215*S), (30*S, 91*S), (0*S, 56*S)], fill="#287ba8", outline="#174d6b", width=4*S)
    d.polygon([(70*S, 20*S), (121*S, 47*S), (174*S, 20*S), (160*S, 83*S), (123*S, 104*S), (86*S, 83*S)], fill="#f4f2e8")
    d.polygon([(112*S, 73*S), (135*S, 73*S), (130*S, 175*S), (118*S, 175*S)], fill="#e9a83f")
    d.line((124*S, 175*S, 124*S, 202*S), fill="#f1e6c9", width=4*S)


def pelvis(d):
    # Two shaped trouser tabs extend over the hip attachments, split by a
    # narrow crotch seam; this is clothing coverage rather than a box overlay.
    d.polygon([(20*S, 5*S), (180*S, 5*S), (178*S, 126*S), (158*S, 144*S), (116*S, 146*S), (100*S, 108*S), (84*S, 146*S), (42*S, 144*S), (22*S, 126*S)], fill="#314d6b", outline="#20354c", width=4*S)
    d.line((100*S, 14*S, 100*S, 108*S), fill="#617992", width=3*S)


def upper_arm(d):
    d.rounded_rectangle((3*S, 8*S, 213*S, 80*S), radius=35*S, fill="#287ba8", outline="#174d6b", width=4*S)
    d.line((174*S, 17*S, 174*S, 71*S), fill="#54a0c5", width=3*S)


def forearm(d):
    d.rounded_rectangle((3*S, 8*S, 213*S, 72*S), radius=31*S, fill="#e9ad86", outline="#bd815f", width=3*S)
    d.rounded_rectangle((4*S, 8*S, 38*S, 72*S), radius=14*S, fill="#287ba8")


def hand(d):
    d.ellipse((24*S, 40*S, 112*S, 119*S), fill="#e9ad86", outline="#bd815f", width=3*S)
    for x, top in [(28, 18), (48, 5), (69, 0), (89, 10)]:
        d.rounded_rectangle((x*S, top*S, (x+18)*S, 78*S), radius=9*S, fill="#e9ad86", outline="#bd815f", width=2*S)
    d.rounded_rectangle((12*S, 63*S, 42*S, 104*S), radius=12*S, fill="#e9ad86")


def thigh(d):
    d.rounded_rectangle((3*S, 6*S, 223*S, 91*S), radius=25*S, fill="#314d6b", outline="#20354c", width=4*S)
    d.line((191*S, 15*S, 191*S, 80*S), fill="#617992", width=3*S)


def shin(d):
    d.rounded_rectangle((3*S, 8*S, 223*S, 86*S), radius=25*S, fill="#365775", outline="#20354c", width=4*S)
    d.line((185*S, 17*S, 185*S, 76*S), fill="#71899d", width=3*S)


def foot(d):
    d.rounded_rectangle((23*S, 19*S, 218*S, 97*S), radius=34*S, fill="#f2eee3", outline="#25394d", width=5*S)
    d.rounded_rectangle((41*S, 71*S, 217*S, 100*S), radius=13*S, fill="#d49b42")
    d.line((74*S, 38*S, 171*S, 38*S), fill="#ffffff", width=4*S)


def eye(d):
    d.ellipse((4*S, 4*S, 50*S, 68*S), fill="#fffdf6", outline="#714638", width=2*S)
    d.ellipse((16*S, 15*S, 42*S, 60*S), fill="#263a4b")
    d.ellipse((21*S, 19*S, 29*S, 29*S), fill="#ffffff")


def smile(d):
    d.arc((2*S, 0*S, 74*S, 40*S), start=10, end=170, fill="#9a4f4d", width=5*S)


for name, size, painter in [
    ("head", (256, 260), head), ("neck", (104, 88), neck), ("torso", (256, 220), torso),
    ("pelvis", (200, 150), pelvis), ("upper_arm", (216, 88), upper_arm), ("forearm", (216, 80), forearm),
    ("hand", (128, 128), hand), ("thigh", (228, 100), thigh), ("shin", (228, 96), shin),
    ("foot", (224, 108), foot), ("eye", (56, 74), eye), ("smile", (80, 46), smile),
]:
    canvas(name, size, painter)

root = OUT.parent
parts = {
    "neck": ("neck", {"joint_id": "neck"}, {"x": 0, "y": -0.02}, 0.070, 32),
    "torso": ("torso", {"joint_id": "torso"}, {"x": 0, "y": -0.015}, 0.210, 34),
    "pelvis": ("pelvis", {"joint_id": "pelvis"}, {"x": 0, "y": 0.005}, 0.180, 20),
    "left_upper_arm": ("upper_arm", {"from_joint_id": "left_upper_arm", "to_joint_id": "left_forearm"}, {"x": 0, "y": 0}, 0.150, 25),
    "right_upper_arm": ("upper_arm", {"from_joint_id": "right_upper_arm", "to_joint_id": "right_forearm"}, {"x": 0, "y": 0}, 0.150, 25),
    "left_forearm": ("forearm", {"from_joint_id": "left_forearm", "to_joint_id": "left_hand"}, {"x": 0, "y": 0}, 0.115, 38),
    "right_forearm": ("forearm", {"from_joint_id": "right_forearm", "to_joint_id": "right_hand"}, {"x": 0, "y": 0}, 0.115, 38),
    "left_hand": ("hand", {"joint_id": "left_hand"}, {"x": 0, "y": 0}, 0.060, 43),
    "right_hand": ("hand", {"joint_id": "right_hand"}, {"x": 0, "y": 0}, 0.060, 43),
    "left_thigh": ("thigh", {"from_joint_id": "left_thigh", "to_joint_id": "left_shin"}, {"x": 0, "y": 0}, 0.150, 13),
    "right_thigh": ("thigh", {"from_joint_id": "right_thigh", "to_joint_id": "right_shin"}, {"x": 0, "y": 0}, 0.150, 13),
    "left_shin": ("shin", {"from_joint_id": "left_shin", "to_joint_id": "left_foot"}, {"x": 0, "y": 0}, 0.135, 11),
    "right_shin": ("shin", {"from_joint_id": "right_shin", "to_joint_id": "right_foot"}, {"x": 0, "y": 0}, 0.135, 11),
    "left_foot": ("foot", {"joint_id": "left_foot"}, {"x": -0.005, "y": 0.015}, 0.130, 17),
    "right_foot": ("foot", {"joint_id": "right_foot"}, {"x": 0.005, "y": 0.015}, 0.130, 17),
    "head": ("head", {"joint_id": "head"}, {"x": 0, "y": -0.004}, 0.190, 55),
    "eye_left": ("eye", {"joint_id": "head"}, {"x": -0.034, "y": -0.012}, 0.014, 62),
    "eye_right": ("eye", {"joint_id": "head"}, {"x": 0.034, "y": -0.012}, 0.014, 62),
    "smile": ("smile", {"joint_id": "head"}, {"x": 0, "y": 0.031}, 0.045, 63),
}
sizes = {"head": (256, 260), "neck": (104, 88), "torso": (256, 220), "pelvis": (200, 150), "upper_arm": (216, 88), "forearm": (216, 80), "hand": (128, 128), "thigh": (228, 100), "shin": (228, 96), "foot": (224, 108), "eye": (56, 74), "smile": (80, 46)}
pivots = {"head": (128, 130), "neck": (52, 44), "torso": (128, 110), "pelvis": (100, 60), "upper_arm": (16, 44), "forearm": (16, 40), "hand": (64, 78), "thigh": (16, 50), "shin": (16, 48), "foot": (32, 55), "eye": (28, 37), "smile": (40, 23)}
attachments = {"upper_arm": (16, 44, 200, 44), "forearm": (16, 40, 200, 40), "thigh": (16, 50, 212, 50), "shin": (16, 48, 212, 48)}
asset_records = []
manifest_parts = []
for part_id, (asset_name, binding, offset, size_w, z_index) in parts.items():
    image_path = OUT / f"{asset_name}.png"
    data = image_path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    asset_id = f"libsha256_{digest}"
    width, height = sizes[asset_name]
    size_h = size_w * height / width
    pivot_x, pivot_y = pivots[asset_name]
    asset_records.append({"id": asset_id, "filename": f"assets/{asset_name}.png", "mime_type": "image/png", "sha256": digest, "size": len(data), "width": width, "height": height})
    if asset_name in attachments:
        ax, ay, bx, by = attachments[asset_name]
        binding = {**binding, "attachment_points_px": {"from": {"x": ax, "y": ay}, "to": {"x": bx, "y": by}}}
    manifest_parts.append({"id": part_id, "type": "image", "asset_id": asset_id, "source_dimensions_px": {"width": width, "height": height}, "size_rig_units": {"width": round(size_w, 8), "height": round(size_h, 8)}, "alpha": True, "opacity": 1, "binding": binding, "pivot": {"space": "image_px", "x": pivot_x, "y": pivot_y}, "transform": {"offset": offset, "rotation": 0, "scale": 1}, "z_index": z_index, "visible": True, "required": True, "feature_bindings": ({"eye_left": "blink.eye_left"} if part_id == "eye_left" else {"eye_right": "blink.eye_right"} if part_id == "eye_right" else {})})

asset_records = list({record["id"]: record for record in asset_records}.values())

joint_layout = [
    ("root", None, 0, 0, 0), ("pelvis", "root", 0, 0, 0), ("torso", "pelvis", 0, -0.045, 0),
    ("neck", "torso", 0, -0.140, 0), ("head", "neck", 0, -0.055, 0),
    ("left_upper_arm", "torso", -0.105, -0.102, -0.12), ("left_forearm", "left_upper_arm", -0.145, 0.035, 0), ("left_hand", "left_forearm", -0.085, 0.075, 0),
    ("right_upper_arm", "torso", 0.105, -0.102, 0.12), ("right_forearm", "right_upper_arm", 0.145, 0.035, 0), ("right_hand", "right_forearm", 0.085, 0.075, 0),
    ("left_thigh", "pelvis", -0.055, 0.045, 0), ("left_shin", "left_thigh", -0.010, 0.150, 0), ("left_foot", "left_shin", -0.025, 0.135, 0),
    ("right_thigh", "pelvis", 0.055, 0.045, 0), ("right_shin", "right_thigh", 0.010, 0.150, 0), ("right_foot", "right_shin", 0.025, 0.135, 0),
]
joints = [{"id": name, "parent_id": parent, "position": {"x": x, "y": y}, "rotation": rotation, "rest_pose": {"rotation": rotation}, "pivot": {"x": 0, "y": 0}, "limits": {"min": -1.5 if "arm" in name or "forearm" in name or "thigh" in name or "shin" in name else -0.35, "max": 1.5 if "arm" in name or "forearm" in name or "thigh" in name or "shin" in name else 0.35}, "length": 0} for name, parent, x, y, rotation in joint_layout]
character = {"character_id": "char_cp2_demo_teacher", "display_name": "CP2 Image-Backed Teacher Demo", "description": "Technical renderer fixture; simple educational cartoon artwork, not production art.", "version": "1.0.1", "rig": {"id": "cp2_adult_teacher", "joints": joints, "parts": []}, "manifest": {"appearance_id": "cp2_demo_teacher_image", "version": "1.0.1", "backend": "image", "rig_compatibility": {"rig_semantics": "m1-human-rig", "proportion_profile": "adult", "required_joints": [joint[0] for joint in joint_layout]}, "parts": manifest_parts}, "assets": asset_records}
(root / "character-library-record.json").write_text(json.dumps(character, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(asset_records)} transparent CP2 demo part files and Character Library record to {root}")
