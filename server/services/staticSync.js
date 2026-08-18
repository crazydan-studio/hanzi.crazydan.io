// ============ 汉字静态数据同步（public/assets/zi） ============
// 书写页对 部首/结构/笔画 的修改与调整，同步落盘到该汉字对应的静态数据文件
import fs from 'fs'
import path from 'path'
import { deltaEncode, TRAJECTORY_VERSION } from './trajectory.js'
import { ZI_ASSETS_DIR } from '../../paths.js'

function metaPath(ziId) {
  return path.join(ZI_ASSETS_DIR, String(ziId), 'meta.json')
}

function strokesPath(ziId) {
  return path.join(ZI_ASSETS_DIR, String(ziId), 'strokes.json')
}

// 同步部首/结构到 meta.json（仅文件存在时）
export function syncZiMeta(zi) {
  if (!zi) return false
  const file = metaPath(zi.id)
  if (!fs.existsSync(file)) return false
  try {
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'))
    // 单字母紧凑字段（与导出脚本一致）: r 部首 / s 结构编码（展示名由前端映射）
    if (zi.radical !== undefined) meta.r = zi.radical
    if (zi.structure !== undefined) meta.s = zi.structure
    fs.writeFileSync(file, JSON.stringify(meta))
    return true
  } catch {
    return false
  }
}

// 同步笔画数据到 strokes.json（该汉字须已导出 meta.json）:
// 有笔画时创建/更新（轨迹为增量编码，含笔刷面积比 b）；无笔画时删除文件
export function syncZiStrokes(ziId, strokes) {
  const file = strokesPath(ziId)
  if (!fs.existsSync(metaPath(ziId))) return false
  const list = (strokes || []).filter(s => s.trajectory_data?.points?.length > 0)
  try {
    if (list.length > 0) {
      // 单字母紧凑结构（与导出脚本一致）: o 笔顺 / t 类型 / d 轨迹（v 版本 / b 笔刷 / p 增量编码点）
      fs.writeFileSync(file, JSON.stringify(list.map(s => ({
        o: s.stroke_order,
        t: s.stroke_type,
        d: {
          v: TRAJECTORY_VERSION,
          b: s.trajectory_data.brush ?? 0,
          p: deltaEncode(s.trajectory_data.points)
        }
      }))))
    } else if (fs.existsSync(file)) {
      fs.rmSync(file)
    }
    return true
  } catch {
    return false
  }
}
