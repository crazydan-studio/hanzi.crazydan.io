import { render } from '#utils/render.js';
import { convertSimpleCharData } from '#data/schema.mjs';

import '#index.css';

fetch('/assets/zi/commons.json')
  .then((resp) => {
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} - 无法获取常用字列表`);
    }
    return resp.json();
  })
  .then((chars) => {
    if (chars.length == 0) {
      render(document.getElementById('template_charGridEmpty'), {});
    } else {
      render(document.getElementById('template_charGridCard'), {
        chars: chars.map(convertSimpleCharData)
      });
    }
  })
  .catch((e) => {
    render(document.getElementById('template_charGridNetError'), {
      msg: e.message || '无法获取常用字列表，请检查网络或稍后重试。'
    });
  });
