import { createTimeline } from 'animejs';

import { render } from '#utils/render.js';
import { getParamFromLocation } from '#utils/url.js';
import { getUnicode } from '#utils/char.js';
import { message } from '#utils/message/index.js';
import { convertCharMetaData, convertPinyinData } from '#data/schema.js';

import { genStrokeSteps } from '#zi/stroke.js';

import '#index.css';
import './index.css';

const char = getParamFromLocation('v');

if (!char) {
  render(document.getElementById('template_charDetailInvalidURL'), {});
} else {
  const unicode = getUnicode(char);

  fetch(`/assets/zi/${unicode}/meta.json`)
    .then((resp) => {
      if (!resp.ok) {
        if (resp.status == 404) {
          throw new Error(`汉字「${char}」不存在或未收录`);
        } else {
          throw new Error(
            `HTTP ${resp.status} - 无法获取汉字「${char}」的数据`
          );
        }
      }
      return resp.json();
    })
    .then((char) => {
      const data = { char: convertCharMetaData(char) };
      data.char.unicode = unicode;

      fetch('/assets/pinyin/data.json')
        .then((resp) => resp.json())
        .then((pinyins) => {
          data.pinyins = pinyins;
        })
        .finally(() => {
          renderCharDetail(data);
        });
    })
    .catch((e) => {
      render(document.getElementById('template_charDetailNetError'), {
        msg: e.message || '无法获取汉字数据，请检查网络或稍后重试。'
      });
    });
}

function renderCharDetail({ char, pinyins }) {
  const data = {
    ...char,
    spells: char.spells.map((s) => ({
      value: s,
      audio: convertPinyinData(pinyins[s]).audio
    })),
    glyph_svg: char.stroke_svg || char.glyph_svg,
    has_stroke: false,
    // Note: 仅用于支持模版嵌套注入数据
    stroke_anim_speed_label: '{{label}}'
  };

  const doRender = (anim) => {
    render(document.getElementById('template_charDetailCard'), data);

    if (anim) {
      initStrokeAnimDemo(document.getElementById('strokeAnim_Demo'));
    }
  };

  if (char.stroke_svg) {
    fetch(`/assets/zi/${char.unicode}/${char.stroke_svg}`)
      .then((resp) => (resp.ok ? resp.text() : ''))
      .then((svg) => {
        data.stroke_svg = svg.replace(/<\?xml .+\?>/g, '');
        data.has_stroke = !!data.stroke_svg;

        if (data.has_stroke) {
          data.stroke_steps = genStrokeSteps(data.stroke_svg);
        }

        doRender(data.has_stroke);
      });
  } else {
    doRender(false);
  }
}

// -----------------------------------------------------------------------
window.$copyText = function (value) {
  navigator.clipboard
    .writeText(value)
    .then(() => {
      message.show({ type: 'success', message: `「${value}」已复制` });
    })
    .catch((e) => {
      message.show({ type: 'error', message: '复制发生异常：' + e.message });
    });
};

let currentAudio = null;
window.$playAudio = function (url) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  const audio = new Audio(url);
  audio.play().catch((e) => {
    message.show({ type: 'error', message: '音频播放发生异常：' + e.message });
  });
  currentAudio = audio;
};

// -----------------------------------------------------------------------
function initStrokeAnimDemo($target) {
  const $strokes = $target.querySelectorAll('[role="glyph"] svg g[id^="s-"]');
  const resetStrokes = () => {
    $strokes.forEach(($stroke) => {
      for (let $frame of $stroke.children) {
        $frame.style.opacity = $frame.tagName.toLowerCase() == 'use' ? 0.05 : 0;
        $frame.style.fill = '#000';
      }
    });
  };

  const $playBtn = $target.querySelector('button[role="btn-play"]');
  const $stopBtn = $target.querySelector('button[role="btn-stop"]');
  const $speedBtn = $target.querySelector('input[role="btn-speed"]');

  let animStatus = 'wait';
  const updatePlayBtn = () => {
    switch (animStatus) {
      case 'wait':
      case 'pause':
      case 'complete':
        render(document.getElementById('template_strokeAnimPlayBtn'), {});
        break;
      case 'play':
        render(document.getElementById('template_strokeAnimPauseBtn'), {});
        break;
    }
  };
  updatePlayBtn();

  // https://animejs.com/documentation/timeline/timeline-playback-settings
  const t1 = createTimeline({
    defaults: {
      duration: 200,
      ease: 'linear'
    },
    autoplay: false,
    loop: false,
    onBegin: resetStrokes,
    // 手工触发结束，或者正常结束
    onComplete: () => {
      animStatus = 'complete';
      updatePlayBtn();
    }
  });

  $strokes.forEach(($stroke) => {
    const len = $stroke.children.length;
    for (let i = len - 1; i >= 0; i--) {
      const $frame = $stroke.children[i];
      t1.add($frame, {
        opacity: 1
      });
    }
  });

  $playBtn.onclick = () => {
    switch (animStatus) {
      case 'wait':
        t1.play();
        animStatus = 'play';
        break;
      case 'complete':
        t1.restart();
        animStatus = 'play';
        break;
      case 'pause':
        t1.resume();
        animStatus = 'play';
        break;
      case 'play':
        t1.pause();
        animStatus = 'pause';
        break;
    }

    updatePlayBtn();
  };
  $stopBtn.onclick = () => {
    t1.complete();
  };

  const updateAnimSpeed = (ratio) => {
    t1.speed = ratio;

    render(document.getElementById('template_strokeAnimSpeedLabel'), {
      label: ratio.toFixed(1) + 'x'
    });
  };
  $speedBtn.oninput = (e) => {
    const ratio = parseFloat(e.target.value);
    updateAnimSpeed(ratio);
  };
  updateAnimSpeed(1);
}
