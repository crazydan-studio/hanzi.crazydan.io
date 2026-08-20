// ============ 友情赞助页组件（donate/index.html） ============
// 收款码图片与赞助清单链接来自站点配置（单一来源，见 src/config.js）
import Alpine from 'alpinejs'
import { DONATE_LIST_URL, STUDIO_URL } from '../config.js'

Alpine.data('donateApp', () => ({
  donateListUrl: DONATE_LIST_URL,
  qrUrl(file) {
    return `${STUDIO_URL}donate/${file}`
  }
}))
