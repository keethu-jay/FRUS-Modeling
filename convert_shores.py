"""
Convert shore_1m.shp and shore_2m.shp from EPSG:3857 Polylines to WGS84 GeoJSON.
Adds a 'sink_rank' property (0-1) based on inverse polyline length:
shorter polylines = tighter, deeper depressions = higher sink rank = darker blue.
"""

import zipfile, struct, json, math
from pyproj import Transformer

transformer = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)


def read_shp_polylines(shp_bytes):
    """Return a list of polyline parts as lists of (x, y) in source CRS."""
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
        if stype == 3:  # Polyline
            num_parts = struct.unpack_from("<i", shp_bytes, content_start + 36)[0]
            num_points = struct.unpack_from("<i", shp_bytes, content_start + 40)[0]
            parts = [
                struct.unpack_from("<i", shp_bytes, content_start + 44 + i * 4)[0]
                for i in range(num_parts)
            ]
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


def polyline_length(pts):
    """Approximate planar length of a polyline in source-CRS units (meters for 3857)."""
    total = 0.0
    for i in range(1, len(pts)):
        dx = pts[i][0] - pts[i - 1][0]
        dy = pts[i][1] - pts[i - 1][1]
        total += math.sqrt(dx * dx + dy * dy)
    return total


def to_wgs84(pts):
    """Convert list of (x3857, y3857) to [[lon, lat], ...] rounded to 6 dp."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    lons, lats = transformer.transform(xs, ys)
    return [[round(ln, 6), round(lt, 6)] for ln, lt in zip(lons, lats)]


def normalise_sink_rank(lengths):
    """
    Map lengths to a 0-1 sink rank where 1 = shortest (deepest/tightest sink).
    Clamped so very long lines always get 0.
    """
    lo, hi = min(lengths), max(lengths)
    span = hi - lo or 1.0
    return [round(1.0 - (l - lo) / span, 4) for l in lengths]


def build_geojson(records, sink_ranks, layer_label):
    features = []
    for i, (ring, rank) in enumerate(zip(records, sink_ranks)):
        coords = to_wgs84(ring)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coords},
                "properties": {
                    "id": i,
                    "layer": layer_label,
                    # 0 = longest boundary line, 1 = tightest enclosed depression
                    "sink_rank": rank,
                    # Threshold depth in meters this contour represents
                    "depth_m": float(layer_label.replace("m", "")),
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


with zipfile.ZipFile("flood_final_portfolio.zip") as z:
    shp1 = z.read("shore_1m.shp")
    shp2 = z.read("shore_2m.shp")

records1 = read_shp_polylines(shp1)
records2 = read_shp_polylines(shp2)

lengths1 = [polyline_length(r) for r in records1]
lengths2 = [polyline_length(r) for r in records2]

print(f"shore_1m: {len(records1)} parts, len range {min(lengths1):.1f}–{max(lengths1):.1f} m")
print(f"shore_2m: {len(records2)} parts, len range {min(lengths2):.1f}–{max(lengths2):.1f} m")

ranks1 = normalise_sink_rank(lengths1)
ranks2 = normalise_sink_rank(lengths2)

# How many are "high risk" (sink_rank > 0.8)?
hr1 = sum(1 for r in ranks1 if r > 0.8)
hr2 = sum(1 for r in ranks2 if r > 0.8)
print(f"High-risk sinks (rank>0.8): shore_1m={hr1}, shore_2m={hr2}")

out_dir = "frontend/public/data/vectors"

geojson1 = build_geojson(records1, ranks1, "1m")
with open(f"{out_dir}/shore_1m.geojson", "w") as f:
    json.dump(geojson1, f, separators=(",", ":"))
print(f"Wrote {out_dir}/shore_1m.geojson ({len(records1)} features)")

geojson2 = build_geojson(records2, ranks2, "2m")
with open(f"{out_dir}/shore_2m.geojson", "w") as f:
    json.dump(geojson2, f, separators=(",", ":"))
print(f"Wrote {out_dir}/shore_2m.geojson ({len(records2)} features)")
