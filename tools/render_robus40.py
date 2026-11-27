"""
Photo-real stills of the Robus 40 for the "Inside the frame" section (path traced with Cycles).

Run (Blender 5.x, NVIDIA GPU):
  blender -b Robus40_Website_Transparent_Components_11.blend --python tools/render_robus40.py -- <out-dir>
  node tools/compose_robus40.mjs <out-dir>

The geometry comes from the .blend; materials, lights and camera are defined here. The .blend is never saved.
Outputs: window.png (front view, glass see-through), where-<id>.png (one part alone, same camera),
part-<id>.png (product shot) and layout.json (where each of those sits in window.png).
"""
import bpy, bmesh, os, sys, math, json, time
from mathutils import Matrix, Vector

OUT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
os.makedirs(OUT, exist_ok=True)

WIN = ["00 Frame and sash", "02 Locking receiver", "03 Corner cleats", "04 Corner alignment",
       "05 Gaskets", "07 Frame and sash raiser", "09 Drainage parts - VERIFY", "10 Other fittings"]
HL = [("01 Friction_Stay", "stay"), ("02 Non return valve", "valve"), ("03 Handles", "handle"),
      ("04 Locking_Reciever", "receiver"), ("05 Corner_Alignment", "alignment"),
      ("06 Frame_SashRaiser", "raiser"), ("07Corner_Cleats", "cleats"),
      ("08 Safety_Catch", "safety"), ("09 Gasket", "gasket")]


# ------------------------------------------------------------------ materials
def role_of(n):
    n = n.lower()
    if "glass" in n: return "glass"
    if "frame control" in n or "sash control" in n: return "profile"
    if "seal" in n or "rubber" in n: return "rubber"
    if "wire" in n or "steel" in n: return "steel"
    if "worn_black" in n or "black metal" in n or "locks" in n: return "black"
    if "plastic" in n: return "plastic"
    if "powder" in n: return "powder"
    return "alu"


def lin(h):
    def f(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(int(h[1:3], 16)), f(int(h[3:5], 16)), f(int(h[5:7], 16)), 1)


