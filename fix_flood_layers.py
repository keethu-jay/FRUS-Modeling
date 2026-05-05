"""
Fix #1: Regenerate flood_heavy_rain / cloudburst / extreme GeoJSON with realistic
        coastal-inundation shapes instead of rectangular blocks.

Fix #2: Rebuild shore_1m / shore_2m into continuous boundary polylines by
        chaining the pixel-level fragments into long connected lines. This removes
        the "scattered dots" look and makes the 1m / 2m flood fronts visible.
"""

import json, math, zipfile, struct
from pyproj import Transformer

OUT = "frontend/public/data/vectors"

# ── Helper: sinusoidal irregular boundary ────────────────────────────────────

def irregular_lat(i, n, center, amp1, amp2=None, amp3=None, ph2=0.0, ph3=0.0):
    t = math.pi * 2 * i / n
    v = center + amp1 * math.sin(t * 1.0)
    if amp2:
        v += amp2 * math.sin(t * 2.3 + ph2)
    if amp3:
        v += amp3 * math.sin(t * 4.1 + ph3)
    return round(v, 6)


# ── Realistic flood scenario polygons ────────────────────────────────────────
#
# Pilot area: lon -74.024 -> -73.985, lat 40.462 -> 40.484
# This is the south-coast Staten Island belt facing Raritan Bay.
# The south edge of the bbox (~40.462) is at/below sea level; terrain rises inland.
#
# Each polygon starts at the SW corner of the flooded strip, traces an irregular
# inland flood boundary east-to-west, then closes along the southern ocean edge.

def make_flood_poly(north_center, north_amp1, north_amp2=0.0, north_amp3=0.0,
                    ph2=1.0, ph3=0.5, n=40,
                    lon_min=-74.024, lon_max=-73.985, lat_south=40.459):
    """
    Build a coastal flood fill polygon.
    north_center / north_amp* define the irregular inland flood limit (northern edge).
    lat_south is the ocean edge (below the pilot area bbox).
    """
    # Northern boundary — east to west
    north = []
    for i in range(n + 1):
        lon = lon_max - (lon_max - lon_min) * i / n
        lat = irregular_lat(i, n, north_center, north_amp1, north_amp2, north_amp3, ph2, ph3)
        north.append([lon, lat])

    # Southern boundary — west to east (ocean edge, nearly flat with tiny variation)
    south = []
    for i in range(n + 1):
        lon = lon_min + (lon_max - lon_min) * i / n
        lat = lat_south + 0.0003 * math.sin(i * 1.3)
        south.append([round(lon, 6), round(lat, 6)])

    ring = south + north + [south[0]]
    return {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]}, "properties": {}}


def fc(features):
    return {"type": "FeatureCollection", "features": features}


# ── Scenario 1: Heavy Rain (1-in/hr) ────────────────────────────────────────
# Narrow coastal strip: beach, tidal marsh, drainage channels
# Northern limit ~40.466–40.469 (200–700 m inland)
heavy = make_flood_poly(
    north_center=40.4665,
    north_amp1=0.0018,
    north_amp2=0.0008,
    north_amp3=0.0004,
    ph2=0.8, ph3=1.4,
)

# Add a secondary tongue following Great Kills Harbor creek channel
harbor_tongue = {
    "type": "Feature",
    "geometry": {
        "type": "Polygon",
        "coordinates": [[
            [-74.003, 40.463], [-74.006, 40.463], [-74.007, 40.465],
            [-74.006, 40.468], [-74.005, 40.470], [-74.004, 40.471],
            [-74.003, 40.470], [-74.002, 40.468], [-74.001, 40.466],
            [-74.000, 40.464], [-74.001, 40.463], [-74.003, 40.463],
        ]]
    },
    "properties": {},
}

with open(f"{OUT}/flood_heavy_rain.geojson", "w") as f:
    json.dump(fc([heavy, harbor_tongue]), f, separators=(",", ":"))
print("Wrote flood_heavy_rain.geojson (coastal strip + harbor inlet)")


# ── Scenario 2: Cloudburst (3-in/hr) ────────────────────────────────────────
# Wider coastal zone + street-level ponding along drainage corridors
# Northern limit ~40.470–40.474 (500–1100 m inland)
cloudburst = make_flood_poly(
    north_center=40.4715,
    north_amp1=0.0022,
    north_amp2=0.0010,
    north_amp3=0.0005,
    ph2=1.5, ph3=0.3,
)

# Drainage corridor extending further inland toward higher ground
drain_tongue = {
    "type": "Feature",
    "geometry": {
        "type": "Polygon",
        "coordinates": [[
            [-74.010, 40.464], [-74.014, 40.464], [-74.015, 40.467],
            [-74.014, 40.471], [-74.013, 40.474], [-74.011, 40.476],
            [-74.009, 40.475], [-74.008, 40.472], [-74.007, 40.469],
            [-74.008, 40.466], [-74.010, 40.464],
        ]]
    },
    "properties": {},
}

with open(f"{OUT}/flood_cloudburst.geojson", "w") as f:
    json.dump(fc([cloudburst, drain_tongue]), f, separators=(",", ":"))
print("Wrote flood_cloudburst.geojson (coastal zone + drainage corridor)")


