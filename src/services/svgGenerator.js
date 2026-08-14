// 将轨迹数据转为SVG path（供存储/展示）
export const svgGenerator = {
  // 轨迹 → SVG path (d属性)
  trajectoryToPath(trajectory) {
    const pts = trajectory.points
    if (!pts || pts.length === 0) return ''
    // 使用Catmull-Rom样条平滑，首尾为线段
    let d = `M${pts[0].x},${pts[0].y}`
    if (pts.length === 1) {
      // 单点: 绘制极短线段，保证可见
      d += ` L${pts[0].x + 0.01},${pts[0].y + 0.01}`
      return d
    }
    for (let i = 1; i < pts.length; i++) {
      // 两两平滑: 取相邻三点的中间控制点
      const p0 = pts[Math.max(0, i - 1)]
      const p1 = pts[i]
      const p2 = pts[Math.min(pts.length - 1, i + 1)]
      const c1 = { x: p0.x + (p1.x - p0.x) / 2, y: p0.y + (p1.y - p0.y) / 2 }
      const c2 = { x: p1.x + (p2.x - p1.x) / 2, y: p1.y + (p2.y - p1.y) / 2 }
      d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p1.x},${p1.y}`
    }
    return d
  },

  generate(trajectory, strokeWidth, color) {
    const d = this.trajectoryToPath(trajectory)
    return `<path d="${d}" fill="none" stroke="${color}"
      stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
  }
}