def make(name, colour, metal, rough, grain=None, rough_var=0.0, brushed=None, spec=0.5):
    """grain = (size, depth) in metres; both are measured in the real world, not stretched to the mesh"""
    m = bpy.data.materials.new("pr_" + name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(colour)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    if grain:
        size, depth = grain
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 1 / size
        nz.inputs["Detail"].default_value = 2
        nt.links.new(geo.outputs["Position"], nz.inputs["Vector"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 1
        bump.inputs["Distance"].default_value = depth
        nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    if rough_var or brushed:
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = brushed if brushed else (60, 60, 60)
        nt.links.new(geo.outputs["Position"], mp.inputs["Vector"])
        nz2 = nt.nodes.new("ShaderNodeTexNoise")
        nz2.inputs["Scale"].default_value = 1
        nz2.inputs["Detail"].default_value = 4
        nt.links.new(mp.outputs["Vector"], nz2.inputs["Vector"])
        rng = nt.nodes.new("ShaderNodeMapRange")
        v = rough_var or 0.12
        rng.inputs["From Min"].default_value = 0.3
        rng.inputs["From Max"].default_value = 0.7
        rng.inputs["To Min"].default_value = rough - v
        rng.inputs["To Max"].default_value = rough + v
        nt.links.new(nz2.outputs["Fac"], rng.inputs["Value"])
        nt.links.new(rng.outputs["Result"], b.inputs["Roughness"])
    return m


def make_glass():
    m = bpy.data.materials.new("pr_glass")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.93, 0.98, 0.96, 1)
    b.inputs["Roughness"].default_value = 0.0
    b.inputs["IOR"].default_value = 1.38
    b.inputs["Transmission Weight"].default_value = 1.0
    return m


MATS = {
    # "Noir" powder coat: satin matte with the fine orange-peel texture of a sprayed, oven-cured finish
    "profile": make("profile", "#1c1e22", 0.15, 0.46, grain=(0.0011, 0.000045), spec=0.4),
    "powder": make("powder", "#303238", 0.2, 0.42, grain=(0.0009, 0.00003)),
    "rubber": make("rubber", "#151517", 0.0, 0.72, grain=(0.0006, 0.00004), spec=0.3),
    "plastic": make("plastic", "#202023", 0.0, 0.38, grain=(0.0005, 0.00002)),
    "black": make("black", "#4a4c51", 0.9, 0.38, rough_var=0.08),
    "steel": make("steel", "#c3c5c8", 1.0, 0.26, brushed=(2500, 2500, 40)),
    "alu": make("alu", "#cfd1d3", 1.0, 0.36, brushed=(1800, 1800, 30), rough_var=0.04),
    "glass": make_glass(),
}

# ------------------------------------------------------------------ scene: only the window's own geometry
src = bpy.data.scenes["WEBSITE MASTER"]


def find(c, name):
    if c.name == name:
        return c
    for ch in c.children:
        r = find(ch, name)
        if r:
            return r


sc = bpy.data.scenes.new("PHOTO")
if bpy.context.window_manager.windows:
    bpy.context.window_manager.windows[0].scene = sc

families = {}
for cn, fam in [(c, None) for c in WIN] + HL:
    for o in find(src.collection, cn).objects:
        if o.type not in ("MESH", "CURVE", "EMPTY"):
            continue
        sc.collection.objects.link(o)
        o.hide_render = False
        o.hide_viewport = False
        if o.type in ("MESH", "CURVE"):
            names = [s.material.name for s in o.material_slots if s.material] or ["alu"]
            for slot in o.material_slots:
                nm = slot.material.name if slot.material else names[0]
                slot.link = "OBJECT"
                slot.material = MATS[role_of(nm)]
            if not o.material_slots:
                o.data.materials.append(MATS["alu"])
        families.setdefault(fam or ("win:" + cn), []).append(o)


def world_points(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        if o.type not in ("MESH", "CURVE"):
            continue
        e = o.evaluated_get(dg)
        me = e.to_mesh()
        if me:
            pts += [e.matrix_world @ v.co for v in me.vertices]
        e.to_mesh_clear()
    return pts


def bounds(objs):
    pts = world_points(objs)
    return (Vector([min(p[i] for p in pts) for i in range(3)]),
            Vector([max(p[i] for p in pts) for i in range(3)]))


frame_objs = families["win:00 Frame and sash"]
frame_mn, frame_mx = bounds(frame_objs)
centre = (frame_mn + frame_mx) / 2
gm_mn, gm_mx = bounds([o for o in frame_objs if o.type == "MESH" and o.material_slots
                       and o.material_slots[0].material == MATS["glass"]])
FW, FH = frame_mx.x - frame_mn.x, frame_mx.z - frame_mn.z

# ------------------------------------------------------------------ engine
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "OPTIX"
sc.cycles.device = "GPU"
sc.cycles.use_denoising = True
sc.cycles.use_adaptive_sampling = True
sc.cycles.adaptive_threshold = 0.012
sc.cycles.max_bounces = 10
sc.cycles.transparent_max_bounces = 16
sc.cycles.film_transparent_glass = True
sc.cycles.film_transparent_roughness = 0.1
sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sc.render.image_settings.color_depth = "8"
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Medium High Contrast"
sc.view_settings.exposure = 0.2

# ------------------------------------------------------------------ light: a photographed room (HDRI) + soft boxes
LIGHT_DIR = os.path.join(bpy.utils.system_resource("DATAFILES"), "studiolights", "world")  # ships with Blender, CC0
w = bpy.data.worlds.new("photo")
sc.world = w
w.use_nodes = True
nt = w.node_tree
env = nt.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(os.path.join(LIGHT_DIR, "interior.exr"))
tc = nt.nodes.new("ShaderNodeTexCoord")
mp = nt.nodes.new("ShaderNodeMapping")
mp.inputs["Rotation"].default_value = (0, 0, math.radians(300))
nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
bg = nt.nodes["Background"]
nt.links.new(env.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 1.5


def area(name, pos, size, power, colour, target):
    light = bpy.data.lights.new(name, "AREA")
    light.shape = "RECTANGLE"
    light.size, light.size_y = size
    light.energy = power
    light.color = colour
    o = bpy.data.objects.new(name, light)
    o.location = pos
    o.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(o)
    return o


# screen-left is +X: the camera stands on the room side (+Y) and looks back along -Y
window_lights = [
    area("key", centre + Vector((2.1, 1.9, 1.5)), (1.1, 1.8), 120, (1.0, 0.95, 0.88), centre),
    area("strip", centre + Vector((-2.3, 1.0, 0.2)), (0.25, 2.4), 80, (0.86, 0.91, 1.0), centre),
    area("top", centre + Vector((0.2, 0.7, 2.0)), (1.8, 0.35), 55, (1.0, 0.98, 0.95), centre),
]

# ------------------------------------------------------------------ camera
cam_data = bpy.data.cameras.new("front")
cam = bpy.data.objects.new("front", cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
DIST = 5.2
cam_data.sensor_fit = "VERTICAL"
cam_data.sensor_height = 36

H_VIEW = FH * 1.03  # metres of height in the full picture
PPM = 2350          # pixels per metre
WPX, HPX = int(round(FW * 1.05 * PPM / 2)) * 2, int(round(H_VIEW * PPM / 2)) * 2


def frame_view(cx, cz, height, w_px, h_px):
    """Straight-on, always from the same eye point: a narrower view is an exact enlargement of the full one
    (longer lens + lens shift), so the page can lay a part over the window without anything drifting."""
    cam.location = (centre.x, DIST, centre.z)
    cam.rotation_euler = (math.radians(90), 0, math.radians(180))
    cam_data.lens = cam_data.sensor_height * (DIST - frame_mx.y) / height
    cam_data.shift_x = -(cx - centre.x) / height
    cam_data.shift_y = (cz - centre.z) / height
    sc.render.resolution_x, sc.render.resolution_y = w_px, h_px
    sc.render.resolution_percentage = 100


def to_pixel(p):
    """where a world point lands in window.png"""
    k = (DIST - frame_mx.y) / (DIST - p.y)
    s = HPX / H_VIEW
    return (WPX / 2 - (p.x - centre.x) * k * s, HPX / 2 - (p.z - centre.z) * k * s)


def pixel_box(pts):
    px = [to_pixel(p) for p in pts]
    return (min(p[0] for p in px), min(p[1] for p in px), max(p[0] for p in px), max(p[1] for p in px))


def render(name, samples):
    sc.cycles.samples = samples
    sc.render.filepath = os.path.join(OUT, name)
    t = time.time()
    bpy.ops.render.render(write_still=True, scene=sc.name)
    print("RENDERED", name, "%dx%d" % (sc.render.resolution_x, sc.render.resolution_y), round(time.time() - t, 1), "s", flush=True)


# ------------------------------------------------------------------ 1) the whole window
frame_view(centre.x, centre.z, H_VIEW, WPX, HPX)
render("window.png", 160)

glass = pixel_box([Vector((x, gm_mx.y, z)) for x in (gm_mn.x, gm_mx.x) for z in (gm_mn.z, gm_mx.z)])
layout = {"width": WPX, "height": HPX, "glass": [round(v, 1) for v in glass], "parts": {}}

# ------------------------------------------------------------------ 2) where each part sits (same eye, part alone)
everything = list(sc.collection.objects)


def solo(objs):
    keep = set(objs)
    for o in everything:
        if o.type not in ("LIGHT", "CAMERA"):
            o.hide_render = o not in keep


def cut(o, keep_below=None, between=None):
    """edit a private copy of the mesh: the file models both friction stays together, and the gasket is 1.7 m long"""
    o.data = o.data.copy()
    bm = bmesh.new()
    bm.from_mesh(o.data)
    mw = o.matrix_world
    if keep_below is not None:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if (mw @ v.co).z > keep_below], context="VERTS")
    if between is not None:
        inv = mw.inverted()
        for z, clear_inner in ((between[0], True), (between[1], False)):
            co = inv @ Vector((0, 0, z))
            no = (inv.to_3x3() @ Vector((0, 0, 1))).normalized()
            r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no,
                                       clear_inner=clear_inner, clear_outer=not clear_inner)
            edges = [g for g in r["geom_cut"] if isinstance(g, bmesh.types.BMEdge) and g.is_valid]
            bmesh.ops.holes_fill(bm, edges=[e for e in edges if e.is_boundary], sides=0)
    bm.to_mesh(o.data)
    bm.free()


# show the bottom friction stay only
for o in families["stay"]:
    if o.type == "MESH":
        cut(o, keep_below=1.3)

for _, fam in HL:
    solo(families[fam])
    x0, y0, x1, y1 = pixel_box(world_points(families[fam]))
    pad = 10
    x0, y0, x1, y1 = math.floor(x0 - pad), math.floor(y0 - pad), math.ceil(x1 + pad), math.ceil(y1 + pad)
    bw, bh = x1 - x0, y1 - y0
    k = min(2.5, 2000 / max(bw, bh))  # drawn sharper than the window, because the page zooms in on it
    m_per_px = H_VIEW / HPX
    frame_view(centre.x - ((x0 + x1) / 2 - WPX / 2) * m_per_px, centre.z - ((y0 + y1) / 2 - HPX / 2) * m_per_px,
               bh * m_per_px, max(8, round(bw * k)), max(8, round(bh * k)))
    render("where-%s.png" % fam, 96)
    layout["parts"][fam] = {"where": [x0, y0, bw, bh]}

# ------------------------------------------------------------------ 3) product shots
for o in families["gasket"]:
    if o.type == "MESH":
        cut(o, between=(1.2, 1.29))

env.image = bpy.data.images.load(os.path.join(LIGHT_DIR, "studio.exr"))
bg.inputs["Strength"].default_value = 1.15
for o in window_lights:
    o.hide_render = True

# per part, in degrees: yaw (0 = straight from the room), pitch (looking down), roll
SHOTS = {
    "stay": (-22, 52, -24), "valve": (34, 30, 0), "handle": (-38, 12, 0), "receiver": (62, 14, 0),
    "alignment": (24, 20, 8), "raiser": (-30, 34, 0), "cleats": (28, 24, 0), "safety": (-52, 14, 32),
    "gasket": (-58, 30, 38),
}
shot_lights = []


def product_lights(c, size, right, up, back):
    """a key, a fill and two rim strips, scaled to the part so a screw and a hinge are lit alike"""
    for o in shot_lights:
        bpy.data.objects.remove(o)
    shot_lights.clear()
    d = size * 3.2

    def put(name, offset, wh, strength, colour):
        shot_lights.append(area(name, c + offset.normalized() * d, (wh[0] * size, wh[1] * size), strength * d * d, colour, c))

    put("k", back + up * 0.9 - right * 0.8, (2.2, 2.2), 17, (1.0, 0.95, 0.88))
    put("f", back + right * 1.1 - up * 0.1, (2.4, 2.4), 6, (0.9, 0.94, 1.0))
    put("rl", -back * 0.7 - right + up * 0.5, (0.5, 3.0), 30, (0.85, 0.92, 1.0))
    put("rr", -back * 0.7 + right + up * 0.2, (0.5, 3.0), 30, (1.0, 0.93, 0.84))


for _, fam in HL:
    solo(families[fam])
    pts = world_points(families[fam])
    mn = Vector([min(p[i] for p in pts) for i in range(3)])
    mx = Vector([max(p[i] for p in pts) for i in range(3)])
    c = (mn + mx) / 2
    size = max(mx - mn)
    yaw, pitch, roll = (math.radians(v) for v in SHOTS[fam])
    back = Vector((math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    right0 = back.cross(Vector((0, 0, 1))).normalized() * -1
    up0 = back.cross(right0).normalized()
    right = right0 * math.cos(roll) + up0 * math.sin(roll)
    up = up0 * math.cos(roll) - right0 * math.sin(roll)
    dist = size * 7
    eye = c + back * dist
    cam.location = eye
    cam.rotation_euler = Matrix((right, up, back)).transposed().to_euler()
    us, vs = [], []
    for p in pts:
        r = p - eye
        depth = -r.dot(back)
        us.append(r.dot(right) / depth)
        vs.append(r.dot(up) / depth)
    uw, vh = (max(us) - min(us)) * 1.08, (max(vs) - min(vs)) * 1.08
    longest = 1800
    wpx, hpx = (longest, max(500, round(longest * vh / uw))) if uw >= vh else (max(500, round(longest * uw / vh)), longest)
    fit_h = max(vh, uw * hpx / wpx)
    cam_data.lens = cam_data.sensor_height / fit_h
    cam_data.shift_x = (max(us) + min(us)) / 2 / fit_h
    cam_data.shift_y = (max(vs) + min(vs)) / 2 / fit_h
    sc.render.resolution_x, sc.render.resolution_y = wpx, hpx
    cam_data.clip_start = dist * 0.05
    product_lights(c, size, right, up, back)
    render("part-%s.png" % fam, 160)

with open(os.path.join(OUT, "layout.json"), "w") as f:
    json.dump(layout, f, indent=1)
print("LAYOUT written")
