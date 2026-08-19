// ============ 首页组件（index.html） ============
// 功能: 汉字/拼音查询（URL 参数路由）+ 常用字速览
import Alpine from 'alpinejs'
import { loadCommons } from '@services/data.js'
import { GITHUB_RELEASES } from './config.js'

// Android 系统图标（App 下载按钮）
const ANDROID_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6 text-green-500"><path d="M17.5 8.5c-.9 0-1.7.4-2.3 1H8.8c-.6-.6-1.4-1-2.3-1C4.6 8.5 3 10.1 3 12v3.5h18V12c0-1.9-1.6-3.5-3.5-3.5zM6.5 11.5c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zm11 0c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zM8.8 9.5 7 6.3c-.3-.5 0-1.1.5-1.3.5-.3 1.1 0 1.3.5l1.8 3.1c.5-.1 1-.2 1.4-.2s.9.1 1.4.2l1.8-3.1c.3-.5.8-.8 1.3-.5.5.3.8.8.5 1.3l-1.8 3.2h-6.4zm-3.3 7.5H4V19.5c0 .6.4 1 1 1s1-.4 1-1V17zm13 0h-1.5v2.5c0 .6.4 1 1 1s1-.4 1-1V17z"/></svg>'

// App 版本号（构建时注入，见 vite.config.js: __HANZI_APP_VERSION__，与 app/version.txt 一致）
const APP_VERSION = __HANZI_APP_VERSION__

// App 下载平台与变体（系统图标按钮）: 目前仅支持 android
// 安装包由 build/app-pack.sh 生成:
//   - development: 本地 public/assets/app/android/hanzi-debug.apk（pure 变体）
//   - production:  纯净版（pure，无任何权限）与可联网变体（online，支持检查更新与
//     在线下载笔画数据），命名 hanzi-{variant}-android-{version}.apk，随 GitHub
//     Releases 发布（tag 为 v{version}），下载地址与 app-pack.sh 命名约定一致
const IS_DEV = import.meta.env.DEV
const APP_PLATFORMS = IS_DEV
  ? [{
      id: 'android',
      variant: 'pure',
      name: 'Android',
      icon: ANDROID_ICON,
      file: 'hanzi-debug.apk',
      version: `${APP_VERSION}-debug`,
      desc: '纯净版（开发构建）',
      url: '/assets/app/android/hanzi-debug.apk'
    }]
  : [
      {
        id: 'android',
        variant: 'pure',
        name: 'Android 纯净版',
        icon: ANDROID_ICON,
        file: `hanzi-pure-android-${APP_VERSION}.apk`,
        version: APP_VERSION,
        desc: '无任何权限，仅使用内置数据',
        url: `${GITHUB_RELEASES}/v${APP_VERSION}/hanzi-pure-android-${APP_VERSION}.apk`
      },
      {
        id: 'android',
        variant: 'online',
        name: 'Android 联网版',
        icon: ANDROID_ICON,
        file: `hanzi-online-android-${APP_VERSION}.apk`,
        version: APP_VERSION,
        desc: '可联网：支持检查更新、在线下载笔画数据',
        url: `${GITHUB_RELEASES}/v${APP_VERSION}/hanzi-online-android-${APP_VERSION}.apk`
      }
    ]

Alpine.data('homeApp', () => ({
  commons: [],
  commonsLoading: true,
  commonsError: '',
  query: '',
  error: '',
  // 本地开发模式下显示「笔画管理」浮动入口
  devButton: import.meta.env.DEV,
  // 移动端 App 下载平台
  APP_PLATFORMS: APP_PLATFORMS,

  init() {
    loadCommons()
      .then((list) => {
        // 常用字速览: 按权重显示前 20 个常用汉字
        this.commons = (list || []).slice(0, 20)
      })
      .catch(() => {
        this.commonsError = '常用字数据加载失败'
      })
      .finally(() => {
        this.commonsLoading = false
      })
  },

  // 查询: 单个汉字 → 汉字信息页 /zi/?v=
  //       纯拼音（不带声调，允许 ü）→ 拼音字列表页 /pinyin/?v=
  //       拼音中的 ü 可用 v 代替（如 lv 视为 lü），查询前自动替换
  search() {
    const q = this.query.trim().replace(/v/g, 'ü')
    if (!q) return
    if (/^[\u4e00-\u9fff]$/.test(q)) {
      location.href = `/zi/?v=${encodeURIComponent(q)}`
    } else if (/^[a-z\u00fc]+$/i.test(q)) {
      location.href = `/pinyin/?v=${q.toLowerCase()}`
    } else {
      this.error = '请输入单个汉字或纯拼音（不带声调）'
    }
  }
}))
