// ============ 汉字静态数据同步（public/assets/zi） ============
// 书写页对 部首/结构/笔画 的修改与调整，同步落盘到该汉字对应的静态数据文件
// （仅当文件已存在时更新: meta.json / strokes.json）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ZI_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'zi')

function metaPath(characterId) {
  return path.join(ZI_DIR, String(characterId), 'meta.json')
}

function strokesPath(characterId) {
  return path.join(ZI_DIR, String(characterId), 'strokes.json')
}

// 同步部首/结构到 meta.json（仅文件存在时）
export function syncCharacterMeta(character) {
  if (!character) return false
  const file = metaPath(character.id)
  if (!fs.existsSync(file)) return false
  try {
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'))
    // 单字母紧凑字段（与导出脚本一致）: r 部首 / s 结构编码（展示名由前端映射）
    if (character.radical !== undefined) meta.r = character.radical
    if (character.structure !== undefined) meta.s = character.structure
    fs.writeFileSync(file, JSON.stringify(meta))
    return true
  } catch {
    return false
  }
}

// 同步笔画数据到 strokes.json（仅文件存在时）
export function syncCharacterStrokes(characterId, strokes) {
  const file = strokesPath(characterId)
  if (!fs.existsSync(file)) return false
  try {
    // 单字母紧凑结构（与导出脚本一致）: o 笔顺 / t 类型 / d 轨迹（v 版本 / p 点）
    fs.writeFileSync(file, JSON.stringify((strokes || []).map(s => ({
      o: s.stroke_order,
      t: s.stroke_type,
      d: { v: s.trajectory_data.version, p: s.trajectory_data.points }
    }))))
    return true
  } catch {
    return false
  }
}