# ── Scenario 3: Extreme Flood (storm surge) ─────────────────────────────────
# Coastal inundation + major infrastructure impact
# Northern limit ~40.477–40.482 (1.2–2.1 km inland)
extreme = make_flood_poly(
    north_center=40.4785,
    north_amp1=0.0020,
    north_amp2=0.0009,
    north_amp3=0.0005,
    ph2=2.0, ph3=1.1,
)

with open(f"{OUT}/flood_extreme.geojson", "w") as f:
    json.dump(fc([extreme]), f, separators=(",", ":"))
print("Wrote flood_extreme.geojson (major coastal inundation)")


# ── Fix shore_1m / shore_2m: chain fragments into long polylines ─────────────
#
# gdal_contour emits contour lines as many short pixel-scale segments.
# We rebuild them by chaining segments whose endpoints are within 5 m of each
# other, producing a small set of long connected lines that look like
# a proper "flood boundary" rather than scattered coastline noise.

transformer = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)

def read_shp_polylines(shp_bytes):
    records = []
    offset = 100
    while offset < len(shp_bytes):
        if offset + 8 > len(shp_bytes):
            break
        content_len = struct.unpack_from(">i", shp_bytes, offset + 4)[0]
        content_start = offset + 8
        content_bytes = content_len * 2
        if content_start + content_bytes > len(shp_bytes):
            break
        stype = struct.unpack_from("<i", shp_bytes, content_start)[0]
        if stype == 3:
            num_parts = struct.unpack_from("<i", shp_bytes, content_start + 36)[0]
            num_points = struct.unpack_from("<i", shp_bytes, content_start + 40)[0]
            parts = [struct.unpack_from("<i", shp_bytes, content_start + 44 + i * 4)[0] for i in range(num_parts)]
            pts_start = content_start + 44 + num_parts * 4
            points = []
            for i in range(num_points):
                x = struct.unpack_from("<d", shp_bytes, pts_start + i * 16)[0]
                y = struct.unpack_from("<d", shp_bytes, pts_start + i * 16 + 8)[0]
                points.append((x, y))
            for pi in range(num_parts):
                s = parts[pi]
                e = parts[pi + 1] if pi + 1 < num_parts else num_points
                ring = points[s:e]
                if len(ring) >= 2:
                    records.append(ring)
        offset = content_start + content_bytes
    return records


def chain_segments(records_3857, snap_tolerance_m=5.0):
    """
    Greedily chain polyline segments whose endpoints are within snap_tolerance_m
    of each other. Returns a list of chained coordinate lists (still in EPSG:3857).
    """
    # Build adjacency by snapping endpoints
    segs = [list(r) for r in records_3857]  # mutable copies

    def pt_close(a, b):
        return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2) <= snap_tolerance_m

    used = [False] * len(segs)
    chains = []

    for start in range(len(segs)):
        if used[start]:
            continue
        chain = list(segs[start])
        used[start] = True

        # Extend the chain forward from its end point
        extended = True
        while extended:
            extended = False
            tail = chain[-1]
            for j in range(len(segs)):
                if used[j]:
                    continue
                if pt_close(segs[j][0], tail):
                    chain.extend(segs[j][1:])
                    used[j] = True
                    extended = True
                    break
                elif pt_close(segs[j][-1], tail):
                    chain.extend(reversed(segs[j][:-1]))
                    used[j] = True
                    extended = True
                    break

        chains.append(chain)

    return chains


def to_wgs84(pts_3857):
    xs = [p[0] for p in pts_3857]
    ys = [p[1] for p in pts_3857]
    lons, lats = transformer.transform(xs, ys)
    return [[round(ln, 6), round(lt, 6)] for ln, lt in zip(lons, lats)]


def build_shore_fc(records_3857, depth_m):
    print(f"  Chaining {len(records_3857)} segments...", end=" ", flush=True)
    chains = chain_segments(records_3857, snap_tolerance_m=5.0)
    # Filter out very short chains (< 3 points = pixel noise)
    chains = [c for c in chains if len(c) >= 3]
    print(f"done: {len(chains)} chains")

    features = []
    for i, chain in enumerate(chains):
        coords = to_wgs84(chain)
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "id": i,
                "depth_m": float(depth_m),
                "length_pts": len(coords),
            },
        })
    return {"type": "FeatureCollection", "features": features}


with zipfile.ZipFile("flood_final_portfolio.zip") as z:
    shp1 = z.read("shore_1m.shp")
    shp2 = z.read("shore_2m.shp")

print("\nBuilding shore_1m chains:")
rec1 = read_shp_polylines(shp1)
fc1 = build_shore_fc(rec1, 1)
with open(f"{OUT}/shore_1m.geojson", "w") as f:
    json.dump(fc1, f, separators=(",", ":"))
print(f"  -> Wrote shore_1m.geojson ({len(fc1['features'])} connected lines)")

print("Building shore_2m chains:")
rec2 = read_shp_polylines(shp2)
fc2 = build_shore_fc(rec2, 2)
with open(f"{OUT}/shore_2m.geojson", "w") as f:
    json.dump(fc2, f, separators=(",", ":"))
print(f"  -> Wrote shore_2m.geojson ({len(fc2['features'])} connected lines)")
