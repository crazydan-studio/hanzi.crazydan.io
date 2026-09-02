// 拼音读音音频打包: 导入 mp3/wav → Opus 雪碧图（按首字母分片）+ 二维声调索引
// 用法:
//   node build/audio-pack.js                                 # 打包 public/assets/audio/pinyin 内既有 mp3/wav
//   node build/audio-pack.js --source <音频目录>               # 从指定目录导入后打包
// 源文件命名规则（自动归一化为数字声调拼音，如 di4 / lü4）:
//   - 符号声调: dì / lǜ（含 ü 变音符号 ǖǘǚǜ），轻声不带声调符号
//   - 数字声调: di4 / lv4
//   - ü 可写作 v: lv4 → lü4, nve4 → nüe4
// 产物（public/assets/audio/pinyin/）:
//   - {首字母}.ogg   按读音首字母分片的 Opus 雪碧图（48kHz 单声道 32kbps）
//   - index.json     声调槽位索引: { v, z: { 无声调拼音: [5 槽位时长] } }
//     槽位下标 0-3 = 一声至四声、4 = 零声，缺失以 0 占位;
//     时长 ms 精确（内容截尾到 1ms 粒度），分片起始不存储——
//     片内按拼音排序、组内按声调序拼接，起始 = 前序时长 + 帧补齐（20ms 帧长）逐片段累加;
//     每片段末尾补齐到帧边界，起始与帧边界（granule）严格对齐，
//     播放端经 HTTP Range / MediaPlayer seekTo 定位
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'path'
import fs from 'fs'
import { ROOT, PUBLIC_DIR } from '../paths.js'

const OUT_DIR = path.join(PUBLIC_DIR, 'assets', 'audio', 'pinyin')
const SAMPLE_RATE = 48000
const CHANNELS = 1
const OPUS_BITRATE = '32k'
const FRAME_MS = 20   // Opus 帧长（granule 粒度）; 片段结尾补齐到帧长整数倍
const MS_BYTES = SAMPLE_RATE * CHANNELS * 2 / 1000   // 96 字节 = 1ms PCM

// 声调槽位顺序: 0-3 = 一声至四声, 4 = 零声
const TONE_SLOT = { 1: 0, 2: 1, 3: 2, 4: 3 }
const TONE_OF_SLOT = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 0 }   // 0 = 零声

// 符号声调 → 数字声调（基字符 + 声调数字）
const SYMBOL_TONES = {
  'ā': 'a1', 'á': 'a2', 'ǎ': 'a3', 'à': 'a4',
  'ē': 'e1', 'é': 'e2', 'ě': 'e3', 'è': 'e4',
  'ī': 'i1', 'í': 'i2', 'ǐ': 'i3', 'ì': 'i4',
  'ō': 'o1', 'ó': 'o2', 'ǒ': 'o3', 'ò': 'o4',
  'ū': 'u1', 'ú': 'u2', 'ǔ': 'u3', 'ù': 'u4',
  'ǖ': 'ü1', 'ǘ': 'ü2', 'ǚ': 'ü3', 'ǜ': 'ü4'
}
const READING_RE = /^[a-zü]+[1-4]?$/

function parseArgs() {
  const args = process.argv.slice(2)
  let source = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) source = path.resolve(args[++i])
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('用法: node build/audio-pack.js [--source <音频目录>]')
      process.exit(0)
    }
  }
  return { source }
}

// 文件名（去扩展名）→ 数字声调拼音; 非法/无法识别返回 null
function normalizeReading(name) {
  let out = ''
  for (const ch of name) {
    const mapped = SYMBOL_TONES[ch]
    if (mapped) out += mapped
    else out += ch === 'v' ? 'ü' : ch   // v → ü
  }
  return READING_RE.test(out) ? out : null
}

// 数字声调拼音 → { plain: 无声调拼音, slot: 声调槽位(0-3 一声至四声, 4 零声) }
function splitReading(reading) {
  const last = reading[reading.length - 1]
  if (last >= '1' && last <= '4') {
    return { plain: reading.slice(0, -1), slot: TONE_SLOT[last] }
  }
  return { plain: reading, slot: 4 }
}

// ffmpeg 解码为 PCM（s16le, 48kHz, 单声道），返回 Buffer
function decodeToPcm(file) {
  return execFileSync('ffmpeg', [
    '-v', 'error', '-i', file,
    '-f', 's16le', '-ac', String(CHANNELS), '-ar', String(SAMPLE_RATE),
    'pipe:1'
  ])
}

// PCM Buffer → 临时 wav → Opus ogg 分片
function encodePcmToOpus(pcm, outFile) {
  const tmpWav = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hanzi-audio-')), 'shard.wav')
  try {
    fs.writeFileSync(tmpWav, Buffer.concat([buildWavHeader(pcm.length), pcm]))
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-i', tmpWav,
      '-c:a', 'libopus', '-b:a', OPUS_BITRATE,
      '-ar', String(SAMPLE_RATE), '-ac', String(CHANNELS),
      outFile
    ])
  } finally {
    fs.rmSync(path.dirname(tmpWav), { recursive: true, force: true })
  }
}

