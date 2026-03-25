import { render } from '#utils/render.js';
import { getParamFromLocation } from '#utils/url.js';
import { getUnicode } from '#utils/char.js';
import { message } from '#utils/message/index.js';

const char = getParamFromLocation('v');

if (!char) {
  render(document.getElementById('template_charDetailInvalidURL'), {});
} else {
  const unicode = getUnicode(char);

  fetch(`/assets/zi/${unicode}/meta.json`)
    .then((resp) => {
      if (!resp.ok) {
        if (resp.status == 404) {
          throw new Error(`汉字 “${char}” 不存在或未收录`);
        } else {
          throw new Error(
            `HTTP ${resp.status} - 无法获取汉字 “${char}” 的数据`
          );
        }
      }
      return resp.json();
    })
    .then((char) => {
      renderCharDetail(char);
    })
    .catch((e) => {
      render(document.getElementById('template_charDetailNetError'), {
        msg: e.message || '无法获取汉字数据，请检查网络或稍后重试。'
      });
    });
}

function renderCharDetail(char) {
  const data = {
    ...char,
    glyph_svg: char.stroke_svg || char.glyph_svg,
    has_stroke: false
  };

  const doRender = () =>
    render(document.getElementById('template_charDetailCard'), data);

  if (char.stroke_svg) {
    fetch(`/assets/zi/${char.unicode}/${char.stroke_svg}`)
      .then((resp) => (resp.ok ? resp.text() : ''))
      .then((svg) => {
        data.stroke_svg = svg.replace(/<\?xml .+\?>/g, '');
        data.has_stroke = !!data.stroke_svg;

        if (data.has_stroke) {
          data.stroke_steps = Array.from(
            { length: data.stroke_count },
            (_, index) => {
              let svg = data.stroke_svg;

              for (let f = 0; f <= index; f++) {
                const id = `s-${f}`;
                const cls = f < index ? 'actived' : 'active';

                svg = svg.replace(
                  new RegExp(`(id="${id}")`),
                  `$1 class="${cls}"`
                );
              }
              return svg;
            }
          );
        }

        doRender();
      });
  } else {
    doRender();
  }
}

// -----------------------------------------------------------------------
window.$copyText = function (value) {
  navigator.clipboard
    .writeText(value)
    .then(() => {
      message.show({ type: 'success', message: '已复制' });
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
