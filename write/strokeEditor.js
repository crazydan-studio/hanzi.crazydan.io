// ============ 书写页编排组件（持有后端状态；组合公共书写板组件） ============
// 职责: 汉字信息/笔画列表的服务端同步（API 耦合留在此层）
//   - 组合 src/components/strokePad.js（公共书写板，零后端耦合）
//   - 通过 padOpts 回调接收书写板输出（录入笔画/悬停/模式/回放进度）
//   - 通过 $refs.pad 调用书写板实例方法注入数据（loadStrokes/setCharacter/setMode...）
import Alpine from 'alpinejs'
import { api } from '../src/services/api.js'
import { createSyncClient } from '../src/services/syncClient.js'
import { STROKE_TYPES, strokeTypesMap } from '../src/components/strokeTypes.js'
import { CHARACTER_STRUCTURES, characterStructuresMap, structureLabel } from '../src/components/characterStructures.js'

export function registerStrokeEditor() {
  Alpine.data('strokeEditor', () => ({
    character: null,
    strokes: [],
    STROKE_TYPES: STROKE_TYPES,
    strokeTypesMap: strokeTypesMap,
    CHARACTER_STRUCTURES: CHARACTER_STRUCTURES,
    characterStructuresMap: characterStructuresMap,
    structureLabel: structureLabel,      // 结构显示文本（含示例）
    isSaving: false,
    saveQueue: Promise.resolve(),
    cancelledLocalIds: new Set(),
    error: null,
    sync: null,                          // 多端同步客户端
    _remoteConfig: false,                // 远端配置回显标志（防广播回环）
    _pendingWidth: null,                 // pad 未就绪时暂存的远端笔宽

    // 触摸设备检测: 移动端无 HTML5 拖拽，列表排序改用上移/下移按钮
    isTouch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,

    // ---- 书写板联动状态（经 strokePad 回调同步） ----
    padMode: 'write',                    // strokePad 当前模式
    playbackActiveStrokeId: null,        // 回放正在绘制的笔画 id（列表联动高亮）
    playbackActiveIndex: -1,             // 回放当前笔画在播放列表中的索引
    selectedStrokeId: null,              // 回放模式: 点击选中的笔画（保持选中直到重播/重置）

    // 书写板组件实例（onReady 回传注入，替代 $refs 时序依赖）
    pad: null,

    // 书写板组件选项（回调输出数据，宿主决定去向）
    padOpts: null,

    init() {
      // 注入书写板回调（闭包引用本组件；数据经此回传到编辑器）
      this.padOpts = {
        onReady: (pad) => {
          this.pad = pad
          // 应用 pad 就绪前到达的远端笔宽
          if (this._pendingWidth) { pad.setPenWidth(this._pendingWidth); this._pendingWidth = null }
        },
        onStrokeRecorded: (stroke) => this.onStrokeRecorded(stroke),
        onStrokeRemoveRequest: ({ strokeId }) => this.onStrokeRemoveRequest({ strokeId }),
        onStrokeHover: (strokeId) => this.hoverStroke(strokeId),
        onModeChanged: (mode) => this.onPadModeChanged(mode),
        onPlaybackProgress: (p) => this.onPlaybackProgress(p),
        onPlaybackToggle: (t) => this.onPlaybackToggle(t),
        onPenWidthChange: (w) => this.onPenWidthChange(w)
      }
      // 书写页独立加载: 从 URL ?char= 解析目标汉字
      const char = new URLSearchParams(window.location.search).get('char')
      if (char) this.loadCharacter({ character: char })
      // 回放直达模式: ?mode=playback
      const mode = new URLSearchParams(window.location.search).get('mode')
      if (mode === 'playback') {
        this.$nextTick(() => this.pad?.setMode('playback'))
      }
      this.setupSync()
    },

    // ---- 多端同步: 书写/配置/页面跳转 跨端实时同步 ----
    setupSync() {
      this.sync = createSyncClient()
      const sync = this.sync
      // 当前字符 id（数字），用于事件匹配（后端广播为 number）
      const currentId = () => (typeof this.character?.id === 'number' ? this.character.id : null)
      // 他端写入了该字笔画 → 重新加载（服务端为权威状态）
      sync.on('strokes-changed', (p) => {
        const id = currentId()
        if (id !== null && Number(p.characterId) === id) {
          this.loadCharacter({ id })
        }
      })
      // 他端修改了该字信息（结构等）→ 重新加载
      sync.on('character-updated', (p) => {
        const id = currentId()
        if (id !== null && Number(p.id) === id) {
          this.loadCharacter({ id })
        }
      })
      // 他端页面跳转 → 跟随跳转
      sync.on('navigate', (p) => {
        if (p.url) location.href = p.url
      })
      // 他端修改笔触宽度 → 应用（标志防回环；pad 未就绪时暂存）
      sync.on('pen-width', (p) => {
        if (!p.width) return
        this._remoteConfig = true
        if (this.pad) {
          this.pad.setPenWidth(p.width)
        } else {
          this._pendingWidth = p.width
        }
        queueMicrotask(() => { this._remoteConfig = false })
      })
    },

    // 返回列表: 恢复进入前的列表 URL（过滤/分页状态）；同步跳转到其他端
    goBack() {
      const url = sessionStorage.getItem('hanzi:listBack') || '../'
      this.sync?.emit('navigate', { url })
      location.href = url
    },

    // 列表行悬停联动书写板高亮（书写/回放模式通用；回放模式非播放时静态高亮）
    hoverStroke(strokeId) {
      this.pad?.onStrokeHover(strokeId)
    },

    // 回放模式: 选中笔画并单独播放其动画（点击列表行/进度指示器）
    // 选中保持到 选中其他笔画 / 重新播放全部 / 重置
    selectAndPlay(strokeId) {
      if (this.padMode !== 'playback') return
      this.selectedStrokeId = strokeId
      this.pad?.seekToStroke(strokeId)
    },

    // 清除单笔选中（重新播放全部 / 重置时）
    clearSelection() {
      this.selectedStrokeId = null
    },

    // 播放按钮/重置 → 清除单笔选中
    onPlaybackToggle({ action, playing }) {
      if (action === 'toggle' && playing) this.clearSelection()
      else if (action === 'reset') this.clearSelection()
    },

    // 回放模式列表行高亮 id: 播放中显示正在绘制笔画，否则保持选中笔画
    get rowHighlightId() {
      if (this.padMode !== 'playback') return null
      return this.pad?.playbackState === 'PLAYING' ? this.playbackActiveStrokeId : this.selectedStrokeId
    },

    // 进度指示器状态: 'active' 正在/选中 | 'done' 已完成 | 'pending' 未播放
    // 单笔播放完毕后: 选中笔画保持 active，其后续笔画保持 pending（不误判已完成）
    indicatorState(index) {
      if (this.padMode !== 'playback') return 'pending'
      const pad = this.pad
      if (!pad) return 'pending'
      const { playbackIndex, playbackState, playbackStrokes } = pad
      if (playbackState === 'PLAYING') {
        return index === playbackIndex ? 'active'
          : index < playbackIndex ? 'done' : 'pending'
      }
      if (this.selectedStrokeId != null) {
        const selIdx = playbackStrokes.findIndex(s => s.id === this.selectedStrokeId)
        if (selIdx === -1) return 'pending'
        if (index === selIdx) return 'active'
        if (index < selIdx) return 'done'
        return 'pending'
      }
      return index < playbackIndex ? 'done' : 'pending'
    },

    // ---- 书写板回调 ----

    // strokePad 模式变化（列表据此只读/可编辑；不参与多端同步）
    onPadModeChanged(mode) {
      this.padMode = mode
      if (mode !== 'playback') {
        this.playbackActiveStrokeId = null
        this.playbackActiveIndex = -1
      }
    },

    // 笔触宽度变化（广播给其他端同步；远端回显不重发）
    onPenWidthChange(width) {
      if (!this._remoteConfig) {
        this.sync?.emit('pen-width', { width })
      }
    },

    // strokePad 回放进度（列表联动高亮正在绘制的笔画；不参与多端同步）
    onPlaybackProgress({ index, strokeId }) {
      this.playbackActiveIndex = index ?? -1
      this.playbackActiveStrokeId = strokeId ?? null
    },

    // 判断某笔画在回放中是否已完成（列表淡化 + 与进度指示器状态一致）
    isPlaybackCompleted(strokeId) {
      if (this.padMode !== 'playback') return false
      const idx = this.pad?.playbackStrokes.findIndex(s => s.id === strokeId) ?? -1
      return idx >= 0 && this.indicatorState(idx) === 'done'
    },

    // 结构编辑（唯一可编辑字段，其余只读）
    async updateCharacterStructure(character, structure) {
      const code = Number(structure)
      if (!Number.isInteger(code) || character.structure === code) return
      try {
        const res = await api.patch(`/api/characters/${character.id}`, { structure: code })
        this.character = res.data || this.character
      } catch (e) {
        this.error = e.message
      }
    },

    // ---- 笔顺参考图（strokeorder.com 外部图） ----
    showStrokeRef: false,        // 是否展开笔顺参考图
    strokeRefError: false,       // 图加载失败（离线/外链被拦）

    // 笔顺参考图 URL: https://www.strokeorder.com/assets/bishun/stroke/{码点}.png
    get strokeRefUrl() {
      if (!this.character?.character) return ''
      const cp = this.character.character.codePointAt(0)
      return `https://www.strokeorder.com/assets/bishun/stroke/${cp}.png`
    },

    toggleStrokeRef() {
      this.showStrokeRef = !this.showStrokeRef
      this.strokeRefError = false
    },

  // 加载汉字: 支持 { id }（列表选中）、{ character }（URL ?char= 直达）或裸 id
  async loadCharacter(target) {
    try {
      let res
      if (typeof target === 'number') {
        res = await api.get(`/api/characters/${target}`)
      } else if (target?.id) {
        res = await api.get(`/api/characters/${target.id}`)
      } else if (target?.character) {
        res = await api.get(`/api/characters/by-char/${encodeURIComponent(target.character)}`)
      } else {
        // 防御: 参数无效时静默（不打断同步流程），仅记录
        console.warn('[strokeEditor] loadCharacter 收到无效参数:', target)
        return
      }
        this.character = res.data || null
        this.strokes = res.data?.strokes || []
        // 数据注入公共书写板（参考字 + 笔画）
        this.pad.setCharacter(this.character?.character || '')
        this.pad.loadStrokes(this.strokes)
      } catch (e) {
        this.error = e.message
        this.character = null
        this.strokes = []
      }
    },

    // 计算下一个 stroke_order（max+1，服务端权威）
    nextStrokeOrder() {
      if (this.strokes.length === 0) return 1
      return Math.max(...this.strokes.map(s => s.stroke_order)) + 1
    },

    // 本地新笔画保存到服务端（串行化，防止并发取到相同max+1）
    onStrokeRecorded(localStroke) {
      this.saveQueue = this.saveQueue.then(() => this.saveStroke(localStroke))
      return this.saveQueue
    },

    async saveStroke(localStroke) {
      this.isSaving = true
      try {
        const res = await api.post(
          `/api/characters/${this.character.id}/strokes`, {
            stroke_order: this.nextStrokeOrder(),
            stroke_type: 0,              // 0 = 未指定（数字编码）
            trajectory_data: localStroke.trajectory_data   // 仅坐标点数据
          })
        // 保存期间该笔画被撤销（画布已移除）→ 服务端补删，保持一致性
        if (this.cancelledLocalIds.has(localStroke.id)) {
          await api.delete(`/api/characters/${this.character.id}/strokes/${res.data.id}`)
          this.cancelledLocalIds.delete(localStroke.id)
          return true
        }
        this.strokes.push(res.data)
        // 回发书写板: 用服务端数据替换本地pending项
        this.pad.confirmStrokeSaved(localStroke.id, res.data)
        return true
      } catch (e) {
        this.error = e.message
        this.cancelledLocalIds.delete(localStroke.id)   // 保存失败无需补删，清理标记
        return false
      } finally {
        this.isSaving = false
      }
    },

    // 画布撤销/清空时回调的删除请求
    onStrokeRemoveRequest({ strokeId }) {
      if (typeof strokeId === 'string' && strokeId.startsWith('local-')) {
        this.cancelledLocalIds.add(strokeId)   // 本地pending：标记，保存完成时补删
        return
      }
      this.deleteStroke(strokeId)
    },

    async deleteStroke(strokeId) {
      try {
        await api.delete(`/api/characters/${this.character.id}/strokes/${strokeId}`)
        this.strokes = this.strokes.filter(s => s.id !== strokeId)
        this.pad.removeStroke(strokeId)   // 书写板同步移除
      } catch (e) {
        this.error = e.message
      }
    },

    // ---- 笔画列表: 拖拽排序 ----
    dragIndex: null,               // 拖拽中的源索引（-1 表示未拖拽）

    onStrokeDragStart(event, stroke) {
      this.dragIndex = this.strokes.findIndex(s => s.id === stroke.id)
      if (this.dragIndex === -1) return
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(stroke.id))
      // 拖拽期间禁止其他行触发 hover 高亮
      this.pad.onStrokeHover(null)
    },

    onStrokeDragOver(event, stroke) {
      event.preventDefault()       // 允许放置
      event.dataTransfer.dropEffect = 'move'
    },

    onStrokeDrop(event, targetStroke) {
      event.preventDefault()
      if (this.dragIndex === null || this.dragIndex === -1) return
      const targetIndex = this.strokes.findIndex(s => s.id === targetStroke.id)
      if (targetIndex === -1 || this.dragIndex === targetIndex) return

      // 本地重排（先刷新 UI）
      const arr = [...this.strokes]
      const [moved] = arr.splice(this.dragIndex, 1)
      arr.splice(targetIndex, 0, moved)
      this.strokes = arr
      this.dragIndex = null
      this.pad.onStrokeHover(null)

      // 保存到服务端
      this.saveReorder(arr.map(s => s.id))
    },

    onStrokeDragEnd() {
      this.dragIndex = null
      this.pad.onStrokeHover(null)
    },

    // ---- 笔画列表: 上移/下移（移动端触摸无 HTML5 拖拽，提供按钮排序） ----
    moveStroke(stroke, dir) {
      if (this.padMode !== 'write') return
      const idx = this.strokes.findIndex(s => s.id === stroke.id)
      const target = idx + dir
      if (idx === -1 || target < 0 || target >= this.strokes.length) return
      const arr = [...this.strokes]
      const [moved] = arr.splice(idx, 1)
      arr.splice(target, 0, moved)
      this.strokes = arr
      this.pad.onStrokeHover(null)
      this.saveReorder(arr.map(s => s.id))
    },

    async saveReorder(strokeIds) {
      try {
        const res = await api.post(
          `/api/characters/${this.character.id}/strokes/reorder`, { strokeIds })
        this.strokes = res.data || this.strokes
        // 书写板与回放数据同步刷新
        this.pad.loadStrokes(this.strokes)
      } catch (e) {
        this.error = e.message
        // 失败回滚: 重新从服务端加载
        this.loadCharacter({ id: this.character.id })
      }
    },

    // ---- 笔画列表: 修改笔画类型 ----
    async updateStrokeType(stroke, newType) {
      const code = Number(newType)          // select value 为字符串数字，转为数字编码
      if (!Number.isInteger(code) || stroke.stroke_type === code) return
      try {
        const res = await api.patch(
          `/api/characters/${this.character.id}/strokes/${stroke.id}`,
          { stroke_type: code })
        const idx = this.strokes.findIndex(s => s.id === stroke.id)
        if (idx !== -1) this.strokes[idx] = res.data
      } catch (e) {
        this.error = e.message
      }
    }
  }))
}
