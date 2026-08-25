// 笔画轨迹压缩（最大限度降低 trajectory_data 存储占用）
// 存储: 轨迹经 增量编码 + zlib deflate 压缩为 BLOB；序列化输出时透明解压，
//       API 与导出仍为绝对坐标 JSON 对象
// 轨迹属性采用单字符（与静态 strokes.json 的紧凑结构一致）:
//   v: 格式版本（数字，从 1 开始）
//   b: 笔刷面积 / 背景字面积 的比值 ×BRUSH_SCALE（整轨迹共享一个笔宽）
//   r: 绘制时背景字光栅实测盒 { w, h }（内部坐标系像素，整数; v2 起记录）——
//      盒的位置按约定为画布中心对齐，笔画可脱离字体/背景字按盒还原与按比例缩放
//      （如列表缩略图、无字体环境的回放）
//   p: 轨迹点 [x, y, pressure, timestamp]（绝对坐标）
// x/y 以【背景汉字墨迹盒】为坐标系分别归一化 ×1000（x 按盒宽、y 按盒高），
// 范围放宽至 [-2000, 3000]（允许写在盒外）
import zlib from 'node:zlib'

export const TRAJECTORY_VERSION = 2
export const COORD_SCALE = 1000
export const PRESSURE_SCALE = 100
export const TIMESTAMP_SCALE = 10
// 笔刷归一化: 存储值 = (笔宽² / 背景字墨迹盒面积) × BRUSH_SCALE
// 还原笔宽 = sqrt(存储值 / BRUSH_SCALE × 当前盒面积)
// 100000 精度: 典型盒下笔宽量化误差约 0.03px，远低于坐标 0.5px 粒度
export const BRUSH_SCALE = 100000
// 坐标归一化取值边界（盒相对坐标; 允许超出盒外 2 倍宽/高范围）
export const COORD_MIN = -2000
export const COORD_MAX = 3000

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

// 与前端布局约定的墨迹盒测量参数（见 src/components/StrokeBackground.js ziBoxLayout）:
//   画布内部坐标系 500×500; 统一字号 = 短边 92%; 盒不超出画布 92% 区域（必要时按比例缩小字号）
// （仅用于说明盒的测量约定; 盒由前端光栅实测，服务端不测量）
export const INKBOX_CANVAS = 500

// 读取兼容旧字段名（version/brush/box/points）: 归一化为单字符
function readField(traj, short, long) {
  return traj[short] ?? traj[long]
}

export function compressTrajectory(trajectory) {
  const encoded = {
    v: readField(trajectory, 'v', 'version'),
    b: readField(trajectory, 'b', 'brush'),
    p: deltaEncode(trajectory.p ?? trajectory.points)
  }
  const r = readField(trajectory, 'r', 'box')
  if (r) {
    encoded.r = r
  }
  return zlib.deflateSync(JSON.stringify(encoded))
}

export function decompressTrajectory(data) {
  // 存储轨迹均为 compressTrajectory 产物（BLOB 压缩 + 增量编码），
  // 统一解码为单字符字段的绝对坐标点（旧完整词字段名亦兼容）
  if (!Buffer.isBuffer(data) && !(data instanceof Uint8Array)) {
    throw new Error('轨迹数据须为压缩 BLOB')
  }
  const parsed = JSON.parse(zlib.inflateSync(Buffer.from(data)).toString('utf8'))
  return {
    v: readField(parsed, 'v', 'version'),
    b: readField(parsed, 'b', 'brush'),
    r: readField(parsed, 'r', 'box'),
    p: deltaDecode(parsed.p ?? parsed.points)
  }
}
