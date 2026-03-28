# [hanzi.crazydan.io](https://hanzi.crazydan.io) 资源包使用说明

## 二次开发说明

- 拼音音频文件放在 `audio` 目录中，并直接以带声调的拼音作为文件名
- 不带声调的拼音所包含的汉字列表记录在 `pinyin/{pinyin}/meta.json` 中，如 `pinyin/zhong/meta.json`
- 单个汉字的信息和图形资源放在 `zi/{unicode}` 目录中，如 `zi/U+4E2D`，
  其中，`meta.json` 中记录了汉字读音、笔画数、部首等基础信息；
  `stroke.svg` 则包含了该汉字的完整笔画动画帧，可用于书写演示或者笔顺分解；
  `glyph.svg` 则为该汉字的静态字形图，仅作字形展示用，无法用于笔顺和笔画处理
  - 当某汉字没有笔画信息时，则不提供 `stroke.svg`，仅包含汉典网所提供的 `glyph.svg`
- `pinyin/{pinyin}/meta.json` 与 `zi/{unicode}/meta.json` 的结构转换参考
  [schema.js](https://github.com/crazydan-studio/hanzi.crazydan.io/blob/master/src/data/schema.js)

`stroke.svg` 的结构如下：

```xml
<svg ...>
    <defs>
        <path d="..." id="s-0-f-0"/>
        <clipPath id="c-s-0"><use href="#s-0-f-0"/></clipPath>

        <path .../>
        <clipPath id="c-s-1"><use .../></clipPath>
    </defs>

    <g id="s-0" clip-path="url(#c-s-0)">
        <use href="#s-0-f-0"/>
        <path d="..." id="s-0-f-1"/>
        <path .../>
    </g>
    <g id="s-1" clip-path="url(#c-s-1)">
        ...
    </g>
</svg>
```

- `<defs/>` 中定义的是以每笔笔画的完整图形 `<path/>` 作为裁剪路径，
  其用于裁剪该笔画其与动画帧图形的多余部分，保证字形美观
- 笔画动画帧图形 `<path/>` 的 `id` 定义为 `s-{笔画序号}-f-{笔画动画帧序号}` 形式，
  其序号从 `0` 开始
- 每笔笔画的所有动画帧均放在 `<g/>` 标签中，且其 `id` 以 `s-{笔画序号}` 形式定义。
  其中，`clip-path` 属性引用的是在 `<defs/>` 中所定义的裁剪路径 `<clipPath/>`，
  裁剪路径的 `id` 则与笔画 `id` 相对应地定义为 `c-s-{笔画序号}` 形式，
  比如，第二笔笔画 `<g id="s-1"/>` 对应的裁剪路径必然为 `<clipPath id="c-s-1"/>`
- 为了方便播放动画帧，在笔画 `<g/>` 中采用 先整体后部分 的顺序排列笔画的动画帧，
  因此，`{笔画动画帧序号}` 为 `0` 时，表示该动画帧为其笔画的完整路径。
  注意，笔画的完整动画帧始终以 `<use href="#s-0-f-0"/>` 形式引用在 `<defs/>`
  中的 `<path/>` 图形，以支持与裁剪路径共享图形定义
- 对 `stroke.svg` 的笔画分解展示的处理参考
  [zi/stroke.js](https://github.com/crazydan-studio/hanzi.crazydan.io/blob/master/src/zi/stroke.js)
- 对 `stroke.svg` 的笔画书写动画的处理参考
  [zi/index.js](https://github.com/crazydan-studio/hanzi.crazydan.io/blob/master/src/zi/index.js)
  中的函数 `initStrokeAnimDemo`

## 许可协议

详见 [LICENSE](./LICENSE)。
