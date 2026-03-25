import { render } from '#utils/render.js';
import { getParamFromLocation } from '#utils/url.js';
import { getUnicode } from '#utils/char.js';

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
  render(document.getElementById('template_charDetailCard'), {
    ...char,
    glyph_svg: char.stroke_svg || char.glyph_svg,
    onTextCopy: 'javascript:window.$copyCharText(arguments[0])'
  });
}

// -----------------------------------------------------------------------
window.$copyText = function (value) {
  navigator.clipboard
    .writeText(value)
    .then(() => alert(`✅ ${value} 已复制`))
    .catch((e) => console.error(e.message));
};

let currentAudio = null;
window.$playAudio = function (url) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  const audio = new Audio(url);
  audio.play().catch(console.error);
  currentAudio = audio;
};
