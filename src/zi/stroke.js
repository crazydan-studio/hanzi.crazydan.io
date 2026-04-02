import './zi.css';

export function genStrokeSteps(svg) {
  const count = (svg.match(/<g\s+id="s-\d+"/g) || []).length;

  return Array.from({ length: count }, (_, index) => {
    // 仅保留完整笔画的动画帧，避免不必要的 DOM 渲染
    let s = svg.replace(/<path .+id="s-\d+-f-[1-9]\d*".*\/>/g, '');

    for (let f = 0; f <= index; f++) {
      const id = `s-${f}`;
      const cls = f < index ? 'actived' : 'active';

      s = s.replace(new RegExp(`(id="${id}")`), `$1 class="${cls}"`);
    }

    // Note: 笔画分解图以 shadow dom 形式挂载到 html 中，因此，需要将样式内置到 svg 中
    return {
      svg: `<style>
svg g>path {display: none;}
/* 显示完整笔画的动画帧（Note: 动画帧的 path id 是倒序设置的，序号 0 始终为完整笔画） */
svg g>[href$="-f-0"] {fill: #000;opacity: 0.08;}
/* 高亮完整笔画的动画帧 */
svg g.active>[href$="-f-0"] {fill: var(--color-red-600);opacity: 1;}
svg g.actived>[href$="-f-0"] {opacity: 1;}
</style>
${s}`,
      index: index + 1
    };
  });
}

/** @return `{has_stroke: true, glyph_svg: 'svg', stroke_steps: [{svg: 'svg', index: 1}, ...]}` */
export async function fetchZiGlyphAndStrokes(unicode, type) {
  const has_stroke = type == 'stroke';
  const name = has_stroke ? 'stroke.svg' : 'glyph.svg';

  const resp = await fetch(`/assets/zi/${unicode}/${name}`);
  const svg = resp.ok ? (await resp.text()).replace(/<\?xml .+\?>/g, '') : '';

  const data = { has_stroke };

  if (data.has_stroke) {
    data.stroke_svg = svg;
    data.stroke_steps = genStrokeSteps(svg);
  } else {
    data.glyph_svg = svg;
  }

  return data;
}
