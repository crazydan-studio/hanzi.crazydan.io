# [hanzi.crazydan.io](https://hanzi.crazydan.io)

<img src="./public/logo.svg" width="172px" />

本站点为 [筷字输入法](https://github.com/crazydan-studio/kuaizi-ime) 的衍生项目，
用于汇总汉字信息和资源，向公共领域提供高质量的汉字笔顺矢量图，方便个人以及教学使用，
从而为汉字的广泛传播和学习、增强汉字的世界影响力贡献一份自己的力量。

本站点提供的汉字笔画 SVG 矢量文件（`stroke.svg`）包含完整的笔画信息和书写动画帧，
可方便地从中提取汉字的组成部件，用于组装新字、补充未提供笔画的汉字、分析汉字组成结构等。

## 本地开发

- 安装依赖：`pnpm install`
- 运行开发服务：`pnpm run dev`
- 本地构建：`pnpm run build`

## 致谢

- [汉典网](https://www.zdic.net/) 收集和提供的汉字详细信息
- [StrokeOrder.com](https://www.strokeorder.com/) 整理和提供的汉字笔顺图

## 待办

详情见 [TODO.md](./TODO.md)。

## 建议 & 意见

若遇到任何问题，或有好的改进意见，可在
[Issues](https://github.com/crazydan-studio/hanzi.crazydan.io/issues)
页面提问，我们将积极回应并尽可能解决相关疑难。

## 许可协议

本站点（[https://hanzi.crazydan.io](https://hanzi.crazydan.io)）
所提供的资源和源代码，仅限于个人学习、教学等非商业用途。

本站点所提供的汉字信息数据、拼音音频文件和字形文件（`glyph.svg`）来自于
汉典网（[https://www.zdic.net/](https://www.zdic.net/)），
直接使用需遵从其[免责说明](https://www.zdic.net/aboutus/disclaimer/)。

本站点所提供的汉字笔画文件（`stroke.svg`）由 Python 脚本
[gen-from-gif.py](https://github.com/crazydan-studio/kuaizi-ime/blob/master/tools/pinyin-dict/src/data/word/stroke/gen-from-gif.py)
根据 StrokeOrder.com（[https://www.strokeorder.com/](https://www.strokeorder.com/)）
所提供的笔画 GIF 动画生成，若需要直接使用其原始 GIF 动画文件，则需遵守其[使用条款](https://www.strokeorder.com/terms.html)。

基于 `stroke.svg`/`stroke-tc.svg` 所做的字形、笔顺等修改属于二次创作，
其所有权属于创作者，其创作者可将该二次创作产物用于任何场景，不受本协议影响，
但仍需要说明或备注其原始资料的来源（[https://hanzi.crazydan.io](https://hanzi.crazydan.io)）。
