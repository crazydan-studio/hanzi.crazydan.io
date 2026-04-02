import '#utils/native.js';
import { render } from '#utils/render.js';
import { getParamFromLocation, setParamInLocation } from '#utils/url.js';
import { convertZiGlyphData } from '#data/schema.js';
import { getUnicode } from '#utils/zi.js';

import { fetchZiGlyphAndStrokes } from '#zi/stroke.js';

import '#index.css';

const PAGE_SIZE = 100;
let pageData = { current: 0, total: 0 };

const page = getParamFromLocation('p') || 1;

fetch('/assets/zi/glyphs.json')
  .then((resp) => {
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} - 无法获取字形列表`);
    }
    return resp.json();
  })
  .then((zies) => {
    const pager = initPager(pageData, zies);
    pager(page);
  })
  .catch((e) => {
    render(document.getElementById('template_ziGridNetError'), {
      msg: e.message || '无法获取字形列表，请检查网络或稍后重试。'
    });
  });

function initPager(pageData, data) {
  let oldCurrent = pageData.current;

  pageData.total = Math.ceil(data.length / PAGE_SIZE);

  const doRender = (page) => {
    render(document.getElementById('template_ziGridPager'), { page });

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

      setParamInLocation('p', page.current);
    }
    oldCurrent = page.current;
  };

  const updatePageCurrent = (current) => {
    pageData.current = Math.min(pageData.total, Math.max(1, current));

    doRender(pageData);
  };

  document.getElementById('page_prevBtn').onclick = () => {
    updatePageCurrent(pageData.current - 1);
  };
  document.getElementById('page_nextBtn').onclick = () => {
    updatePageCurrent(pageData.current + 1);
  };

  return updatePageCurrent;
}

function renderGrid(data) {
  render(document.getElementById('template_ziGridCard'), {
    zies: data.map((d) => {
      const obj = convertZiGlyphData(d);

      obj.has_stroke_svg = obj.glyph_type == 'stroke';

      return obj;
    })
  });

  const $nodes = document.querySelectorAll(
    '.zi-glyph-card:not(r-template .zi-glyph-card)'
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

      const zi = target.dataset.zi;
      const glyph_type = target.dataset.glyphType;
      const unicode = getUnicode(zi);

      fetchZiGlyphAndStrokes(unicode, glyph_type).then((data) => {
        const doRender = () => {
          loadGlyphStatus(target, zi, data.has_stroke);

          render(target.querySelector('[name="template_ziGlyph"]'), data);
        };

        if (data.has_stroke) {
          fetch(`/assets/zi/${unicode}/glyph.svg`)
            .then((resp) => resp.text())
            .then((svg) => {
              data.glyph_svg = svg;

              doRender();
            });
        } else {
          doRender();
        }
      });
    });
  });

  targets.forEach((target) => loadingObserver.observe(target));
}

function loadGlyphStatus(target, zi, has_stroke_svg) {
  fetch(`/dev/api/glyph-check?z=${zi}&t=get-data`)
    .then((resp) => resp.json())
    .then((data) => {
      data.value = zi;
      data.has_stroke_svg = has_stroke_svg;

      render(target.querySelector('[name="template_ziGlyphStatus"]'), data);
    });
}

// ---------------------------------------------------------
window.$updateGlyphStatus = function (event, zi, type) {
  const value = !!event.target.checked;

  $callApi(`/dev/api/glyph-check?z=${zi}&t=${type}&v=${value}`);
};
