import { render } from '#utils/render.js';
import { getParamFromLocation } from '#utils/url.js';

const pinyin = getParamFromLocation('v').toLowerCase();

if (!pinyin) {
  render(document.getElementById('template_charGridInvalidURL'), {});
} else {
  render(document.getElementById('template_pageTitle'), {
    title: `拼音 “${pinyin}” 的汉字列表`
  });

  fetch(`/assets/pinyin/${pinyin}/data.json`)
    .then((resp) => {
      if (!resp.ok) {
        if (resp.status == 404) {
          throw new Error(`拼音 “${pinyin}” 不存在或未收录`);
        } else {
          throw new Error(
            `HTTP ${resp.status} - 无法获取拼音 “${pinyin}” 的数据`
          );
        }
      }
      return resp.json();
    })
    .then((chars) => {
      if (chars.length == 0) {
        render(document.getElementById('template_charGridEmpty'), {});
      } else {
        render(document.getElementById('template_charGridCard'), {
          chars
        });
      }
    })
    .catch((e) => {
      render(document.getElementById('template_charGridNetError'), {
        msg: e.message || '无法获取拼音字列表，请检查网络或稍后重试。'
      });
    });
}
