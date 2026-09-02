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

### 开发前准备：字体与数据

1. **中易楷体（全量 TTF）**：将全量中易楷体放置于 `build/fonts/ZhongYiKaiTi.ttf`（构建资源，不随 App 打包）。
   该字体为 App 内置字体与 web 端显示字体的来源（不做精简，保证全部字形可用）。
2. **汉字词典数据源**：将 `pinyin-dict.sqlite` 放置于 `data/` 目录（含表 `pinyin_zi`：读音/权重/结构/部首/笔画数）。

### 数据准备

1. 导入汉字基础信息（读音、权重、结构、部首、笔画数）到后端数据库 `data/hanzi.db`：

   ```bash
   pnpm import:pinyin
   ```

   导入时校验中易楷体（`public/fonts/ZhongYiKaiTi.woff2`）是否包含每个汉字：字体不包含的汉字不导入，
   并从静态数据（`public/assets/zi/` 的 `index.json` 与 `strokes/` 分片）中删除对应条目。

2. 打包/导入拼音读音音频为 Opus 雪碧图（按首字母分片 + 定长双数组索引）：

   ```bash
   pnpm audio:pack                                    # 打包 public/assets/audio/pinyin 内既有 mp3/wav
   pnpm audio:pack -- --source /path/to/音频目录        # 从指定目录导入后打包
   ```

   源文件命名支持符号声调（`dì`、`lǜ`）或数字声调（`di4`、`lv4`），`ü` 可写作 `v`，
   自动归一化为数字声调拼音。产物为 `public/assets/audio/pinyin/{首字母}.ogg`（Opus 雪碧图）
   与 `index.json`（定长双数组索引 `{ v:1, p: 无声调拼音有序数组, d: 时长扁平数组 }`：
   每拼音固定占 `d` 中 5 个元素，槽位 0 = 零声、1-4 = 一至四声，无音频置 0，
   起始由拼接顺序 + 20ms 帧补齐推导）；Safari 不支持 Ogg/Opus，不做兼容。

3. 打包中易楷体（全量，不做精简以避免页面乱码）：

   ```bash
   pnpm app:font
   ```

   产物：
   - `app/android/src/main/assets/fonts/ZhongYiKaiTi.ttf`：App 内置字体（全量 TTF，`createFromAsset` 直读）
   - `public/fonts/ZhongYiKaiTi.woff2`：web 端显示字体（全量 TTF 转 woff2，仅格式转换，保留全部字形）

3. 导出前端静态数据（常用字列表、拼音字列表、汉字信息与笔画数据，数据直接取自后端数据库）：

   ```bash
   pnpm export:zi                                  # 默认导出 1500 个常用字
   pnpm export:zi -- --count 200                   # 可通过 --count 指定常用字数量
   pnpm export:zi -- --out /path/to/dir            # 可指定输出目录（默认 public）
   ```

   导出的数据位于 `public/assets/`：`zi/commons.json`（常用字）、`pinyin/index.json`（拼音字列表单文件，条目为 `[字, 声调数字, 繁体?]`，读音由无声调拼音键 + 声调还原）、`zi/index.json`（全部汉字信息单文件字典化：读音/部首/结构三字典 + 每字紧凑行）与 `zi/strokes/{码点>>12}.json`（笔画数据码点分片，每字一条目，序号由数组下标推出，仅存在笔画数据的码点分片才生成）。

4. 导出「汉字笔画数据」独立数据库（App 端按需下载使用）：

   ```bash
   pnpm export:stroke-db                           # 默认导出全部（full）到 dist/assets/
   pnpm export:stroke-db -- --count 1500           # 导出权重最高的前 1500 个汉字
   pnpm export:stroke-db -- --out /path/to/dir     # 可指定导出位置
   ```

   产物为 `hanzi-stroke-{数量}.db`（`hanzi-stroke-full.db` 表示全部），仅含 `strokes` 表
   （汉字信息由 App 内置库 `hanzi.db` 提供）。

5. 打包 App 内置数据库（仅汉字信息，数据未变化时不重新生成）：

   ```bash
   node build/app-db-pack.js
   ```

   产物：`app/android/src/main/assets/db/hanzi.db`（App 内置库，`meta_zi` 实体表 + `zi` 视图）。

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
pnpm build            # 构建前端
pnpm build:server     # 构建后端为单文件（输出 server/dist/index.cjs）
pnpm start            # 源码直接启动后端
```

生产模式由后端服务托管前端构建产物与静态数据，访问 http://localhost:3001 。

**后端单文件产物**（`pnpm build:server`，esbuild 打包全部依赖）：

```bash
node server/dist/index.cjs                    # 默认端口 3001、默认数据库 data/hanzi.db
node server/dist/index.cjs --port 8080        # 指定端口
node server/dist/index.cjs --db /path/db.db   # 指定数据库路径（相对当前目录）
HANZI_DB=/path/db.db node server/dist/index.cjs   # 亦可通过环境变量指定
```

端口解析优先级：`--port` > 环境变量 `PORT` > 默认 3001；数据库路径优先级：`--db` > 环境变量 `HANZI_DB` > 默认 `data/hanzi.db`。
`data/hanzi.db` 为现有数据资产，未经明确要求禁止删除或清空。

### App 打包（Android）

```bash
build/app-pack.sh debug     # 构建 pure/net 双变体 debug 安装包
build/app-pack.sh release   # 构建 pure/net 双变体 release 安装包并写入版本信息
```

- **变体**：`pure`（纯净版，无任何权限）/ `net`（可联网变体，支持检查更新、在线下载笔画数据）；
  两变体 `applicationId` 一致，可互相覆盖安装且保留数据
- **产物**：
  - debug：`public/assets/app/android/hanzi-debug.apk`、`hanzi-net-debug.apk`（web 开发环境下载）
  - release：`dist/assets/app/hanzi-android-{version}.apk`、`hanzi-net-android-{version}.apk`（纯净版无变体标识，随 GitHub Releases 发布）
- **版本信息**（`pnpm app:version` 生成 `public/assets/app/version`，单行 JSON：
  `{"name":"...","changelog":"...","checksum":{"android":{"pure":"sha256:...","net":"sha256:..."}}}`）：
  联网变体启动时据此检查更新并校验安装包完整性；更新日志可选写入 `app/notes.txt`
- 打包步骤包含：拷贝拼音读音/收款码资源、打包中易楷体（目标已存在则跳过）、
  打包内置数据库（`data/hanzi.db` → `app/android/src/main/assets/db/hanzi.db`）、Gradle 构建、移动安装包

### 目录结构

```
├── build/          # 构建相关脚本（字体打包、数据库打包、静态数据导出、App 打包等）
│   └── fonts/      # 中易楷体全量 TTF（子集源，不随 App 打包）
├── data/           # 本地开发数据（hanzi.db 汉字数据库、pinyin-dict.sqlite 词典数据源）
├── public/         # 静态资源（字体、logo、导出的数据）
├── server/         # 后端服务（REST API + 静态数据同步；build:server 产物在 server/dist/）
├── dist/           # 前端构建产物、笔画数据库与 App release 安装包导出位置
└── src/            # 前端页面与共享组件
    ├── index.html        # 首页
    ├── zi/               # 汉字信息页
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
