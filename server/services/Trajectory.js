// 笔画轨迹压缩（最大限度降低 trajectory_data 存储占用）
// 存储: 一汉字一行，整字笔画聚合为单 BLOB；轨迹经 增量编码 + 点阵扁平化 + zlib deflate 压缩。
//       API 与导出时透明解压为绝对坐标 JSON 对象
// 单字单行结构（与静态 strokes 分片一致）:
//   v: 格式版本（数字，从 1 开始）
//   r: 背景字光栅实测盒 [w, h]（同字所有笔画共享; v2 起记录）——
//      盒的位置按约定为画布中心对齐，笔画可脱离字体/背景字按盒还原与按比例缩放
//      （如列表缩略图、无字体环境的回放）
//   s: 笔画数组（数组下标 + 1 = stroke_order）; 每项 [stroke_type, [brush, flatPoints]]
//   flatPoints: 轨迹点 [x, y, pressure, timestamp] 增量编码后展平的一维数组（每 4 个一组，
//               去掉每点的 [ ] 开销）
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

// 压缩整字笔画为单 BLOB（单字单行）:
// strokes: [{ o, t, d: { b, p } }]，p 为绝对坐标点; r 为光栅实测盒 { w, h } 或 null
// 输出结构 s 中笔画序号由数组下标推出（o 不存储），保存前须按 stroke_order 排序
export function compressCharTrajectory(r, strokes) {
  const encoded = {
    v: TRAJECTORY_VERSION,
    ...(r ? { r: [r.w, r.h] } : {}),
    s: strokes.map(st => [
      st.t,
      [st.d.b ?? 0, flattenPoints(deltaEncode(st.d.p ?? []))]
    ])
  }
  return zlib.deflateSync(JSON.stringify(encoded), { level: 9 })
}

// 解压单字单行 BLOB → 绝对坐标笔画数组
// 返回 { v, r: [w,h]|null, strokes: [{ o, t, d: { b, p } }] }
export function decompressCharTrajectory(data) {
  if (!Buffer.isBuffer(data) && !(data instanceof Uint8Array)) {
    throw new Error('轨迹数据须为压缩 BLOB')
  }
  const parsed = JSON.parse(zlib.inflateSync(Buffer.from(data)).toString('utf8'))
  const r = parsed.r ? { w: parsed.r[0], h: parsed.r[1] } : null
  const strokes = (parsed.s || []).map((st, i) => ({
    o: i + 1,
    t: st[0],
    d: { b: st[1][0], p: deltaDecode(unflattenPoints(st[1][1] ?? [])) }
  }))
  return { v: parsed.v, r, strokes }
}

// 与前端布局约定的墨迹盒测量参数（见 src/components/StrokeBackground.js ziBoxLayout）:
//   画布内部坐标系 500×500; 统一字号 = 短边 92%; 盒不超出画布 92% 区域（必要时按比例缩小字号）
// （仅用于说明盒的测量约定; 盒由前端光栅实测，服务端不测量）
export const INKBOX_CANVAS = 500
