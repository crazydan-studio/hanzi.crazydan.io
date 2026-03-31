import { render } from '#utils/render.js';
import { message } from '#utils/message/index.js';
import { convertPinyinZiData } from '#data/schema.js';

import '#index.css';

// ------------------------------
// 汉字查询
// ------------------------------
const searchBtn = document.getElementById('searchBtn');
const queryInput = document.getElementById('queryInput');

// 判断是否为纯拼音字母 (a-z，允许小写大写)
function isPinyinStr(str) {
  return /^[a-zA-Z]+$/.test(str.trim());
}

function redirectToPlaceholder(type, value) {
  let url = '#';
  let v = encodeURIComponent(value);

  if (type === 'pinyin') {
    url = `/pinyin/?v=${v}`;
  } else if (type === 'hanzi') {
    url = `/zi/?v=${v}`;
  }
  window.location.href = url;
}

function performQuery() {
  let rawValue = queryInput.value.trim();
  if (rawValue === '') {
    message.show({
      type: 'warning',
      message: '请输入汉字或拼音 (例如 “爱” 或 “ai”)'
    });
    return;
  }

  // 拼音检测 (纯字母)
  if (isPinyinStr(rawValue)) {
    redirectToPlaceholder('pinyin', rawValue.toLowerCase());
  } else {
    redirectToPlaceholder('hanzi', rawValue);
  }
}

searchBtn.addEventListener('click', performQuery);
queryInput.addEventListener('keypress', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    performQuery();
  }
});

// ------------------------------
// 常用字
// ------------------------------
fetch('/assets/zi/commons.json')
  .then((resp) => {
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} - 无法获取常用字列表`);
    }
    return resp.json();
  })
  .then((zies) => {
    render(document.getElementById('template_commonsGridCard'), {
      zies: zies.slice(0, 15).map(convertPinyinZiData)
    });
  })
  .catch((e) => {
    render(document.getElementById('template_commonsGridNetError'), {
      msg: e.message
    });
  });

// ------------------------------
// 资源下载
// ------------------------------
const downloadBtn = document.getElementById('downloadResourceBtn');

function showDownloadConfirm() {
  const confirmMsg =
    '📦 汉字字形 & 笔顺资源包下载前须知\n\n' +
    '1. 本站所有资源（包含字形、笔顺 SVG）仅限于个人学习、教学等非商业用途。\n' +
    '2. 您不得将资源用于任何商业目的或盈利性行为。\n' +
    '3. 若传播或二次利用此资源包，必须保留包中的 LICENSE 说明文件，并注明来源。\n' +
    '4. 本站不为用户因使用本站资源所产生的任何法律纠纷负责，用户需自行承担风险。\n\n' +
    '是否确认下载并遵守以上条款？';

  if (confirm(confirmMsg)) {
    window.open('/assets/hanzi-assets-bundled.zip', '_blank');
  }
}

downloadBtn.addEventListener('click', showDownloadConfirm);
