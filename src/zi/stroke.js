import './zi.css';

export function genStrokeSteps(strokeSvg) {
  strokeSvg = cleanStrokeSvg(strokeSvg);

  const count = (strokeSvg.match(/<g\s+id="s-\d+"/g) || []).length;

  const steps = [];
  for (let index = 0; index < count; index++) {
    let svg = strokeSvg;

    for (let f = 0; f <= index; f++) {
      const id = `s-${f}`;
      const cls = f < index ? 'actived' : 'active';

      svg = svg.replace(new RegExp(`(id="${id}")`), `$1 class="${cls}"`);
    }

    const step = createStrokeStep(svg, index + 1);
    steps.push(step);
  }

  return steps;
}

export function genStrokeStepsByGroups(strokeSvg, groups) {
  if (!groups || groups.length == 0) {
    return genStrokeSteps(strokeSvg);
  }

  strokeSvg = cleanStrokeSvg(strokeSvg);

  return groups.map((group) => {
    let svg = strokeSvg;

    group.split(',').forEach((g) => {
      const segs = g
        .split('-')
        .map((v) => parseInt(v))
        .sort((a, b) => a - b);

      // Note: 分组序号从 1 开始，而 svg 中笔画序号从 0 开始
      const start = segs[0] - 1;
      const end = segs[segs.length - 1] - 1;

      for (let f = start; f <= end; f++) {
        const id = `s-${f}`;

        svg = svg.replace(new RegExp(`(id="${id}")`), `$1 class="actived"`);
      }
    });

    return createStrokeStep(svg, group);
  });
}

/** @return `{has_stroke: true, glyph_svg: 'svg', stroke_svg: 'svg'}` */
export async function fetchZiGlyphAndStroke(unicode, type) {
  const has_stroke = type == 'stroke';

  const fetchSvg = async (name) => {
    const resp = await fetch(`/assets/zi/${unicode}/${name}`);
    return resp.ok ? (await resp.text()).replace(/<\?xml .+\?>/g, '') : '';
  };

  const data = { has_stroke, glyph_svg: await fetchSvg('glyph.svg') };

  if (data.has_stroke) {
    data.stroke_svg = await fetchSvg('stroke.svg');
  }

  return data;
}

function cleanStrokeSvg(svg) {
  // 仅保留完整笔画的动画帧，避免不必要的 DOM 渲染
  return svg.replace(/<path .+id="s-\d+-f-[1-9]\d*".*\/>/g, '');
}

function createStrokeStep(svg, index) {
  // Note: 笔画分解图以 shadow dom 形式挂载到 html 中，因此，需要将样式内置到 svg 中
  return {
    svg:
      `<style>
svg g>path {display: none;}
/* 显示完整笔画的动画帧（Note: 动画帧的 path id 是倒序设置的，序号 0 始终为完整笔画） */
svg g>[href$="-f-0"] {fill: #000;opacity: 0.08;}
/* 高亮完整笔画的动画帧 */
svg g.active>[href$="-f-0"] {fill: var(--color-red-600);opacity: 1;}
svg g.actived>[href$="-f-0"] {opacity: 1;}
</style>
` + svg,
    index
  };
}
