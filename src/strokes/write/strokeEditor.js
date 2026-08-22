// ============ 书写页编排组件（持有后端状态；组合公共书写板组件） ============
// 职责: 汉字信息/笔画列表的服务端同步（API 耦合留在此层）
//   - 组合 src/components/StrokePad.js（公共书写板，零后端耦合）
//   - 通过 padOpts 回调接收书写板输出（录入笔画/悬停/模式/回放进度）
//   - 通过 $refs.pad 调用书写板实例方法注入数据（loadStrokes/setZi/setMode...）
import Alpine from 'alpinejs'
import { api } from '@services/api.js'
import { createSyncClient } from '@services/syncClient.js'
import { STROKE_TYPE_GROUPS, strokeTypesMap } from '@components/StrokeTypes.js'
import { ZI_STRUCTURES, structureLabel } from '@components/ZiStructures.js'
import { takeBackUrl } from '@services/session.js'
import { numberToSymbolTonePinyin } from '@services/pinyin.js'
import { STROKE_REF_URL, ZDIC_URL } from '../../config.js'

export function registerStrokeEditor() {
  Alpine.data('strokeEditor', () => ({
    zi: null,
    strokes: [],
    STROKE_TYPE_GROUPS: STROKE_TYPE_GROUPS,   // 类型下拉按组分类（横/竖/撇/捺/折等）
    strokeTypesMap: strokeTypesMap,
    ZI_STRUCTURES: ZI_STRUCTURES,
    structureLabel: structureLabel,           // 结构显示文本（含示例）
    symbolPinyin: numberToSymbolTonePinyin,   // 数字声调拼音 → 符号声调
    saveQueue: Promise.resolve(),
    cancelledLocalIds: new Set(),
    error: null,
    redrawStroke: null,                   // 重绘目标笔画（列表保留并高亮，画布移除）
    redoStack: [],                        // 撤销/删除的笔画备份（重做恢复）
    clearedStrokes: [],                   // 清空时备份的全部笔画（支持恢复）
    isDeleting: 0,                        // 进行中的笔画删除数（重做需等删除完成，避免竞争）
    _lastOp: null,                        // 最近一次操作: draw | remove | delete | clear | redo | restore | reorder
    sync: null,                          // 多端同步客户端
    _remoteConfig: false,                // 远端配置回显标志（防广播回环）
    _pendingWidth: null,                 // pad 未就绪时暂存的远端笔宽

    // 触摸设备检测: 移动端无 HTML5 拖拽，列表排序改用上移/下移按钮
    isTouch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,

    // ---- 书写板联动状态（经 strokePad 回调同步） ----
    padMode: 'write',                    // strokePad 当前模式
    playbackActiveStrokeId: null,        // 回放正在绘制的笔画 id（列表联动高亮）
    selectedStrokeId: null,              // 书写/回放模式点击选中的笔画（画布置顶高亮/单笔播放）

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
        onStrokeRemoveRequest: (p) => this.onStrokeRemoveRequest(p),
        onStrokeClearAll: (strokes) => this.onStrokeClearAll(strokes),
        onStrokeHover: (strokeId) => this.hoverStroke(strokeId),
        onModeChanged: (mode) => this.onPadModeChanged(mode),
        onPlaybackProgress: (p) => this.onPlaybackProgress(p),
        onPlaybackToggle: (t) => this.onPlaybackToggle(t),
        onPenWidthChange: (w) => this.onPenWidthChange(w)
      }
      // 书写页独立加载: 从 URL ?zi= 解析目标汉字
      const zi = new URLSearchParams(window.location.search).get('zi')
      if (zi) this.loadZi({ zi: zi })
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
      const currentId = () => (typeof this.zi?.id === 'number' ? this.zi.id : null)
      // 他端写入了该字笔画 → 重新加载（服务端为权威状态）
      sync.on('strokes-changed', (p) => {
        const id = currentId()
        if (id !== null && Number(p.ziId) === id) {
          this.loadZi({ id })
        }
      })
      // 他端修改了该字信息（结构等）→ 重新加载
      sync.on('zi-updated', (p) => {
        const id = currentId()
        if (id !== null && Number(p.id) === id) {
          this.loadZi({ id })
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

    // 返回进入前的页面（入口页面写入返回地址: 笔画管理列表 / 汉字信息页等）；
    // 无记录时回退浏览器历史，再回退首页
    goBack() {
      const stored = takeBackUrl()
      if (stored) {
        this.sync?.emit('navigate', { url: stored })
        location.href = stored
        return
      }
      if (window.history.length > 1) {
        history.back()
        return
      }
      const url = '/'
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

    // 书写模式: 点击列表行选中/取消选中该笔画（画布置顶高亮）
    selectStroke(stroke) {
      if (this.padMode !== 'write') return
      const id = stroke?.id
      this.selectedStrokeId = this.selectedStrokeId === id ? null : id
      this.pad?.setSelectedStroke(this.selectedStrokeId)
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
      }
    },

    // 笔触宽度变化（广播给其他端同步；远端回显不重发）
    onPenWidthChange(width) {
      if (!this._remoteConfig) {
        this.sync?.emit('pen-width', { width })
      }
    },

    // strokePad 回放进度（列表联动高亮正在绘制的笔画；不参与多端同步）
    onPlaybackProgress({ strokeId }) {
      this.playbackActiveStrokeId = strokeId ?? null
    },

    // 判断某笔画在回放中是否已完成（列表淡化 + 与进度指示器状态一致）
    isPlaybackCompleted(strokeId) {
      if (this.padMode !== 'playback') return false
      const idx = this.pad?.playbackStrokes.findIndex(s => s.id === strokeId) ?? -1
      return idx >= 0 && this.indicatorState(idx) === 'done'
    },

    // 结构编辑（唯一可编辑字段，其余只读）
    async updateZiStructure(zi, structure) {
      const code = Number(structure)
      if (!Number.isInteger(code) || zi.structure === code) return
      try {
        const res = await api.patch(`/api/zi/${zi.id}`, { structure: code })
        this.zi = res.data || this.zi
      } catch (e) {
        this.error = e.message
      }
    },

    // 部首编辑（同步后端）
    async updateRadical(zi, radical) {
      const value = String(radical || '').trim()
      if (zi.radical === value) return
      try {
        const res = await api.patch(`/api/zi/${zi.id}`, { radical: value })
        this.zi = res.data || this.zi
      } catch (e) {
        this.error = e.message
      }
    },

    // ---- 笔顺参考图（汉典网楷体笔顺图） ----
    showStrokeRef: false,        // 是否展开笔顺参考图
    strokeRefError: false,       // 图加载失败（离线/外链被拦）

    // 汉典网该字信息页链接（https://zdic.net/hans/{汉字}）
    get zdicUrl() {
      if (!this.zi?.zi) return ''
      return `${ZDIC_URL}hans/${encodeURIComponent(this.zi.zi)}`
    },

    // 笔顺参考图 URL: 汉典网楷体笔顺图，{unicode} 为汉字 Unicode 码点十六进制大写（如 永 → 6C38）
    get strokeRefUrl() {
      if (!this.zi?.zi) return ''
      const unicode = this.zi.zi.codePointAt(0).toString(16).toUpperCase()
      return STROKE_REF_URL.replace('{unicode}', unicode)
    },

    toggleStrokeRef() {
      this.showStrokeRef = !this.showStrokeRef
      this.strokeRefError = false
    },

  // 加载汉字: 支持 { id }（列表选中）、{ zi }（URL ?zi= 直达）或裸 id
  async loadZi(target) {
    try {
      let res
      if (typeof target === 'number') {
        res = await api.get(`/api/zi/${target}`)
      } else if (target?.id) {
        res = await api.get(`/api/zi/${target.id}`)
      } else if (target?.zi) {
        res = await api.get(`/api/zi/by-zi/${encodeURIComponent(target.zi)}`)
      } else {
        // 防御: 参数无效时静默（不打断同步流程），仅记录
        console.warn('[strokeEditor] loadZi 收到无效参数:', target)
        return
      }
      this.zi = res.data || null
      this.strokes = res.data?.strokes || []
      // 数据重载后清空重绘状态（目标笔画可能已变化）
      // 注意: 不清空重做栈与清空备份 —— 本端写操作（撤销/删除/清空）会触发服务端
      // 广播回环重载，若清空则重做/恢复永远不可用；恢复与重做对笔顺冲突有兜底处理
      this.redrawStroke = null
      this._lastOp = null
      // 数据注入公共书写板（参考字 + 笔画）
      this.pad.setZi(this.zi?.zi || '')
      this.pad.loadStrokes(this.strokes)
    } catch (e) {
      this.error = e.message
      this.zi = null
      this.strokes = []
    }
  },

    // 计算下一个 stroke_order（max+1，服务端权威）
    nextStrokeOrder() {
      if (this.strokes.length === 0) return 1
      return Math.max(...this.strokes.map(s => s.stroke_order)) + 1
    },

    // 本地新笔画保存到服务端（串行化，防止并发取到相同max+1）
    // 重绘模式: 直接覆盖目标笔画的轨迹（不删除笔画重来）
    onStrokeRecorded(localStroke) {
      if (this.redrawStroke) {
        this.saveQueue = this.saveQueue.then(() => this.saveRedraw(localStroke))
      } else {
        this.saveQueue = this.saveQueue.then(() => this.saveStroke(localStroke))
      }
      return this.saveQueue
    },

    // ---- 重绘单笔: 列表保留该笔画并高亮（隐藏其重绘/删除按钮与类型下拉框），
    //      同时从画布中移除，重绘后替换其轨迹，取消则恢复画布显示 ----
    startRedraw(stroke) {
      if (this.padMode !== 'write') return
      this.redrawStroke = stroke
      // 仅从画布移除（列表保留），供直接在画布上重写
      this.pad.removeStroke(stroke.id)
    },

    // 取消重绘: 清除重绘期间可能已绘制的临时笔画，并恢复画布中原笔画
    cancelRedraw() {
      const s = this.redrawStroke
      if (!s) return
      this.redrawStroke = null
      // 清除重绘期间已绘制但未保存的临时笔画（local- 前缀）
      for (const p of this.pad.strokes) {
        if (typeof p.id === 'string' && p.id.startsWith('local-')) {
          this.pad.removeStroke(p.id)
        }
      }
      // 恢复画布显示（列表中的原笔画仍在）
      this.pad.loadStrokes(this.strokes)
    },

    async saveRedraw(localStroke) {
      const target = this.redrawStroke
      if (!target) return false
      try {
        // 用户在保存完成前撤销了重绘笔画 → 仅清理画布，不做覆盖
        if (this.cancelledLocalIds.has(localStroke.id)) {
          this.cancelledLocalIds.delete(localStroke.id)
          this.pad.removeStroke(localStroke.id)
          return true
        }
        const res = await api.patch(
          `/api/zi/${this.zi.id}/strokes/${target.id}`,
          { trajectory_data: localStroke.trajectory_data })
        // 用新轨迹替换本地旧笔画（保持原位与笔顺）
        const idx = this.strokes.findIndex(s => s.id === target.id)
        if (idx !== -1) this.strokes[idx] = res.data
        // 移除画布上的临时笔画并刷新显示
        this.pad.removeStroke(localStroke.id)
        this.pad.loadStrokes(this.strokes)
        this.redrawStroke = null
        this._lastOp = 'draw'
        return true
      } catch (e) {
        this.error = e.message
        return false
      }
    },

    // ---- 撤销/重做/清空/恢复 状态（启用、禁用一致且互斥） ----
    // 撤销: 移除画布最后一笔（进重做栈）。上一次为「删除」时禁用（用重做恢复）。
    canUndo() {
      if (this.padMode !== 'write') return false
      if (this.clearedStrokes.length > 0 && this.strokes.length === 0) return false   // 清空待恢复态
      if (this._lastOp === 'delete') return false                                     // 删除由重做恢复
      return this.pad.strokes.length > 0
    },

    // 重做: 恢复最近一次被移除的笔画（撤销或删除均可恢复）
    canRedo() {
      if (this.padMode !== 'write') return false
      if (this.redrawStroke) return false                        // 重绘期间互斥
      if (this.clearedStrokes.length > 0 && this.strokes.length === 0) return false   // 清空待恢复态
      return this.redoStack.length > 0 && this.isDeleting === 0
    },

    // 清空: 画布有笔画且不在清空待恢复态/重绘态
    canClear() {
      if (this.padMode !== 'write') return false
      if (this.redrawStroke) return false
      if (this.clearedStrokes.length > 0 && this.strokes.length === 0) return false
      return this.pad.strokes.length > 0
    },

    // 恢复: 仅清空待恢复态可用（清空后列表为空且删除已完成）
    canRestore() {
      return this.padMode === 'write' && this.clearedStrokes.length > 0
        && this.strokes.length === 0 && this.isDeleting === 0
    },

    // 撤销入口: 经编辑器判断状态后调用书写板撤销（移除画布最后一笔）
    undoStroke() {
      if (!this.canUndo()) return
      this.pad.undo()
    },

    // ---- 重做: 反向处理撤销（恢复最近一次撤销/删除的笔画） ----
    async redo() {
      if (!this.canRedo()) return
      const s = this.redoStack[this.redoStack.length - 1]
      // 原笔顺可能已被占用 → 顺延新笔顺
      const order = this.strokes.some(x => x.stroke_order === s.stroke_order)
        ? this.nextStrokeOrder() : s.stroke_order
      try {
        const res = await api.post(`/api/zi/${this.zi.id}/strokes`, {
          stroke_order: order,
          stroke_type: s.stroke_type,
          trajectory_data: s.trajectory_data
        })
        this.redoStack.pop()
        this.strokes.push(res.data)
        // 按笔顺排序显示，保持列表与后端顺序一致
        this.strokes.sort((a, b) => a.stroke_order - b.stroke_order)
        this.pad.loadStrokes(this.strokes)
        this._lastOp = 'redo'
      } catch (e) {
        this.error = e.message
      }
    },

    // ---- 清空全部: 备份全部笔画（支持恢复），再逐笔删除 ----
    onStrokeClearAll(strokes) {
      this.clearedStrokes = [...(strokes || [])]
      this.redoStack = []
      this.redrawStroke = null
      this._lastOp = 'clear'
      for (const s of this.clearedStrokes) {
        this.deleteStroke(s.id)
      }
    },

    // 恢复清空的笔画（批量重建，保持原笔顺）
    async restoreCleared() {
      if (!this.canRestore()) return
      const strokes = this.clearedStrokes.map(s => ({
        stroke_order: s.stroke_order,
        stroke_type: s.stroke_type,
        trajectory_data: s.trajectory_data
      }))
      try {
        const res = await api.post(`/api/zi/${this.zi.id}/strokes/batch`, { strokes })
        this.strokes = (res.data || []).slice().sort((a, b) => a.stroke_order - b.stroke_order)
        this.pad.loadStrokes(this.strokes)
        this.clearedStrokes = []
        this._lastOp = 'restore'
      } catch (e) {
        this.error = e.message
      }
    },

    async saveStroke(localStroke) {
      try {
        const res = await api.post(
          `/api/zi/${this.zi.id}/strokes`, {
            stroke_order: this.nextStrokeOrder(),
            stroke_type: 0,              // 0 = 未指定（数字编码）
            trajectory_data: localStroke.trajectory_data   // 仅坐标点数据
          })
        // 保存期间该笔画被撤销（画布已移除）→ 服务端补删，保持一致性
        if (this.cancelledLocalIds.has(localStroke.id)) {
          await api.delete(`/api/zi/${this.zi.id}/strokes/${res.data.id}`)
          this.cancelledLocalIds.delete(localStroke.id)
          return true
        }
        this.strokes.push(res.data)
        // 回发书写板: 用服务端数据替换本地pending项
        this.pad.confirmStrokeSaved(localStroke.id, res.data)
        // 新笔画保存后清空重做栈与清空备份（重做/恢复仅针对紧随其后的操作）
        this.redoStack = []
        this.clearedStrokes = []
        this._lastOp = 'draw'
        return true
      } catch (e) {
        this.error = e.message
        this.cancelledLocalIds.delete(localStroke.id)   // 保存失败无需补删，清理标记
        return false
      }
    },

    // 画布撤销/行内删除时回调的删除请求
    // reason: 'undo'（撤销触发，恢复由重做处理）| 'delete'（行内删除，同样可由重做恢复）
    onStrokeRemoveRequest({ strokeId, reason }) {
      if (typeof strokeId === 'string' && strokeId.startsWith('local-')) {
        this.cancelledLocalIds.add(strokeId)   // 本地pending：标记，保存完成时补删
        return
      }
      this._lastOp = reason === 'delete' ? 'delete' : 'remove'
      // 备份已保存笔画（供重做恢复: 撤销与行内删除均可恢复）
      const s = this.strokes.find(x => x.id === strokeId)
      if (s) this.redoStack.push(s)
      this.deleteStroke(strokeId)
    },

    async deleteStroke(strokeId) {
      this.isDeleting++
      try {
        await api.delete(`/api/zi/${this.zi.id}/strokes/${strokeId}`)
        this.strokes = this.strokes.filter(s => s.id !== strokeId)
        this.pad.removeStroke(strokeId)   // 书写板同步移除
      } catch (e) {
        this.error = e.message
      } finally {
        this.isDeleting--
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
          `/api/zi/${this.zi.id}/strokes/reorder`, { strokeIds })
        this.strokes = res.data || this.strokes
        // 重排后重做栈失效
        this.redoStack = []
        this._lastOp = 'reorder'
        // 书写板与回放数据同步刷新
        this.pad.loadStrokes(this.strokes)
      } catch (e) {
        this.error = e.message
        // 失败回滚: 重新从服务端加载
        this.loadZi({ id: this.zi.id })
      }
    },

    // ---- 笔画列表: 修改笔画类型 ----
    async updateStrokeType(stroke, newType) {
      const code = Number(newType)          // select value 为字符串数字，转为数字编码
      if (!Number.isInteger(code) || stroke.stroke_type === code) return
      try {
        const res = await api.patch(
          `/api/zi/${this.zi.id}/strokes/${stroke.id}`,
          { stroke_type: code })
        const idx = this.strokes.findIndex(s => s.id === stroke.id)
        if (idx !== -1) this.strokes[idx] = res.data
      } catch (e) {
        this.error = e.message
      }
    }
  }))
}
