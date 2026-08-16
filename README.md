# 汉字网 · hanzi

<p align="center">
  <img src="public/logo.svg" width="120" alt="汉字网 logo" />
</p>

> 本站：[https://hanzi.crazydan.io](https://hanzi.crazydan.io)

汉字网是 [筷字输入法](https://github.com/crazydan-studio/kuaizi-ime) 的衍生项目，旨在汇总汉字信息与资源，并向公共领域免费提供高质量的汉字笔画数据，方便个人学习与课堂教学使用，为汉字的广泛传播与学习、增强汉字的世界影响力贡献一份力量。

本站提供的功能包括：

- **汉字查询**：通过汉字或拼音（不带声调）检索汉字信息（读音试听、笔画数、部首、字型结构、Unicode 等）
- **书写动画**：田字格内演示汉字的笔画书写动画与笔画分解图
- **常用字与拼音字列表**：按使用频率浏览常用字、按拼音浏览汉字
- **汉字笔画数据**：免费的汉字笔画轨迹数据，供个人学习与教学使用

## 本地开发

### 环境要求

- Node.js >= 22.5（使用内置 `node:sqlite`）
- pnpm

### 数据准备

1. 将汉字词典数据源 `pinyin-dict.sqlite` 放置于 `data/` 目录
2. 同步后端汉字基础信息库（读音、权重、结构、部首、笔画数）：

   ```bash
   pnpm import:pinyin
   ```

3. 导出前端静态数据（常用字列表、拼音字列表、汉字信息与笔画数据）：

   ```bash
   pnpm export:data          # 默认导出 1500 个常用字
   pnpm export:data -- --count 200    # 可通过 --count 指定常用字数量
   ```

   导出的数据位于 `public/assets/`：`zi/commons.json`（常用字）、`pinyin/{拼音}/meta.json`（拼音字列表）、`zi/{Unicode}/meta.json`（汉字信息）与 `zi/{Unicode}/strokes.json`（笔画数据，仅该汉字存在笔画时生成）。

### 启动开发环境

```bash
pnpm install
pnpm dev:all
```

- 前端：http://localhost:5173
- 后端：http://localhost:3001

本地开发模式下，首页右下角提供「笔画管理」浮动入口（汉字笔画管理模块，用于本地维护汉字结构与笔画数据），汉字信息页右下角提供「书写该字」入口。

### 生产构建

```bash
pnpm build
pnpm start
```

生产模式由后端服务托管前端构建产物与静态数据，访问 http://localhost:3001 。

### 目录结构

```
├── build/          # 构建相关脚本（导出静态数据等）
├── data/           # 本地开发数据库（汉字词典数据源）
├── public/         # 静态资源（字体、logo、导出的数据）
├── server/         # 本地开发后端服务（REST API + 静态数据同步）
└── src/            # 前端页面与共享组件
    ├── index.html        # 首页
    ├── char/             # 汉字信息页
    ├── pinyin/           # 拼音字列表页
    ├── commons/          # 常用字列表页
    ├── donate/           # 友情赞助页
    └── strokes/          # 汉字笔画管理模块（列表页与书写页）
```

## 许可协议

本站点（ https://hanzi.crazydan.io ）所提供的资源和源代码，仅限用于个人学习、师生教学等非商业用途；商业使用本站点所提供的汉字笔画数据，需获得商业授权。本站点所提供的汉字信息数据、拼音音频文件来源于 [汉典网](https://zdic.net/)（ https://zdic.net/ ），直接使用需遵从其[使用条款](https://zdic.net/terms/)。

## 致谢

感谢 [汉典网](https://zdic.net/) 收集和提供的汉字详细信息。

## 建议与意见

若在使用过程中遇到任何问题，或有好的改进建议，欢迎在 [Issues](https://github.com/crazydan-studio/hanzi.crazydan.io/issues) 页面提出，我们将积极回应，并尽可能解决相关疑难。

## 友情赞助

支持本站持续发展，可前往 [友情赞助](https://hanzi.crazydan.io/donate/) 页面扫码赞助，感谢您的热心支持！
