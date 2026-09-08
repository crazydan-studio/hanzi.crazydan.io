import { BASE_WIDTH, BRUSH_SCALE } from './Constants.js'

// ============ 笔刷归一化（录制与还原） ============
// 录制: 笔刷面积/背景字墨迹盒面积 的比值 ×BRUSH_SCALE 存整数;
// 还原: 面积比 → 当前盒上的基准笔宽（内部坐标系像素，供 perfect-freehand size 使用）
// 注: 笔画轮廓几何渲染（压力/平滑/笔锋）统一由 StrokeRenderer.js 经
// perfect-freehand 完成; App（Kotlin）端为独立镜像实现，改动需同步

// 笔刷归一化（录制）: 笔刷面积/背景字墨迹盒面积 的比值 ×BRUSH_SCALE 存整数
export function normalizeBrush(width, boxW, boxH) {
  const area = boxW * boxH
  if (!(area > 0)) return 0
  return Math.round(Math.max(0, Math.min(1, width * width / area)) * BRUSH_SCALE)
}

// 笔刷还原（播放）: 面积比 → 当前盒上的基准笔宽（内部坐标系像素）
// 面积比不变 → 笔宽与背景字相对大小一致，与盒的绝对尺寸无关
export function brushBaseWidth(brush, boxW, boxH) {
  const area = boxW * boxH
  if (!(area > 0)) return BASE_WIDTH
  const ratio = (brush ?? 0) / BRUSH_SCALE
  return ratio > 0 ? Math.sqrt(ratio * area) : BASE_WIDTH
}
