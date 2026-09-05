// ============ 汉字静态数据同步（public/assets/zi） ============
// 书写页对 部首/结构/笔画 的修改与调整，同步落盘到对应静态数据文件:
//   - meta 信息: 单文件 index.json（读音/部首/结构三字典 + 每字紧凑行）
//   - 笔画数据: strokes/{码点>>12}.json 码点分片（整字单条目，序号由下标推出）
// 仅在文件已存在时更新（静态数据由 build/export-zi.js 导出生成）
import fs from 'fs'
import path from 'path'
import { deltaEncode, flattenPoints, TRAJECTORY_VERSION } from './Trajectory.js'
import { ZI_ASSETS_DIR } from '../../paths.js'

function indexPath() {
  return path.join(ZI_ASSETS_DIR, 'index.json')
}

// 码点分片文件路径（码点 >> 12 分片，与 export-zi / web 端加载路径一致）
export function strokesShardPath(ziId) {
  return path.join(ZI_ASSETS_DIR, 'strokes', `${ziId >> 12}.json`)
}

// 读取并解析 index.json（结构: { v, p: 读音字典, r: 部首字典, s: 结构字典, z: 行数组 }）;
// 文件缺失/损坏返回 null（调用方按“无静态数据”处理）
function readIndex() {
  const file = indexPath()
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    console.warn(`index.json 解析失败（跳过同步）: ${e.message}`)
    return null
  }
}

// 字典索引（不存在则追加，返回索引）
function dictIndex(dict, value) {
  let idx = dict.indexOf(value)
  if (idx === -1) {
    dict.push(value)
    idx = dict.length - 1
  }
  return idx
}

// 同步部首/结构/读音/笔画数到 index.json（仅文件存在且含该字时更新）:
// 行结构 [id, 读音索引(多音为数组), 笔画数, 部首索引, 结构索引, 繁体标记]
export function syncZiMeta(zi) {
  if (!zi) return false
  const index = readIndex()
  if (!index) return false
  try {
    const row = index.z.find(r => r[0] === zi.id)
    if (!row) return false
    if (zi.pinyin !== undefined) {
      // pinyin 经 schema 恒为数组（脚本直插场景亦为 JSON 数组）
      const p = zi.pinyin.map(reading => dictIndex(index.p, reading))
      row[1] = p.length === 1 ? p[0] : p
    }
    if (zi.total_stroke_count !== undefined) row[2] = zi.total_stroke_count
    if (zi.radical !== undefined) row[3] = dictIndex(index.r, zi.radical)
    if (zi.structure !== undefined) row[4] = dictIndex(index.s, zi.structure)
    fs.writeFileSync(indexPath(), JSON.stringify(index))
    return true
  } catch (e) {
    console.warn(`index.json 同步失败: ${e.message}`)
    return false
  }
}

// 从静态数据移除某汉字（DB 删除后调用，保持静态与库一致）:
// index.json 删除对应行；笔画分片删除对应条目
export function removeZiStatic(ziId) {
  const index = readIndex()
  if (index) {
    const before = index.z.length
    index.z = index.z.filter(r => r[0] !== ziId)
    if (index.z.length < before) {
      try {
        fs.writeFileSync(indexPath(), JSON.stringify(index))
      } catch (e) {
        console.warn(`index.json 删除行失败: ${e.message}`)
      }
    }
  }
  const file = strokesShardPath(ziId)
  try {
    if (!fs.existsSync(file)) return
    const shard = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (shard.z?.[String(ziId)] === undefined) return
    delete shard.z[String(ziId)]
    fs.writeFileSync(file, JSON.stringify(shard))
  } catch (e) {
    console.warn(`笔画分片移除条目失败（码点 ${ziId}）: ${e.message}`)
  }
}

// 同步笔画数据到 strokes 分片（该汉字须已导出 index.json）:
// 分片条目结构: { 码点: [r, [[t, [b, flatPts]], ...]] }，序号由数组下标推出;
// 有笔画时创建/更新，无笔画时移除条目
export function syncZiStrokes(ziId, strokes) {
  if (!fs.existsSync(indexPath())) return false
  const file = strokesShardPath(ziId)
  const list = (strokes || [])
    .filter(s => s.trajectory_data?.p?.length > 0)
    .slice()
    .sort((a, b) => a.stroke_order - b.stroke_order)
  try {
    let shard = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : { v: TRAJECTORY_VERSION, z: {} }
    const key = String(ziId)
    if (list.length > 0) {
      const r = list[0].trajectory_data.r
      shard.z[key] = [
        r ? [r.w, r.h] : null,
        list.map(s => [
          s.stroke_type,
          [s.trajectory_data.b ?? 0, flattenPoints(deltaEncode(s.trajectory_data.p))]
        ])
      ]
    } else {
      delete shard.z[key]
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(shard))
    return true
  } catch (e) {
    console.warn(`笔画分片同步失败（码点 ${ziId}）: ${e.message}`)
    return false
  }
}
