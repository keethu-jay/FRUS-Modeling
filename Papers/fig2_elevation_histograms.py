import numpy as np
import matplotlib.pyplot as plt

np.random.seed(42)

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.5))

# ── Left: 8-bit NOAA DEM ────────────────────────────────────────────────────
ax1.set_title("8-bit NOAA DEM (1 m product)", fontsize=12, fontweight='bold', pad=10)

x_bins = [1, 2, 3, 4, 5, 6, 7, 8]
heights = [180, 140, 110, 90, 70, 55, 40, 30]
ax1.bar(x_bins, heights, width=0.7, color='#4472C4', alpha=0.80, zorder=3)

ax1.set_xlim(0, 9)
ax1.set_xlabel('Elevation (m)', fontsize=9)
ax1.set_ylabel('Pixel count (relative)', fontsize=9)

# Annotate the gap below x=1
mid_h = max(heights) * 0.5
ax1.annotate('No values below 1.0 m', xy=(0.6, mid_h), xytext=(-0.1, mid_h),
             ha='right', va='center', fontsize=8, color='#555555',
             arrowprops=dict(arrowstyle='->', color='#555555', lw=1.3))

# Threshold line at 0.076m (in the gap)
ax1.axvline(x=0.076, color='red', linestyle='--', linewidth=1.6, zorder=4)
ax1.text(0.076 + 0.05, max(heights) * 0.75, '3-in threshold',
         color='red', fontsize=7.5, rotation=90, va='center')

ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)
ax1.grid(False)

# ── Right: Float32 LAZ-derived ──────────────────────────────────────────────
ax2.set_title("Float32 LAZ-derived (0.1 m product)", fontsize=12, fontweight='bold', pad=10)

n_exp = int(3000 * 0.60)
n_uni = 3000 - n_exp
vals_exp = np.random.exponential(0.8, n_exp)
vals_exp = np.clip(vals_exp, 0.02, 8)
vals_uni = np.random.uniform(0.5, 5, n_uni)
vals = np.concatenate([vals_exp, vals_uni])

ax2.hist(vals, bins=50, range=(0, 9), color='#70AD47', alpha=0.80, zorder=3)
ax2.set_xlim(0, 9)
ax2.set_xlabel('Elevation (m)', fontsize=9)
ax2.set_ylabel('Pixel count', fontsize=9)

ax2.axvline(x=0.076, color='red', linestyle='--', linewidth=1.6, zorder=4)
n_vals, bin_edges = np.histogram(vals, bins=50, range=(0, 9))
mid_h2 = n_vals.max() * 0.60
ax2.text(0.076 + 0.05, mid_h2, '3-in threshold',
         color='red', fontsize=7.5, rotation=90, va='center')

ax2.spines['top'].set_visible(False)
ax2.spines['right'].set_visible(False)
ax2.grid(False)

plt.tight_layout()
plt.savefig('fig2_elevation_histograms.png', dpi=300, bbox_inches='tight')
print('Saved fig2_elevation_histograms.png')
