// ============ 书写页入口（write/index.html） ============
// 注册书写页编排组件并启动 Alpine；公共组件在其各自的模块中自注册
import '/src/boot.js'
import Alpine from 'alpinejs'
import { registerStrokeEditor } from './strokeEditor.js'
import '@components/StrokePad.js'
import '@components/StrokeTypeSelect.js'
import '@components/ThemeToggle.js'
import '@components/PageHeader.js'
import '@components/AppFooter.js'

registerStrokeEditor()

Alpine.start()
