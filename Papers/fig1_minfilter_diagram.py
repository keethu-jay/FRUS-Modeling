import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))

# ── Left: 1m Average Filter ─────────────────────────────────────────────────
ax1.set_title("1 m Average Filter", fontsize=12, fontweight='bold', pad=10)

points_x = [0.1, 0.35, 0.65, 0.9]
points_y = [0.15, 0.02, 0.15, 0.02]
ax1.scatter(points_x, points_y, color='#333333', s=80, zorder=5)

ax1.axhline(y=0.085, xmin=0, xmax=1, color='red', linewidth=2, linestyle='--', zorder=4)
ax1.text(0.5, 0.095, 'avg output: 0.085 m (non-physical)',
         color='red', ha='center', fontsize=8.5, style='italic')

rect = mpatches.FancyArrowPatch
ax1.fill_between([0, 1], 0, 0.085, color='lightgrey', alpha=0.20, zorder=2)

ax1.annotate('curb erased', xy=(0.5, 0.085), xytext=(0.5, 0.19),
             ha='center', fontsize=8.5, color='#444444',
             arrowprops=dict(arrowstyle='->', color='#444444', lw=1.4))

ax1.set_xlabel('horizontal position (m)', fontsize=9)
ax1.set_ylabel('elevation (m)', fontsize=9)
ax1.set_xlim(0, 1)
ax1.set_ylim(-0.02, 0.25)
ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)
ax1.grid(False)

# ── Right: 0.1m Min-Filter ──────────────────────────────────────────────────
ax2.set_title("0.1 m Min-Filter", fontsize=12, fontweight='bold', pad=10)

ax2.scatter([0.05, 0.15], [0.02, 0.15], color='#333333', s=80, zorder=5)

ax2.plot([0.0, 0.1], [0.02, 0.02], color='steelblue', linewidth=2.5, solid_capstyle='round')
ax2.plot([0.1, 0.2], [0.15, 0.15], color='steelblue', linewidth=2.5, solid_capstyle='round')

ax2.annotate('gutter floor: 0.02 m', xy=(0.05, 0.02), xytext=(0.05, 0.09),
             ha='center', fontsize=8.5, color='steelblue',
             arrowprops=dict(arrowstyle='->', color='steelblue', lw=1.4))
ax2.annotate('curb face: 0.15 m', xy=(0.15, 0.15), xytext=(0.15, 0.21),
             ha='center', fontsize=8.5, color='steelblue',
             arrowprops=dict(arrowstyle='->', color='steelblue', lw=1.4))

ax2.set_xlabel('horizontal position (m)', fontsize=9)
ax2.set_ylabel('elevation (m)', fontsize=9)
ax2.set_xlim(0, 1)
ax2.set_ylim(-0.02, 0.25)
ax2.spines['top'].set_visible(False)
ax2.spines['right'].set_visible(False)
ax2.grid(False)

plt.tight_layout()
plt.savefig('fig1_minfilter_diagram.png', dpi=300, bbox_inches='tight')
print('Saved fig1_minfilter_diagram.png')
