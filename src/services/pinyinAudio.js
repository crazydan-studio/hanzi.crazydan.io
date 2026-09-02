// 读音雪碧图播放（audio/pinyin/{首字母}.ogg 分片 + 定长双数组索引 v1）
// 索引结构 { v:1, p: 无声调拼音有序数组, d: 时长扁平数组 }:
//   每个拼音固定占 d 中 5 个连续元素，槽位 0 = 零声、1-4 = 一至四声（零声在前），
//   定位 = 拼音在 p 的下标 × 5 + 声调槽; 0 = 该声调无音频; 分片 = 拼音首字母
// 起始不存储: 片内按 p 顺序、组内按槽位序拼接（与打包一致），
//   起始 = 前序时长 + 20ms 帧补齐逐片段累加（时长 ms 精确，推导严格一致）
// 设置 currentTime 后浏览器经 HTTP Range 仅拉取片段所需字节
import { PINYIN_AUDIO_DIR } from '../config.js'

const FRAME_MS = 20
const SLOT_COUNT = 5

let clipsCache = null

async function loadAudioClips() {
  if (clipsCache === null) {
    try {
      const res = await fetch(`${PINYIN_AUDIO_DIR}/index.json`)
      const raw = res.ok ? await res.json() : null
      clipsCache = raw?.p && raw?.d ? deriveClips(raw.p, raw.d) : new Map()
    } catch {
      clipsCache = new Map()
    }
  }
  return clipsCache
}

// 由定长双数组推导每个读音的分片与起始/时长（p/d 顺序 = 打包拼接序）
function deriveClips(p, d) {
  const map = new Map()
  let letter = ''
  let start = 0
  p.forEach((plain, pi) => {
    const L = plain[0]
    if (L !== letter) {
      letter = L
      start = 0
    }
    const base = pi * SLOT_COUNT
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const dur = d[base + slot]
      if (!dur) continue
      const reading = slot === 0 ? plain : `${plain}${slot}`
      map.set(reading, { shard: L, start, dur })
      start += dur + ((FRAME_MS - (dur % FRAME_MS)) % FRAME_MS)
    }
  })
  return map
}

// 读音是否存在音频（试听按钮可用性）
export async function hasPinyinAudio(p) {
  const clips = await loadAudioClips()
  return clips.has(p)
}

// 播放读音片段; 索引缺失/加载失败时回调 onError; 返回 audio 元素（供停止）
export async function playPinyinAudio(p, onError) {
  const clips = await loadAudioClips()
  const clip = clips.get(p)
  if (!clip) {
    onError?.(p)
    return null
  }
  const audio = new Audio(`${PINYIN_AUDIO_DIR}/${clip.shard}.ogg`)
  audio.onerror = () => onError?.(p)
  audio.addEventListener('loadedmetadata', () => {
    audio.currentTime = clip.start / 1000
    audio.play().catch(() => onError?.(p))
  })
  // 片段播完即停（雪碧图整体更长，由定时器接管停止）
  audio._clipTimer = setTimeout(() => {
    audio.pause()
    audio.currentTime = 0
  }, clip.dur)
  return audio
}

export function stopPinyinAudio(audio) {
  if (!audio) return
  clearTimeout(audio._clipTimer)
  audio.pause()
}
