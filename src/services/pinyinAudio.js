// 读音雪碧图播放（audio/pinyin/{首字母}.ogg 分片 + 二维声调索引）
// 索引结构 { v, z: { 无声调拼音: [5 槽位时长] } }:
//   槽位下标 0-3 = 一声至四声、4 = 零声，缺失为 0; 分片 = 拼音首字母
// 起始不存储: 片内按拼音排序、组内按声调序拼接（与打包一致），
//   起始 = 前序时长 + 20ms 帧补齐逐片段累加（时长 ms 精确，推导严格一致）
// 设置 currentTime 后浏览器经 HTTP Range 仅拉取片段所需字节
import { PINYIN_AUDIO_DIR } from '../config.js'

const FRAME_MS = 20

let clipsCache = null

async function loadAudioClips() {
  if (clipsCache === null) {
    try {
      const res = await fetch(`${PINYIN_AUDIO_DIR}/index.json`)
      const raw = res.ok ? await res.json() : null
      clipsCache = raw?.z ? deriveClips(raw.z) : new Map()
    } catch {
      clipsCache = new Map()
    }
  }
  return clipsCache
}

// 由声调槽位索引推导每个读音的分片与起始/时长（键序 = 打包拼接序）
function deriveClips(z) {
  const map = new Map()
  let letter = ''
  let start = 0
  for (const plain of Object.keys(z).sort()) {
    const L = plain[0]
    if (L !== letter) {
      letter = L
      start = 0
    }
    const slots = z[plain]
    for (let t = 0; t < 5; t++) {
      const dur = slots[t]
      if (!dur) continue
      const reading = t < 4 ? `${plain}${t + 1}` : plain
      map.set(reading, { shard: L, start, dur })
      start += dur + ((FRAME_MS - (dur % FRAME_MS)) % FRAME_MS)
    }
  }
  return map
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
