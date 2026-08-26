// ============ 汉字静态数据同步（public/assets/zi） ============
// 书写页对 部首/结构/笔画 的修改与调整，同步落盘到该汉字对应的静态数据文件
import fs from 'fs'
import path from 'path'
import { deltaEncode, TRAJECTORY_VERSION } from './Trajectory.js'
import { ZI_ASSETS_DIR } from '../../paths.js'

function metaPath(ziId) {
  return path.join(ZI_ASSETS_DIR, String(ziId), 'meta.json')
}

function strokesPath(ziId) {
  return path.join(ZI_ASSETS_DIR, String(ziId), 'strokes.json')
}

// 同步部首/结构/读音/笔画数到 meta.json（仅文件存在时）:
// 单字母紧凑字段（与导出脚本一致）: p 读音 / n 笔画数 / r 部首 / s 结构编码（展示名由前端映射）
export function syncZiMeta(zi) {
  if (!zi) return false
  const file = metaPath(zi.id)
  if (!fs.existsSync(file)) return false
  try {
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (zi.pinyin !== undefined) meta.p = zi.pinyin
    if (zi.total_stroke_count !== undefined) meta.n = zi.total_stroke_count
    if (zi.radical !== undefined) meta.r = zi.radical
    if (zi.structure !== undefined) meta.s = zi.structure
    fs.writeFileSync(file, JSON.stringify(meta))
    return true
  } catch {
    return false
  }
}

// 同步笔画数据到 strokes.json（该汉字须已导出 meta.json）:
// 有笔画时创建/更新（轨迹为增量编码，含笔刷面积比）; 无笔画时删除文件
// 静态文件采用上层共享结构（避免每笔画重复存放）:
//   { v: 轨迹版本, r: { w, h }: 光栅实测盒（同字所有笔画共享）, s: [{ o, t, d }] }
//   d = { b: 笔刷面积比, p: 增量编码点 }（不含 v/r，前端加载时按上层合并）
export function syncZiStrokes(ziId, strokes) {
  const file = strokesPath(ziId)
  if (!fs.existsSync(metaPath(ziId))) return false
  const list = (strokes || []).filter(s => s.trajectory_data?.p?.length > 0)
  try {
    if (list.length > 0) {
      const r = list[0].trajectory_data.r
      fs.writeFileSync(file, JSON.stringify({
        v: TRAJECTORY_VERSION,
        ...(r ? { r } : {}),
        s: list.map(x => ({
          o: x.stroke_order,
          t: x.stroke_type,
          d: {
            b: x.trajectory_data.b ?? 0,
            p: deltaEncode(x.trajectory_data.p)
          }
        }))
      }))
    } else if (fs.existsSync(file)) {
      fs.rmSync(file)
    }
    return true
  } catch {
    return false
  }
}
