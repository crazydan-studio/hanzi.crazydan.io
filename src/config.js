// ============ 站点全局配置（固定数据单一来源） ============
// 供各页面组件与 vite 构建脚本共用（不含平台相关逻辑，可在 Node 环境导入）

// 主题存储键（vite 注入的头部内联脚本亦引用，见 vite.config.js injectThemeScript）
export const THEME_KEY = 'hanzi:theme'

// 站点链接
export const SITE_URL = 'https://hanzi.crazydan.io'
export const GITHUB_REPO = 'https://github.com/crazydan-studio/hanzi.crazydan.io'
export const GITHUB_ISSUES = `${GITHUB_REPO}/issues`
export const GITHUB_RELEASES = `${GITHUB_REPO}/releases/download`
export const KUAII_IME_URL = 'https://github.com/crazydan-studio/kuaizi-ime'
export const ZDIC_URL = 'https://zdic.net/'
export const ZDIC_TERMS_URL = 'https://zdic.net/terms/'
export const STUDIO_URL = 'https://studio.crazydan.org/'
export const SUPPORT_EMAIL = 'support@studio.crazydan.org'
// 友情赞助清单（GitHub 仓库内文档）
export const DONATE_LIST_URL = `${GITHUB_REPO}/blob/master/docs/donate/index.md`
// 笔顺参考图（汉典网楷体笔顺图，{unicode} 为汉字 Unicode 码点十六进制大写，如 永 → 6C38）
export const STROKE_REF_URL = 'https://img.zdic.net/kai/jbh/{unicode}.gif'

// 拼音读音音频目录（静态资源，{数字声调拼音}.mp3）
export const PINYIN_AUDIO_DIR = '/assets/audio/pinyin'

// 中易楷体（统一字体族名与预加载字号，字体加载/墨迹测量共用）
export const KAI_FONT_FAMILY = '"ZhongYiKaiTi"'
export const KAI_FONT_SIZE = 300
