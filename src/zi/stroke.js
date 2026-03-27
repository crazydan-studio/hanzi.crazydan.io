import './char.css';

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
    return { svg: s, index: index + 1 };
  });
}
