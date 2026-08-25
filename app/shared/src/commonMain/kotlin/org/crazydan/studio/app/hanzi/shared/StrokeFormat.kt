package org.crazydan.studio.app.hanzi.shared

/**
 * 笔画轨迹格式常量（与 web src/components/Constants.js、server/services/Trajectory.js 一致）:
 * 轨迹属性为单字符（v 版本 / b 笔刷面积比 / r 光栅实测盒 / p 坐标点）;
 * x/y 以背景汉字墨迹盒为坐标系分别归一化 ×1000（x 按盒宽、y 按盒高），
 * 压力 ×100、时间戳 ×10、笔刷面积比 ×100000 存整数
 */
object StrokeFormat {
    /** 轨迹格式版本（v2: 记录绘制时背景字光栅实测盒 r，见 server/services/Trajectory.js） */
    const val TRAJECTORY_VERSION = 2

    /** 内部坐标系尺寸（所有画布内部恒为 500×500，显示尺寸由宿主缩放） */
    const val INTERNAL_SIZE = 500

    /** 坐标归一化系数（盒相对坐标 ×1000 存整数） */
    const val COORD_SCALE = 1000f

    /** 压力归一化系数（0-1 ×100 存整数） */
    const val PRESSURE_SCALE = 100f

    /** 时间戳归一化系数（毫秒 ×10 存整数） */
    const val TIMESTAMP_SCALE = 10f

    /** 笔刷归一化系数（笔刷面积/背景字面积 比值 ×100000 存整数） */
    const val BRUSH_SCALE = 100000f

    /** 笔画间停顿（毫秒，与 web AnimationEngine strokeGap 一致） */
    const val STROKE_GAP_MS = 300f

    /** 缺省基准笔宽（内部坐标系像素，无笔刷数据时兜底） */
    const val BASE_WIDTH = 4f
}
