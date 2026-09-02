// 拼音读音音频打包: 导入 mp3/wav → Opus 雪碧图（按首字母分片）+ 偏移索引
// 用法:
//   node build/audio-pack.js                                 # 打包 public/assets/audio/pinyin 内既有 mp3/wav
//   node build/audio-pack.js --source <音频目录>               # 从指定目录导入后打包
// 源文件命名规则（自动归一化为数字声调拼音，如 di4 / lü4）:
//   - 符号声调: dì / lǜ（含 ü 变音符号 ǖǘǚǜ），轻声不带声调符号
//   - 数字声调: di4 / lv4
//   - ü 可写作 v: lv4 → lü4, nve4 → nüe4
// 产物（public/assets/audio/pinyin/）:
//   - {首字母}.ogg   按读音首字母分片的 Opus 雪碧图（48kHz 单声道 32kbps）
//   - index.json     偏移索引: { v, 读音: [起始毫秒, 时长毫秒] }
//     分片不存储（分片 = 读音首字母，由键推导）; 每片段末尾补齐 20ms 静音（Opus 帧长），
//     起始位置与帧边界（granule）严格对齐，播放端经 HTTP Range / MediaPlayer seekTo 定位
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

  // 1. 扫描源文件并归一化命名
  const files = fs.readdirSync(srcDir).filter(f => /\.(mp3|wav)$/i.test(f))
  const clips = new Map()   // 读音 → { file, pcm, durMs }
  const skipped = []
  for (const file of files) {
    const reading = normalizeReading(path.basename(file).replace(/\.(mp3|wav)$/i, ''))
    if (!reading) { skipped.push(file); continue }
    if (clips.has(reading)) { skipped.push(file + '（与 ' + reading + ' 重复）'); continue }
    const filePath = path.join(srcDir, file)
    try {
      const pcm = decodeToPcm(filePath)
      clips.set(reading, { file, pcm, durMs: Math.round(pcm.length / 2 / SAMPLE_RATE * 1000) })
    } catch (e) {
      skipped.push(file + '（解码失败）')
    }
  }
  console.log(`导入 ${clips.size} 个读音（跳过 ${skipped.length}: ${skipped.slice(0, 5).join('、')}${skipped.length > 5 ? ' 等' : ''}）`)

  // 2. 按首字母分组，拼接 PCM（片段结尾补齐到 Opus 帧长整数倍，起始与帧边界对齐）
  const frameSamples = SAMPLE_RATE * FRAME_MS / 1000
  const shards = new Map()   // 首字母 → { pcm: Buffer[], index: [] }
  for (const [reading, clip] of clips) {
    const letter = reading[0]
    if (!shards.has(letter)) shards.set(letter, { buffers: [], index: [] })
    const shard = shards.get(letter)
    const startSamples = shard.buffers.reduce((sum, b) => sum + b.length, 0) / 2
    shard.index.push({ reading, startMs: Math.round(startSamples / SAMPLE_RATE * 1000), durMs: clip.durMs })
    shard.buffers.push(clip.pcm)
    // 补静音到帧长整数倍（位于片段末尾，不影响起始对齐与听感; 已对齐则不补）
    const rem = clip.pcm.length % (frameSamples * 2)
    if (rem > 0) shard.buffers.push(Buffer.alloc(frameSamples * 2 - rem))
  }

  // 3. 编码 Opus 分片 + 写索引
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const index = { v: 1 }
  let totalBytes = 0
  for (const [letter, shard] of shards) {
    const pcm = Buffer.concat(shard.buffers)
    const outFile = path.join(OUT_DIR, `${letter}.ogg`)
    encodePcmToOpus(pcm, outFile)
    // 分片列不存储: 分片 = 读音首字母，由键推导
    for (const entry of shard.index) index[entry.reading] = [entry.startMs, entry.durMs]
    totalBytes += fs.statSync(outFile).size
    console.log(`已编码 ${letter}.ogg: ${shard.index.length} 个读音, ${(fs.statSync(outFile).size / 1024).toFixed(1)} KB`)
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index))

  // 4. 清理产物目录中的源文件（仅清理已消费的; --source 外部目录不受影响）
  if (srcDir === OUT_DIR) {
    for (const clip of clips.values()) fs.rmSync(path.join(OUT_DIR, clip.file), { force: true })
  }

  console.log(`完成: ${shards.size} 个分片, 共 ${(totalBytes / 1024 / 1024).toFixed(2)} MB → ${OUT_DIR}`)
  console.log(`索引: ${path.join(OUT_DIR, 'index.json')}（${Object.keys(index).length - 1} 个读音）`)
}

main()
