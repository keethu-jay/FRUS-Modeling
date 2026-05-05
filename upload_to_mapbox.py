"""
Upload a GeoJSON file to Mapbox as a raster/vector tileset via the Uploads API.
Steps:
  1. Request temporary S3 credentials from Mapbox
  2. Upload the file directly to Mapbox's S3 bucket
  3. Create the tileset upload (Mapbox processes it server-side)
  4. Poll until processing is complete, then print the tileset ID
"""

import os, sys, time, json
from pathlib import Path
import requests
import boto3
from botocore.config import Config

SECRET_TOKEN = os.environ.get("MAPBOX_SECRET_TOKEN", "")  # export MAPBOX_SECRET_TOKEN=sk....
USERNAME     = "keethu-j"

FILE_PATH    = Path(__file__).parent / "contours_0.5m.geojson"
TILESET_NAME = "nyc_contours_0_5m"           # becomes keethu-j.nyc_contours_0_5m

# ── Step 1: get temporary S3 credentials ─────────────────────────────────────

print("[1/4] Getting upload credentials from Mapbox...")
creds_url = f"https://api.mapbox.com/uploads/v1/{USERNAME}/credentials?access_token={SECRET_TOKEN}"
r = requests.post(creds_url)
r.raise_for_status()
creds = r.json()
print(f"      S3 bucket : {creds['bucket']}")
print(f"      S3 key    : {creds['key']}")

# ── Step 2: upload file to Mapbox's S3 staging bucket ───────────────────────

print(f"\n[2/4] Uploading {FILE_PATH.name} ({FILE_PATH.stat().st_size / 1e6:.1f} MB) to S3...")

s3 = boto3.client(
    "s3",
    aws_access_key_id     = creds["accessKeyId"],
    aws_secret_access_key = creds["secretAccessKey"],
    aws_session_token     = creds["sessionToken"],
    region_name           = "us-east-1",
    config=Config(signature_version="s3v4"),
)

with open(FILE_PATH, "rb") as f:
    s3.upload_fileobj(
        f,
        creds["bucket"],
        creds["key"],
        ExtraArgs={"ContentType": "application/geo+json"},
        Callback=lambda n: print(f"      {n / FILE_PATH.stat().st_size * 100:.0f}% uploaded...", end="\r"),
    )
print("\n      Upload complete.")

# ── Step 3: create the Mapbox tileset upload ─────────────────────────────────

print(f"\n[3/4] Creating tileset upload (tileset id: {USERNAME}.{TILESET_NAME})...")
upload_url = f"https://api.mapbox.com/uploads/v1/{USERNAME}?access_token={SECRET_TOKEN}"
payload = {
    "url": f"http://{creds['bucket']}.s3.amazonaws.com/{creds['key']}",
    "tileset": f"{USERNAME}.{TILESET_NAME}",
    "name": "NYC 0.5m contours (Inwood/N.Manhattan)",
}
r = requests.post(upload_url, json=payload)
r.raise_for_status()
upload = r.json()
upload_id = upload["id"]
print(f"      Upload ID : {upload_id}")

# ── Step 4: poll until complete ───────────────────────────────────────────────

print(f"\n[4/4] Waiting for Mapbox to process the tileset...")
status_url = f"https://api.mapbox.com/uploads/v1/{USERNAME}/{upload_id}?access_token={SECRET_TOKEN}"

for attempt in range(60):
    time.sleep(10)
    r = requests.get(status_url)
    r.raise_for_status()
    status = r.json()
    pct  = status.get("progress", 0) * 100
    state = status.get("complete", False)
    error = status.get("error")
    print(f"      [{attempt+1:02d}] progress={pct:.0f}%  complete={state}  error={error}")
    if error:
        print(f"\n[!] Upload failed: {error}")
        sys.exit(1)
    if state:
        break
else:
    print("\n[!] Timed out waiting for processing — check Mapbox Studio manually.")
    sys.exit(1)

tileset_id = f"{USERNAME}.{TILESET_NAME}"
print(f"\nDone! Tileset ID: {tileset_id}")
print(f"Add this to MapContainer.tsx:")
print(f'  const SOURCE_CONTOURS = "eco-contours"')
print(f'  const LAYER_CONTOURS  = "eco-contour-lines"')
print(f'  url: "mapbox://{tileset_id}"')
print(f'  source-layer: check Mapbox Studio for the layer name (usually "{TILESET_NAME}")')
