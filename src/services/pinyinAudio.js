// 读音雪碧图播放（audio/pinyin/{首字母}.ogg 分片 + index.json 偏移索引）:
// 索引结构 { v, 读音: [起始毫秒, 时长毫秒] }，分片 = 读音首字母（由键推导）;
// 片段结尾已补齐 Opus 帧长，起始位置与帧边界对齐;
// 设置 currentTime 后浏览器经 HTTP Range 仅拉取片段所需字节
import { PINYIN_AUDIO_DIR } from '../config.js'

let indexCache = null

async function loadAudioIndex() {
  if (indexCache === null) {
    try {
      const res = await fetch(`${PINYIN_AUDIO_DIR}/index.json`)
      indexCache = res.ok ? await res.json() : {}
    } catch {
      indexCache = {}
    }
  }
  return indexCache
}

// 播放读音片段; 索引缺失/加载失败时回调 onError; 返回 audio 元素（供停止）
export async function playPinyinAudio(p, onError) {
  const index = await loadAudioIndex()
  const clip = index[p]
  if (!clip) {
    onError?.(p)
    return null
  }
  const [start, dur] = clip
  const shard = p[0]
  const audio = new Audio(`${PINYIN_AUDIO_DIR}/${shard}.ogg`)
  audio.onerror = () => onError?.(p)
  audio.addEventListener('loadedmetadata', () => {
    audio.currentTime = start / 1000
    audio.play().catch(() => onError?.(p))
  })
  // 片段播完即停（雪碧图整体更长，由定时器接管停止）
  audio._clipTimer = setTimeout(() => {
    audio.pause()
    audio.currentTime = 0
  }, dur)
  return audio
}

export function stopPinyinAudio(audio) {
  if (!audio) return
  clearTimeout(audio._clipTimer)
  audio.pause()
}
