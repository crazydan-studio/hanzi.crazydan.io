import { render } from '#utils/render.js';
import { convertCharGlyphData } from '#data/schema.js';
import { getUnicode } from '#utils/char.js';

import { genStrokeSteps, fetchCharGlyph } from '#zi/stroke.js';

import '#index.css';

fetch('/assets/zi/glyphs.json')
  .then((resp) => {
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} - 无法获取字形列表`);
    }
    return resp.json();
  })
  .then((chars) => {
    render(document.getElementById('template_charGridCard'), {
      chars: chars.map(convertCharGlyphData)
    });

    const $nodes = document.querySelectorAll(
      '.char-glyph-card:not(r-template .char-glyph-card)'
    );
    lazyLoadGlyphs($nodes);
  })
  .catch((e) => {
    render(document.getElementById('template_charGridNetError'), {
      msg: e.message || '无法获取字形列表，请检查网络或稍后重试。'
    });
  });

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

      fetchCharGlyph(unicode, glyph_type).then((data) => {
        if (data.has_stroke) {
          data.stroke_steps = genStrokeSteps(data.glyph_svg);
        }

        render(target.querySelector('[name="template_charGlyph"]'), data);
      });
    });
  });

  targets.forEach((target) => loadingObserver.observe(target));
}
