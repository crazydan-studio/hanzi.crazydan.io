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

let clipsPromise = null

// 单例加载（缓存 Promise: 并发调用共享同一次 fetch，避免多个读音重复加载索引）
function loadAudioClips() {
  if (!clipsPromise) {
    clipsPromise = (async () => {
      try {
        const res = await fetch(`${PINYIN_AUDIO_DIR}/index.json`)
        const raw = res.ok ? await res.json() : null
        return raw?.p && raw?.d ? deriveClips(raw.p, raw.d) : new Map()
      } catch {
        return new Map()
      }
    })()
  }
  return clipsPromise
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

// 读音列表的试听可用性表（读音 → 是否有音频），供汉字信息页/书写页共用
export async function audioMapOf(readings) {
  const unique = [...new Set(readings || [])]
  return Object.fromEntries(
    await Promise.all(unique.map(async p => [p, await hasPinyinAudio(p)])))
}

// 播放令牌: 每次播放/停止递增，使仍在下载或等待元数据的旧播放失效
// （音频下载慢于用户连点时，旧 Audio 的 loadedmetadata 到达后不再起播）
let activeToken = 0

// 播放读音片段; 索引缺失/加载失败时回调 onError; 返回 audio 元素（供停止）
export async function playPinyinAudio(p, onError) {
  const clips = await loadAudioClips()
  const clip = clips.get(p)
  if (!clip) {
    onError?.(p)
    return null
  }
  const token = ++activeToken
  const stale = () => token !== activeToken
  const audio = new Audio(`${PINYIN_AUDIO_DIR}/${clip.shard}.ogg`)
  audio.onerror = () => {
    if (!stale()) onError?.(p)
  }
  // 音频下载/初始化耗时不计入播放窗口: 起播成功后才启动停止定时器，
  // 否则首次播放（冷缓存）会被加载延迟截短
  audio.addEventListener('loadedmetadata', async () => {
    if (stale()) return
    audio.currentTime = clip.start / 1000
    try {
      await audio.play()
    } catch {
      if (!stale()) onError?.(p)
      return
    }
    if (stale()) {
      audio.pause()
      return
    }
    audio._clipTimer = setTimeout(() => {
      audio.pause()
      audio.currentTime = 0
    }, clip.dur)
    // 兜底钳制: 定时器迟滞时按播放位置强制停止（片段末尾有 ≤19ms 静音补齐，
    // 阈值取 dur + 补齐余量，避免越界播入下一片段）
    audio.addEventListener('timeupdate', function onTime() {
      if (audio.currentTime >= clip.start / 1000 + (clip.dur + 25) / 1000) {
        audio.removeEventListener('timeupdate', onTime)
        clearTimeout(audio._clipTimer)
        audio.pause()
        audio.currentTime = 0
      }
    })
  })
  return audio
}

export function stopPinyinAudio(audio) {
  if (!audio) return
  clearTimeout(audio._clipTimer)
  audio.pause()
  activeToken++   // 作废在途的加载/播放
}
