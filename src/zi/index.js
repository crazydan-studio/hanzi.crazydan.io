import { render } from '#utils/render.js';

function getCharFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const char = (urlParams.get('v') || '').toLowerCase();

  return decodeURIComponent(char);
}

async function fetchCharMetaData(char) {
  const unicode = 'U+' + char.codePointAt(0).toString(16).toUpperCase();
  const resp = await fetch(`/assets/zi/${unicode}/meta.json`);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} - 无法获取汉字 “${char}” 的数据`);
  }

  return await resp.json();
}

// 全局动画控制变量
let animationFrameId = null;
let currentProgress = 0; // 0~1 动画进度
let animDuration = 2000; // 默认完整一圈2秒
let isPlaying = false;
let lastTimestamp = 0;
let speedFactor = 1.0; // 速度系数 0.5~3
let animationCycle = null; // 用于SMIL fallback，我们将采用canvas风格?但规定svg动画，我们采用js驱动svg描边动画: 动态构建一个笔画路径演示

const strokePathsDB = {
  中: [
    'M 60,30 L 60,90', // 竖
    'M 40,50 L 80,50', // 横折的横部分简略
    'M 80,50 L 80,70', // 竖折的竖
    'M 40,70 L 80,70' // 底横
  ],
  汉: [
    'M 40,40 L 70,40',
    'M 55,40 L 55,80',
    'M 40,70 L 70,70',
    'M 70,50 L 90,60',
    'M 80,60 L 70,80'
  ],
  字: [
    'M 45,30 L 75,30',
    'M 60,30 L 60,85',
    'M 40,50 L 80,50',
    'M 40,70 L 80,70',
    'M 50,85 L 70,85',
    'M 60,85 L 60,95'
  ]
};

// 通用fallback 生成简单笔画
function getStrokePathsForChar(char) {
  if (strokePathsDB[char]) return strokePathsDB[char];
  // 生成默认十字
  return ['M 40,50 L 80,50', 'M 60,30 L 60,80'];
}

// 创建SVG动画区域 (基于stroke-dashoffset动画，js驱动进度)
function createStrokeAnimationSVG(character, container, onReady) {
  const pathsData = getStrokePathsForChar(character);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.background = '#fef9e6';
  svg.style.borderRadius = '12px';
  svg.style.boxShadow = 'inset 0 0 0 1px #fde68a';

  // 存储所有路径元素及总长度
  const pathElements = [];
  const totalLengths = [];
  let cumulativeLen = 0;
  // 创建路径组，并设置初始stroke-dashoffset为全长
  pathsData.forEach((d, idx) => {
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#b45309');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    // 计算长度
    const len = path.getTotalLength();
    totalLengths.push(len);
    path.style.strokeDasharray = `${len} ${len}`;
    path.style.strokeDashoffset = len;
    path.style.transition = 'stroke-dashoffset 0s linear'; // 由js控制无transition
    svg.appendChild(path);
    pathElements.push(path);
  });

  // 更新动画进度的函数 (progress 0~1)
  function updateProgress(progress) {
    // 根据总长度占比，决定每笔画的偏移量
    let totalLen = totalLengths.reduce((a, b) => a + b, 0);
    let targetOffsetSum = totalLen * (1 - progress);
    let accumulated = 0;
    for (let i = 0; i < pathElements.length; i++) {
      const len = totalLengths[i];
      const startOffset = accumulated;
      const endOffset = startOffset + len;
      // 当前笔画所需展示的剩余部分: 如果 targetOffsetSum <= startOffset 则完全显示 (偏移0)
      // 如果 targetOffsetSum >= endOffset 则完全隐藏 (偏移len)
      let offset;
      if (targetOffsetSum <= startOffset) {
        offset = 0;
      } else if (targetOffsetSum >= endOffset) {
        offset = len;
      } else {
        offset = endOffset - targetOffsetSum;
      }
      pathElements[i].style.strokeDashoffset = offset;
      accumulated += len;
    }
  }

  // 重置动画进度为0 (完全隐藏)
  function resetProgress() {
    let totalLen = totalLengths.reduce((a, b) => a + b, 0);
    let offsetAll = totalLen;
    let accum = 0;
    for (let i = 0; i < pathElements.length; i++) {
      pathElements[i].style.strokeDashoffset = totalLengths[i];
      accum += totalLengths[i];
    }
    currentProgress = 0;
  }
  resetProgress();

  // 提供动画控制方法
  const animController = {
    setProgress: (p) => {
      let clamped = Math.min(1, Math.max(0, p));
      currentProgress = clamped;
      updateProgress(clamped);
    },
    getProgress: () => currentProgress,
    reset: () => animController.setProgress(0),
    complete: () => animController.setProgress(1),
    getTotalDuration: () => animDuration / speedFactor,
    setSpeed: (factor) => {
      speedFactor = factor;
    }
  };

  container.innerHTML = '';
  container.appendChild(svg);
  onReady(animController);
  return animController;
}

// 全局动画控制器
let currentAnimController = null;
let animLoopActive = false;
let animStartTime = 0;

function startAnimation(controller, durationMs, loop = true, speed = 1.0) {
  if (animLoopActive) cancelAnimationFrame(animationFrameId);
  const effectiveDuration = durationMs / speed;
  let startProgress = controller.getProgress();
  let startTime = performance.now();
  function step(now) {
    const elapsed = now - startTime;
    let newProgress = startProgress + elapsed / effectiveDuration;
    if (newProgress >= 1.0) {
      controller.setProgress(1.0);
      if (loop) {
        // 循环播放：重置到0继续
        startTime = now;
        startProgress = 0;
        controller.setProgress(0);
        animationFrameId = requestAnimationFrame(step);
      } else {
        animLoopActive = false;
        animationFrameId = null;
        isPlaying = false;
      }
    } else {
      controller.setProgress(newProgress);
      animationFrameId = requestAnimationFrame(step);
    }
  }
  animLoopActive = true;
  animationFrameId = requestAnimationFrame(step);
}

function stopAnimation() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  animLoopActive = false;
}

// 渲染主页面内容
async function renderDetailPage() {
  const char = getCharFromURL();
  const metadata = await fetchCharMetaData(char);

  const unicode = metadata.unicode;
  const glyphSvgUrl = metadata.glyph_svg || metadata.stroke_order_svg;

  // 准备详情html结构
  const contentHtml = `
                <div class="p-5 md:p-8">
                    <div class="flex flex-col lg:flex-row gap-8">
                        <div class="lg:w-1/2">
                            <div class="bg-amber-50 rounded-2xl p-4 border border-amber-200">
                                <div class="flex justify-center mb-4">
                                    <div class="w-36 h-36 md:w-44 md:h-44 bg-white rounded-xl shadow-md flex items-center justify-center border border-amber-200">
                                        <svg viewBox="0 0 120 120" width="100%" height="100%" style="background:#fff9ef;">
                                            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="64" font-family="KaiTi, '华文楷书', 'Noto Serif SC', serif" fill="#92400e">${metadata.value}</text>
                                        </svg>
                                    </div>
                                </div>
                                <div class="mt-2 bg-white p-3 rounded-xl">
                                    <div class="flex flex-wrap gap-3 justify-center items-center">
                                        <div class="flex gap-2">
                                            <button id="playAnimBtn" class="bg-amber-600 hover:bg-amber-700 text-white px-4 py-1.5 rounded-full text-sm flex items-center gap-1">▶ 播放</button>
                                            <button id="pauseAnimBtn" class="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-1.5 rounded-full text-sm">⏸ 暂停</button>
                                            <button id="resetAnimBtn" class="border border-amber-300 text-amber-700 px-3 py-1.5 rounded-full text-sm">⟳ 重置</button>
                                        </div>
                                        <div class="flex items-center gap-2 text-sm">
                                            <span class="text-gray-600">速度</span>
                                            <input type="range" id="speedSlider" min="0.5" max="3" step="0.05" value="1" class="w-28">
                                            <span id="speedValue" class="w-10 text-amber-700">1.0x</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="lg:w-1/2 space-y-4">
                            <div class="bg-white rounded-xl p-4 border border-amber-200">
                                <div class="flex flex-wrap justify-between items-center gap-2">
                                    <h2 class="text-4xl font-bold text-amber-800">${metadata.value}</h2>
                                    <div class="flex gap-2 text-xs">
                                        <a href="https://www.zdic.net/hans/${encodeURIComponent(metadata.value)}" target="_blank" class="bg-amber-100 text-amber-800 px-2 py-1 rounded-full">🔗 汉典网详情</a>
                                    </div>
                                </div>
                                <div class="grid grid-cols-2 gap-3 mt-4">
                                    <div><span class="text-gray-500">汉字：</span><span id="charVal" class="bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl px-2">${metadata.value}</span> <button id="copyCharBtn" class="ml-1 text-amber-500 text-xs underline">复制</button></div>
                                    <div class="col-span-2"><span class="text-gray-500">拼音：</span><span id="pinyinValues" class="font-mono"></span></div>
                                    <div><span class="text-gray-500">部首：</span><span id="radicalVal" class="bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl px-2">${metadata.radical}</span> <button id="copyRadicalBtn" class="ml-1 text-amber-500 text-xs underline">复制</button></div>
                                    <div><span class="text-gray-500">笔画数：</span>${metadata.stroke_count}</div>
                                    <div><span class="text-gray-500">结构：</span>${metadata.struct}</div>
                                    <div><span class="text-gray-500">Unicode：</span><span id="unicodeVal">${metadata.unicode}</span> <button id="copyUnicodeBtn" class="ml-1 text-amber-500 text-xs underline">复制</button></div>
                                </div>
                            </div>
                            <div class="bg-white rounded-xl p-4 border border-amber-200">
                                <div class="flex justify-between items-center">
                                    <h3 class="font-bold text-amber-800">🖌️ 笔画分解</h3>
                                    <div class="flex gap-2 text-xs">
                                        <a href="https://www.strokeorder.com/chinese/${encodeURIComponent(metadata.value)}" target="_blank" class="bg-amber-100 text-amber-800 px-2 py-1 rounded-full">🔗 StrokeOrder.com 笔顺图</a>
                                    </div>
                                </div>
                                <div id="strokeOrderSteps" class="grid grid-cols-4 gap-2 mt-3"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

  const loadingDiv = document.getElementById('loadingPlaceholder');
  const dynamicDiv = document.getElementById('dynamicContent');
  if (loadingDiv) loadingDiv.classList.add('hidden');
  dynamicDiv.classList.remove('hidden');
  dynamicDiv.innerHTML = contentHtml;

  const spells = metadata.spells;
  document.getElementById('pinyinValues').innerHTML = spells
    .map((s) => {
      return (
        `<span><span class="bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl px-2">${s.value}</span><button id="copyPinyinBtn" class="ml-1 text-amber-500 text-xs underline">复制</button>` +
        (s.audio
          ? `<audio class="text-amber-500" src="https://img.zdic.net/audio/zd/py/${encodeURIComponent(s.value)}.mp3">🔊</audio>`
          : '') +
        '</span>'
      );
    })
    .join(' / ');

  // 复制功能
  const copy = (text, label) => {
    navigator.clipboard
      .writeText(text)
      .then(() => alert(`✅ ${label} 已复制`))
      .catch(() => alert('复制失败'));
  };
  document
    .getElementById('copyCharBtn')
    ?.addEventListener('click', () => copy(metadata.value, '汉字'));
  document
    .getElementById('copyRadicalBtn')
    ?.addEventListener('click', () => copy(metadata.radical, '部首'));
  document
    .getElementById('copyUnicodeBtn')
    ?.addEventListener('click', () => copy(metadata.unicode, 'Unicode'));
  document
    .getElementById('copyPinyinBtn')
    ?.addEventListener('click', () =>
      copy(spells.map((s) => s.value).join('/'), '拼音')
    );

  // 笔画拆解: 显示静态笔画顺序 (模拟基于笔画数)
  const strokeStepsDiv = document.getElementById('strokeOrderSteps');
  const strokesCount = metadata.stroke_count;
  const stepsHtml = [];
  for (let i = 1; i <= strokesCount; i++) {
    stepsHtml.push(
      `<div class="stroke-step bg-amber-50 rounded-lg p-2 text-center text-sm border border-amber-200">${i}</div>`
    );
  }
  strokeStepsDiv.innerHTML = stepsHtml.join('');

  // 初始化书写动画SVG
  const animContainer = document.getElementById('strokeAnimationContainer');
  if (animContainer) {
    createStrokeAnimationSVG(metadata.value, animContainer, (controller) => {
      currentAnimController = controller;
      // 默认重置进度并开始循环播放?
      controller.setProgress(0);
      // 绑定控件
      const playBtn = document.getElementById('playAnimBtn');
      const pauseBtn = document.getElementById('pauseAnimBtn');
      const resetBtn = document.getElementById('resetAnimBtn');
      const speedSlider = document.getElementById('speedSlider');
      const speedSpan = document.getElementById('speedValue');
      let currentAnimLoop = false;
      let currentAnimId = null;
      function stopCurrent() {
        if (currentAnimId) cancelAnimationFrame(currentAnimId);
        currentAnimId = null;
        currentAnimLoop = false;
      }
      function startLoopWithSpeed(speed) {
        stopCurrent();
        const dur = 2000; // 完整动画2秒
        const effectiveDur = dur / speed;
        let startProgress = controller.getProgress();
        let startTime = performance.now();
        function step(now) {
          const elapsed = now - startTime;
          let newProgress = startProgress + elapsed / effectiveDur;
          if (newProgress >= 1.0) {
            controller.setProgress(1);
            if (true) {
              // 循环
              startProgress = 0;
              startTime = now;
              controller.setProgress(0);
              currentAnimId = requestAnimationFrame(step);
            } else {
              currentAnimLoop = false;
              currentAnimId = null;
            }
          } else {
            controller.setProgress(newProgress);
            currentAnimId = requestAnimationFrame(step);
          }
        }
        currentAnimLoop = true;
        currentAnimId = requestAnimationFrame(step);
      }
      playBtn.addEventListener('click', () => {
        if (currentAnimId) stopCurrent();
        const speed = parseFloat(speedSlider.value);
        startLoopWithSpeed(speed);
      });
      pauseBtn.addEventListener('click', () => {
        if (currentAnimId) cancelAnimationFrame(currentAnimId);
        currentAnimId = null;
      });
      resetBtn.addEventListener('click', () => {
        if (currentAnimId) cancelAnimationFrame(currentAnimId);
        controller.setProgress(0);
        currentAnimId = null;
      });
      speedSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        speedSpan.innerText = val.toFixed(1) + 'x';
        if (currentAnimId) {
          // 重启动画应用新速度
          const currProg = controller.getProgress();
          stopCurrent();
          const newSpeed = val;
          const dur = 2000;
          const effectiveDur = dur / newSpeed;
          let startProgress = currProg;
          let startTime = performance.now();
          function stepSpeed(now) {
            const elapsed = now - startTime;
            let newProg = startProgress + elapsed / effectiveDur;
            if (newProg >= 1) {
              controller.setProgress(1);
              if (true) {
                // 循环重置
                startProgress = 0;
                startTime = now;
                controller.setProgress(0);
                currentAnimId = requestAnimationFrame(stepSpeed);
              } else {
                currentAnimId = null;
              }
            } else {
              controller.setProgress(newProg);
              currentAnimId = requestAnimationFrame(stepSpeed);
            }
          }
          currentAnimId = requestAnimationFrame(stepSpeed);
        }
      });
      // 自动开始循环播放 (默认)
      startLoopWithSpeed(1.0);
    });
  }
}

renderDetailPage().catch((e) => {
  console.warn(e);
  document.getElementById('loadingPlaceholder').innerHTML =
    `<div class="text-red-500">加载失败：${e.message}</div>`;
});
