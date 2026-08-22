// 笔画类型分组下拉列表（书写页笔画列表行内类型选择共用）
// 按主笔画归属分组（未指定/点/横/竖/撇/捺/折/提/钩），见 STROKE_TYPE_GROUPS
// 用法（select 为组件宿主，其余属性照常配置）:
//   <select x-data="strokeTypeSelect({
//       selected: () => s.stroke_type,          // 函数形式: 渲染时求值，随宿主状态更新选中项
//       onChange: (code) => updateStrokeType(s, code)
//     })" x-html="optionsHtml" @change="onChange($event)"></select>
import Alpine from 'alpinejs'
import { STROKE_TYPE_GROUPS } from './StrokeTypes.js'

Alpine.data('strokeTypeSelect', (opts = {}) => ({
  get optionsHtml() {
    // selected 支持函数: 求值时访问宿主响应式属性，选中项随笔画类型状态同步
    const selected = typeof opts.selected === 'function' ? opts.selected() : opts.selected
    return STROKE_TYPE_GROUPS.map(g =>
      `<optgroup label="${g.name}">` +
      g.types.map(t =>
        `<option value="${t.code}"${t.code === selected ? ' selected' : ''}>` +
        `${t.shape} ${t.name}</option>`).join('') +
      `</optgroup>`).join('')
  },

  onChange(event) {
    opts.onChange?.(Number(event.target.value))
  }
}))
