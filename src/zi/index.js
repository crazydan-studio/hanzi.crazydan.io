import { createTimeline } from 'animejs';

import '#utils/native.js';
import { render } from '#utils/render.js';
import { getParamFromLocation } from '#utils/url.js';
import { getUnicode } from '#utils/zi.js';
import { convertZiMetaData } from '#data/schema.js';

import { fetchZiGlyphAndStrokes } from '#zi/stroke.js';

import '#index.css';
import './index.css';

const zi = getParamFromLocation('v');

if (!zi) {
  render(document.getElementById('template_ziDetailInvalidURL'), {});
} else {
  render(document.getElementById('template_pageTitle'), {
    title: `【${zi}】字详情`
  });

  const unicode = getUnicode(zi);

  fetch(`/assets/zi/${unicode}/meta.json`)
    .then((resp) => {
      if (!resp.ok) {
        if (resp.status == 404) {
          throw new Error(`汉字【${zi}】不存在或未收录`);
        } else {
          throw new Error(
            `HTTP ${resp.status} - 无法获取汉字【${zi}】的数据`
          );
        }
      }
      return resp.json();
    })
    .then((meta) => {
      const data = { zi: convertZiMetaData(meta) };
      data.zi.unicode = unicode;

      render(document.getElementById('template_ziIssueFeedback'), {
        title: encodeURIComponent(`【问题字】【${data.zi.value}】`),
        issue: encodeURIComponent(
          `【${data.zi.value}】字存在以下问题或需做以下改进：\n\n`
        )
      });

      renderZiDetail(data);
    })
    .catch((e) => {
      render(document.getElementById('template_ziDetailNetError'), {
        msg: e.message || '无法获取汉字数据，请检查网络或稍后重试。'
      });
    });
}

function renderZiDetail({ zi }) {
  const doRender = (data) => {
    render(document.getElementById('template_ziDetailCard'), data);

    if (data.has_stroke) {
      initStrokeAnimDemo(document.getElementById('strokeAnim_Demo'));
    }
  };

  if (zi.glyph_type) {
    fetchZiGlyphAndStrokes(zi.unicode, zi.glyph_type).then((data) => {
      Object.assign(zi, data);

      doRender(zi);
    });
  } else {
    doRender(zi);
  }
}

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
