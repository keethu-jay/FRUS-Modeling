import numpy as np
import matplotlib.pyplot as plt
from scipy.ndimage import gaussian_filter

np.random.seed(7)

base = np.random.rand(60, 60) * 0.5 + 1.0

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 5))

# ── Left: 1m Average DEM ────────────────────────────────────────────────────
arr_avg = gaussian_filter(base.copy(), sigma=4)
im1 = ax1.imshow(arr_avg, cmap='terrain', vmin=0.5, vmax=3.0, origin='lower')
ax1.set_title("1 m Average DEM", fontsize=12, fontweight='bold', pad=10)
plt.colorbar(im1, ax=ax1, label='Elevation (m)', fraction=0.046, pad=0.04)
ax1.set_xticks([])
ax1.set_yticks([])
ax1.set_xlabel(u'← West     East →', fontsize=9)
ax1.set_ylabel(u'← South     North →', fontsize=9)
ax1.text(30, 30, 'curb features not visible',
         ha='center', va='center', fontsize=9, color='white', fontweight='bold',
         bbox=dict(boxstyle='round,pad=0.3', facecolor='#222222', alpha=0.75))

# ── Right: 0.1m Min-Filter Float32 ──────────────────────────────────────────
arr_hires = gaussian_filter(base.copy(), sigma=1)
arr_hires[26:30, :] += 0.14   # curb ridge
arr_hires[24:26, :] -= 0.03   # gutter channel

im2 = ax2.imshow(arr_hires, cmap='terrain', vmin=0.5, vmax=3.0, origin='lower')
ax2.set_title("0.1 m Min-Filter Float32", fontsize=12, fontweight='bold', pad=10)
plt.colorbar(im2, ax=ax2, label='Elevation (m)', fraction=0.046, pad=0.04)
ax2.set_xticks([])
ax2.set_yticks([])
ax2.set_xlabel(u'← West     East →', fontsize=9)
ax2.set_ylabel(u'← South     North →', fontsize=9)

# Curb annotation
ax2.annotate('curb (~14 cm)', xy=(50, 28), xytext=(44, 42),
             fontsize=8.5, color='white', fontweight='bold',
             arrowprops=dict(arrowstyle='->', color='white', lw=1.4))
# Gutter annotation
ax2.annotate('gutter', xy=(10, 25), xytext=(3, 14),
             fontsize=8.5, color='white', fontweight='bold',
             arrowprops=dict(arrowstyle='->', color='white', lw=1.4))

plt.tight_layout()
plt.savefig('fig3_raster_comparison.png', dpi=300, bbox_inches='tight')
print('Saved fig3_raster_comparison.png')
