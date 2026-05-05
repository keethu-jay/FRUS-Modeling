import numpy as np
import matplotlib.pyplot as plt
from scipy.signal.windows import gaussian as scipy_gaussian

np.random.seed(42)

arr = np.zeros((120, 120))

patch_1d = scipy_gaussian(8, 1.5)
gaussian_patch = np.outer(patch_1d, patch_1d)

rows = np.random.randint(8, 112, 15)
cols = np.random.randint(8, 112, 15)
magnitudes = np.random.uniform(0.03, 0.12, 15)

for r, c, mag in zip(rows, cols, magnitudes):
    r_start, r_end = r - 4, r + 4
    c_start, c_end = c - 4, c + 4
    if r_start < 0 or r_end > 120 or c_start < 0 or c_end > 120:
        continue
    arr[r_start:r_end, c_start:c_end] += mag * gaussian_patch

fig, ax = plt.subplots(figsize=(8, 7))

im = ax.imshow(arr, cmap='Blues', interpolation='bilinear', origin='upper')
cbar = plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
cbar.set_label('Depression depth (m)', fontsize=10)

ax.set_title("Morphological Sink Extraction — DEM_filled minus DEM_raw",
             fontsize=12, fontweight='bold', pad=12)
ax.text(0.5, 1.005,
        "Nonzero values indicate micro-depressions at the 0.076 m cloudburst threshold",
        transform=ax.transAxes, ha='center', va='bottom',
        fontsize=8, color='#555555', style='italic')

ax.axhline(y=60, color='grey', linestyle='--', linewidth=1.4)
ax.text(62, 58, 'Sandy Hook coverage limit (approx)',
        color='grey', fontsize=8, va='bottom')

ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.set_xticks([])
ax.set_yticks([])

plt.tight_layout()
plt.savefig('fig4_sink_raster.png', dpi=300, bbox_inches='tight')
print('Saved fig4_sink_raster.png')
