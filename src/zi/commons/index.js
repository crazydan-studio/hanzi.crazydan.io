import { render } from '#utils/render.js';
import { convertPinyinZiData } from '#data/schema.js';

import '#index.css';

fetch('/assets/zi/commons.json')
  .then((resp) => {
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} - 无法获取常用字列表`);
    }
    return resp.json();
  })
  .then((data) => {
    if (data.length == 0) {
      render(document.getElementById('template_ziGridEmpty'), {});
    } else {
      render(document.getElementById('template_ziGridCard'), {
        zies: data.map(convertPinyinZiData)
      });
    }
  })
  .catch((e) => {
    render(document.getElementById('template_ziGridNetError'), {
      msg: e.message || '无法获取常用字列表，请检查网络或稍后重试。'
    });
  });