// 生成 44 字节 WAV 头（PCM s16le）
function buildWavHeader(dataBytes) {
  const buf = Buffer.alloc(44)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)                      // PCM
  buf.writeUInt16LE(CHANNELS, 22)
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28)
  buf.writeUInt16LE(CHANNELS * 2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)
  return buf
}

function main() {
  const { source } = parseArgs()
  const srcDir = source || OUT_DIR
  if (!fs.existsSync(srcDir)) {
    console.error(`音频目录不存在: ${srcDir}`)
    process.exit(1)
  }
  console.log(`源目录: ${srcDir}`)
  console.log(`产物目录: ${OUT_DIR}`)

  // 1. 扫描源文件并归一化命名（内容截尾到 1ms 粒度，时长成为精确整数毫秒，
  //    起始可由时长 + 帧补齐规则精确推导）
  const files = fs.readdirSync(srcDir).filter(f => /\.(mp3|wav)$/i.test(f))
  const clips = new Map()   // 读音 → { file, pcm(ms 精确), durMs }
  const skipped = []
  for (const file of files) {
    const reading = normalizeReading(path.basename(file).replace(/\.(mp3|wav)$/i, ''))
    if (!reading) { skipped.push(file); continue }
    if (clips.has(reading)) { skipped.push(file + '（与 ' + reading + ' 重复）'); continue }
    const filePath = path.join(srcDir, file)
    try {
      const pcm = decodeToPcm(filePath)
      // 截尾到整毫秒（最多损失 <1ms 尾部，无听感影响）; durMs = pcm 字节 / 96 精确
      const trimmed = pcm.subarray(0, Math.floor(pcm.length / MS_BYTES) * MS_BYTES)
      clips.set(reading, { file, pcm: trimmed, durMs: trimmed.length / MS_BYTES })
    } catch (e) {
      skipped.push(file + '（解码失败）')
    }
  }
  console.log(`导入 ${clips.size} 个读音（跳过 ${skipped.length}: ${skipped.slice(0, 5).join('、')}${skipped.length > 5 ? ' 等' : ''}）`)

  // 2. 按 无声调拼音 + 声调槽位 组织，片内按拼音排序、组内按声调序拼接
  //    （槽位顺序固定，起始可由时长推导，无需存储）
  const byPlain = new Map()   // plain → [5 槽位]: null/undefined 缺失, { pcm, durMs }
  for (const [reading, clip] of clips) {
    const { plain, slot } = splitReading(reading)
    if (!byPlain.has(plain)) byPlain.set(plain, new Array(5).fill(null))
    byPlain.get(plain)[slot] = clip
  }
  const shards = new Map()   // 首字母 → { buffers: [], count }
  for (const plain of [...byPlain.keys()].sort()) {
    const slots = byPlain.get(plain)
    for (const clip of slots) {
      if (!clip) continue
      const letter = plain[0]
      if (!shards.has(letter)) shards.set(letter, { buffers: [], count: 0 })
      const shard = shards.get(letter)
      shard.buffers.push(clip.pcm)
      shard.count++
      // 补静音到 20ms 帧长整数倍（位于片段末尾，起始与帧边界对齐; 已对齐则不补）
      const rem = clip.durMs % FRAME_MS
      if (rem > 0) shard.buffers.push(Buffer.alloc((FRAME_MS - rem) * MS_BYTES))
    }
  }

  // 3. 编码 Opus 分片 + 写声调槽位索引
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const index = { v: 2, z: {} }
  let totalBytes = 0
  for (const [letter, shard] of shards) {
    const pcm = Buffer.concat(shard.buffers)
    const outFile = path.join(OUT_DIR, `${letter}.ogg`)
    encodePcmToOpus(pcm, outFile)
    totalBytes += fs.statSync(outFile).size
    console.log(`已编码 ${letter}.ogg: ${shard.count} 个读音, ${(fs.statSync(outFile).size / 1024).toFixed(1)} KB`)
  }
  for (const [plain, slots] of byPlain) {
    index.z[plain] = slots.map(clip => clip?.durMs ?? 0)
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index))

  // 4. 清理产物目录中的源文件（仅清理已消费的; --source 外部目录不受影响）
  if (srcDir === OUT_DIR) {
    for (const clip of clips.values()) fs.rmSync(path.join(OUT_DIR, clip.file), { force: true })
  }

  const totalDur = [...byPlain.values()].reduce((s, slots) => s + slots.reduce((a, c) => a + (c?.durMs ?? 0), 0), 0)
  console.log(`完成: ${shards.size} 个分片, 共 ${(totalBytes / 1024 / 1024).toFixed(2)} MB → ${OUT_DIR}`)
  console.log(`索引: ${path.join(OUT_DIR, 'index.json')}（${byPlain.size} 个无声调拼音 / ${clips.size} 个读音, 内容 ${totalDur}ms）`)
}

main()
