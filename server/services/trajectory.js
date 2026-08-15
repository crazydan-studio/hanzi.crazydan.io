// 笔画轨迹压缩（最大限度降低 trajectory_data 存储占用）
// 存储: 轨迹经 增量编码 + zlib deflate 压缩为 BLOB；序列化输出时透明解压，
//       API 与导出仍为绝对坐标 JSON 对象
// 格式版本:
//   v5.0: 绝对坐标点 [x, y, pressure×100, timestamp×10]
//   v6.0: 增量编码点（首点绝对，后续为与上一点的差值），压缩率更高
import zlib from 'node:zlib'

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
    version: trajectory.version ?? '7.0',   // 保留原版本号（迁移据此判断是否已处理）
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
