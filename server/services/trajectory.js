// 笔画轨迹压缩（最大限度降低 trajectory_data 存储占用）
// 存储: 轨迹经 增量编码 + zlib deflate 压缩为 BLOB；序列化输出时透明解压，
//       API 与导出仍为绝对坐标 JSON 对象
// 格式版本（数字，从 1 开始）:
//   1: x/y 以【背景汉字墨迹盒】为坐标系分别归一化 ×1000（x 按盒宽、y 按盒高），
//      范围放宽至 [-2000, 3000]（允许写在盒外）；新增 brush 字段:
//      笔刷面积 / 背景字面积 的比值 ×BRUSH_SCALE 存储（整轨迹共享一个笔宽）
import zlib from 'node:zlib'

export const TRAJECTORY_VERSION = 1
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

export function compressTrajectory(trajectory) {
  const encoded = {
    version: trajectory.version ?? TRAJECTORY_VERSION,   // 保留原版本号（迁移据此判断是否已处理）
    ...(trajectory.brush !== undefined ? { brush: trajectory.brush } : {}),
    points: deltaEncode(trajectory.points)
  }
  return zlib.deflateSync(JSON.stringify(encoded))
}

export function decompressTrajectory(data) {
  // node:sqlite 读取 BLOB 返回 Uint8Array；Buffer/Uint8Array 均为压缩数据
  if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
    const parsed = JSON.parse(zlib.inflateSync(Buffer.from(data)).toString('utf8'))
    // 压缩存储的轨迹均由 compressTrajectory 增量编码，统一解码为绝对坐标点
    // （版本号为信息性标识，不决定是否解码）
    parsed.points = deltaDecode(parsed.points)
    return parsed
  }
  // 兼容未压缩的文本存储（迁移前的数据）
  return JSON.parse(data)
}
