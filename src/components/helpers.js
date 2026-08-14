import { BASE_WIDTH } from './constants.js'

// 编辑器与回放引擎共用的线宽公式
export function strokeWidthAt(point, widthCoef = 1.0) {
  const pressure = point?.pressure ?? 0.5
  return widthCoef * BASE_WIDTH * (0.6 + 0.8 * pressure)
}
