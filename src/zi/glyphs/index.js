import { render } from '#utils/render.js';
import { convertCharGlyphData } from '#data/schema.js';
import { getUnicode } from '#utils/char.js';

import { fetchCharGlyphAndStrokes } from '#zi/stroke.js';

import '#index.css';

const PAGE_SIZE = 100;
let pageData = { current: 0, total: 0 };

fetch('/assets/zi/glyphs.json')
  .then((resp) => {
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} - 无法获取字形列表`);
    }
    return resp.json();
  })
  .then((chars) => {
    initPager(pageData, chars);
  })
  .catch((e) => {
    render(document.getElementById('template_charGridNetError'), {
      msg: e.message || '无法获取字形列表，请检查网络或稍后重试。'
    });
  });

function initPager(pageData, data) {
  let oldCurrent = pageData.current;

  pageData.total = Math.ceil(data.length / PAGE_SIZE);

  const doRender = (page) => {
    render(document.getElementById('template_charGridPager'), { page });

    document.getElementById('page_gotoInput').onblur = (event) => {
      try {
        const current = parseInt(event.target.innerText);
        updatePageCurrent(current);
      } catch (e) {}

      event.target.innerText = pageData.current;
    };

    // -----------------------------------------
    if (oldCurrent != page.current) {
      const index = (page.current - 1) * PAGE_SIZE;

      renderGrid(data.slice(index, index + PAGE_SIZE));
    }
    oldCurrent = page.current;
  };

  const updatePageCurrent = (current) => {
    pageData.current = Math.min(pageData.total, Math.max(1, current));

    doRender(pageData);
  };
  updatePageCurrent(1);

  document.getElementById('page_prevBtn').onclick = () => {
    updatePageCurrent(pageData.current - 1);
  };
  document.getElementById('page_nextBtn').onclick = () => {
    updatePageCurrent(pageData.current + 1);
  };
}

function renderGrid(data) {
  render(document.getElementById('template_charGridCard'), {
    chars: data.map(convertCharGlyphData)
  });

  const $nodes = document.querySelectorAll(
    '.char-glyph-card:not(r-template .char-glyph-card)'
  );
  lazyLoadGlyphs($nodes);
}

function lazyLoadGlyphs(targets) {
  const loadingObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      const target = entry.target;
      loadingObserver.unobserve(target);

      const char = target.dataset.char;
      const glyph_type = target.dataset.glyphType;
      const unicode = getUnicode(char);

      fetchCharGlyphAndStrokes(unicode, glyph_type).then((data) => {
        render(target.querySelector('[name="template_charGlyph"]'), data);
      });
    });
  });

  targets.forEach((target) => loadingObserver.observe(target));
}
