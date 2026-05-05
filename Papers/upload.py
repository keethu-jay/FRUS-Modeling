"""Upload a GeoTIFF to Mapbox via the Python SDK (optional helper).

Do not commit tokens. Set MAPBOX_ACCESS_TOKEN (pk.* public upload token with uploads scope if required).

Example:
  set MAPBOX_ACCESS_TOKEN=pk....   # Windows
  python Papers/upload.py
"""
from __future__ import annotations

import os
import sys

from mapbox import Uploader

token = os.environ.get('MAPBOX_ACCESS_TOKEN', '').strip()
if not token:
    sys.exit('Missing MAPBOX_ACCESS_TOKEN — export your Mapbox public token before running.')

service = Uploader(access_token=token)

with open('eco_sentry_full_mask.tif', 'rb') as src:
    response = service.upload(src, 'nyc_permeable_mask_v1')

if response.status_code == 201:
    print('Success! Check Mapbox Studio in a few minutes.')
else:
    print(f'Failed: {response.status_code}')
    print(response.text)
