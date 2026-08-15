// ============ 汉字静态数据同步（public/assets/zi） ============
// 书写页对 部首/结构/笔画 的修改与调整，同步落盘到该汉字对应的静态数据文件
// （仅当文件已存在时更新: meta.json / strokes.json）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ZI_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'zi')

// 结构数字编码 → 展示名（与导出脚本一致: 不含「结构」二字，无示例）
const STRUCTURE_NAMES = {
  0: '未指定', 1: '独体', 2: '左右', 3: '左中右', 4: '上下',
  5: '上中下', 6: '全包围', 7: '半包围', 8: '品字', 9: '镶嵌'
}

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
    if (character.radical !== undefined) meta.radical = character.radical
    if (character.structure !== undefined) {
      meta.structure = STRUCTURE_NAMES[character.structure] ?? meta.structure
    }
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
    fs.writeFileSync(file, JSON.stringify((strokes || []).map(s => ({
      stroke_order: s.stroke_order,
      stroke_type: s.stroke_type,
      trajectory_data: s.trajectory_data
    }))))
    return true
  } catch {
    return false
  }
}
