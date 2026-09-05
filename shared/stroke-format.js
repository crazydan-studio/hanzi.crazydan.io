// ============ 笔画轨迹格式: 常量与编解码（web/server/build 单一来源） ============
// 轨迹格式由本模块权威定义，其余 JS 侧（浏览器与 Node）统一引用，禁止另行手抄数值:
//   - src/components/Constants.js（web 端重导出格式常量）
//   - server/services/Trajectory.js（服务端重导出常量并实现压缩/解压）
//   - Kotlin 端（App）无法引用 JS，其 StrokeFormat.kt/Pinyin.kt 为跨语言镜像，改动须同步
// 轨迹属性采用单字符: v 版本 / b 笔刷面积比 / r 光栅实测盒 / p 坐标点;
// x/y 以背景汉字墨迹盒为坐标系分别归一化 ×1000（x 按盒宽、y 按盒高），
// 压力 ×100、时间戳 ×10、笔刷面积比 ×100000 存整数
export const TRAJECTORY_VERSION = 2
// 坐标归一化系数（盒相对坐标 ×1000 存整数）
export const COORD_SCALE = 1000
// 压力归一化系数（0-1 ×100 存整数）
export const PRESSURE_SCALE = 100
// 时间戳归一化系数（毫秒 ×10 存整数）
export const TIMESTAMP_SCALE = 10
// 笔刷归一化: 存储值 = (笔宽² / 背景字墨迹盒面积) × BRUSH_SCALE
// 还原笔宽 = sqrt(存储值 / BRUSH_SCALE × 当前盒面积)
// 100000 精度: 典型盒下笔宽量化误差约 0.03px，远低于坐标 0.5px 粒度
export const BRUSH_SCALE = 100000
// 坐标归一化取值边界（盒相对坐标; 允许超出盒外 2 倍宽/高范围）
export const COORD_MIN = -2000
export const COORD_MAX = 3000
// 笔刷面积比取值边界（归一化比最大 1，上限 100 为兼容冗余约束，与 StrokeSchema 一致）
export const BRUSH_MIN = 0
export const BRUSH_MAX = 100 * BRUSH_SCALE

// 增量编码: 首点绝对，后续点存储与上一点的差值（时间戳单调、坐标差值小，利于压缩）
export function deltaEncode(points) {
  const out = []
  let prev = null
  for (const p of points) {
    if (!prev) {
      out.push([p[0], p[1], p[2], p[3]])
    } else {
      out.push([p[0] - prev[0], p[1] - prev[1], p[2] - prev[2], p[3] - prev[3]])
    }
    prev = p
  }
  return out
}

// 增量解码: 还原绝对坐标点
export function deltaDecode(points) {
  const out = []
  let prev = null
  for (const p of points) {
    const point = prev
      ? [p[0] + prev[0], p[1] + prev[1], p[2] + prev[2], p[3] + prev[3]]
      : [p[0], p[1], p[2], p[3]]
    out.push(point)
    prev = point
  }
  return out
}

// 点阵扁平化: [[x,y,pr,t],...] → [x,y,pr,t, ...]（每 4 个一组）
export function flattenPoints(points) {
  return points.flat()
}

// 点阵还原: [x,y,pr,t, ...] → [[x,y,pr,t],...]（每 4 个一组）
export function unflattenPoints(flat) {
  const out = []
  for (let i = 0; i + 3 < flat.length; i += 4) {
    out.push([flat[i], flat[i + 1], flat[i + 2], flat[i + 3]])
  }
  return out
}
