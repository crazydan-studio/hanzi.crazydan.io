// ============ 常用字列表页入口（commons/index.html） ============
// 页面逻辑见 ZiListPage.js（自注册 commonsApp 组件）
import '/src/boot.js'
import Alpine from 'alpinejs'
import '@components/ZiListPage.js'
import '@components/ZiGrid.js'
import '@components/ThemeToggle.js'
import '@components/LoadingOverlay.js'
import '@components/AppFooter.js'

Alpine.start()
