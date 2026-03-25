import './index.css';

class MessageManager {
  constructor() {
    this.container = null;
    this.messages = new Map(); // 存储每个消息的定时器
    this.init();
  }

  init() {
    // 创建容器（如果不存在）
    if (!document.querySelector('.global-message-container')) {
      const container = document.createElement('div');
      container.className =
        'global-message-container fixed top-4 right-4 z-50 flex flex-col gap-3 w-80 max-w-full';
      // 移动端样式覆盖
      if (window.innerWidth <= 640) {
        container.classList.add('left-0', 'right-0', 'mx-3', 'top-3');
        container.classList.remove('right-4');
      }
      document.body.appendChild(container);
      this.container = container;

      // 监听窗口大小变化，动态调整样式
      window.addEventListener('resize', () => {
        const isMobile = window.innerWidth <= 640;
        if (isMobile) {
          this.container.classList.add('left-0', 'right-0', 'mx-3', 'top-3');
          this.container.classList.remove('right-4');
        } else {
          this.container.classList.remove('left-0', 'right-0', 'mx-3', 'top-3');
          this.container.classList.add('right-4');
        }
      });
    } else {
      this.container = document.querySelector('.global-message-container');
    }
  }

  /**
   * 显示消息
   * @param {Object} options
   * @param {string} options.type - 类型: success, error, warning, info
   * @param {string} options.message - 消息文本
   * @param {number} [options.duration=3000] - 持续时间(ms)，设为0则不自动消失
   * @param {boolean} [options.showClose=true] - 是否显示关闭按钮
   */
  show(options) {
    const {
      type = 'info',
      message,
      duration = 3000,
      showClose = true
    } = options;
    if (!message) return;

    // 创建消息元素
    const msgEl = this.createMessageElement(type, message, showClose);
    this.container.appendChild(msgEl);

    // 入场动画
    msgEl.classList.add('message-enter');

    // 设置自动消失
    let timer = null;
    if (duration > 0) {
      timer = setTimeout(() => {
        this.close(msgEl);
      }, duration);
      this.messages.set(msgEl, timer);
    }

    // 关闭按钮事件
    const closeBtn = msgEl.querySelector('.message-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.close(msgEl);
      });
    }

    // 鼠标悬停时暂停自动消失（如果设置了定时器）
    if (timer) {
      msgEl.addEventListener('mouseenter', () => {
        if (this.messages.has(msgEl)) {
          clearTimeout(this.messages.get(msgEl));
          this.messages.delete(msgEl);
        }
      });
      msgEl.addEventListener('mouseleave', () => {
        // 重新设置定时器
        const newTimer = setTimeout(() => {
          this.close(msgEl);
        }, duration);
        this.messages.set(msgEl, newTimer);
      });
    }
  }

  /**
   * 创建单个消息DOM
   */
  createMessageElement(type, message, showClose) {
    const bgColors = {
      success: 'bg-green-50 border-green-300 text-green-800',
      error: 'bg-red-50 border-red-300 text-red-800',
      warning: 'bg-yellow-50 border-yellow-300 text-yellow-800',
      info: 'bg-blue-50 border-blue-300 text-blue-800'
    };
    const iconMap = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    const bgColor = bgColors[type] || bgColors.info;
    const icon = iconMap[type] || iconMap.info;

    const div = document.createElement('div');
    div.className = `message-item rounded-lg shadow-lg border p-4 flex items-start gap-3 ${bgColor} transition-all`;
    div.innerHTML = `
      <div class="flex-shrink-0 text-xl">${icon}</div>
      <div class="flex-1 text-sm break-words">${this.escapeHtml(message)}</div>
      ${showClose ? '<button class="message-close flex-shrink-0 text-gray-400 hover:text-gray-600 transition cursor-pointer" aria-label="关闭">✕</button>' : ''}
    `;
    return div;
  }

  /**
   * 关闭消息并移除
   */
  close(msgEl) {
    // 清除定时器
    if (this.messages.has(msgEl)) {
      clearTimeout(this.messages.get(msgEl));
      this.messages.delete(msgEl);
    }
    // 执行退出动画
    msgEl.classList.remove('message-enter');
    msgEl.classList.add('message-exit');
    // 动画结束后移除元素
    msgEl.addEventListener(
      'animationend',
      () => {
        if (msgEl.parentNode) {
          msgEl.remove();
        }
      },
      { once: true }
    );
  }

  /**
   * 简单的XSS防护
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

export const message = new MessageManager();
