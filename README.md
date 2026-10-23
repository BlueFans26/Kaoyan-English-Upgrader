# 考研英语综合备考站

> **AI 生成声明**  
> 本项目的代码、界面文案与文档由 AI 生成或辅助生成，并经过本地自动化测试和人工校对。AI 生成内容可能存在疏漏或错误；真题、答案、参考译文与批改结果仅供学习参考，请以官方考试大纲、真题原文和权威资料为准。

一个免构建、离线优先的考研英语备考 PWA。整合英语一 / 英语二客观题真题、英语二主观题 AI 批改、考纲背单词与学习总览。没有后端账号，作答、批改记录与学习进度只保存在使用者自己的浏览器中。

**在线使用：** <https://serendipity0526.github.io/Kaoyan-English-Upgrader/>

## 功能

- **客观题真题**：2010–2025 年英语一 / 英语二共 32 套试卷，每套 45 题、60 分；完型填空、阅读 Part A（Text 1–4）与 Part B 分区作答、分区提交、整卷提交、结果页与重做。
- **手写勾画与批注**：文段上方支持荧光笔、签字笔、铅笔三种笔种与三档粗细；可放置、拖动文本框批注，编辑后自动固定保存，支持整卷批注清单、结果页批注与跨板块定位。
- **答题计时**：客观题提供板块计时与整卷计时，主观题提供单计时；手动开始、离开页面自动暂停、刷新恢复，结果页显示用时并提示过短或超时。
- **AI 主观题批改**：英语二翻译、小作文、大作文，支持文本或图片作答；使用使用者自行配置的 OpenAI 兼容接口，输出分数、逐句分析、优化建议与范文。
- **考纲背单词**：5,530 个考纲词，四选一三阶段记忆、正序 / 乱序背诵、复习与 7 天复测、每日计划与 7 日曲线。
- **学习总览**：三类主观题评分曲线，以及当前科目的客观题整卷得分曲线。
- **离线优先**：Service Worker 缓存应用壳、题库与词表，安装后可离线打开；数据默认保存在本机。

## 本地运行

环境要求：Node.js（建议 18 或更高版本），无需安装任何 npm 依赖。

```bash
node server.js
```

然后打开 <http://localhost:4173>。Windows 也可直接双击 `start.bat`。

Service Worker 只在 `localhost` 或 HTTPS 下生效；通过局域网 IP 的普通 HTTP 访问时只能在线使用。

## AI 批改配置

在站点「科目设置 / 设置与本地数据」中填写：

- OpenAI 兼容接口地址（Base URL）
- API Key
- 模型名称

API Key 仅保存在当前浏览器的 `localStorage`，不会写入源码、GitHub 仓库或便携包。批改时，题干与作答会发送到使用者配置的模型接口；除此之外没有本项目的中转服务器。图片作答需要支持图片输入的模型。

## 数据与隐私

- 作答进度、勾画、批注、计时和 AI 批改记录保存在浏览器 IndexedDB。
- API 配置、科目设置和界面偏好保存在浏览器 `localStorage`。
- 设置页导出的备份可能包含批改记录，请自行妥善保管；便携包与 GitHub Pages 部署文件不包含 API 配置或批改记录。
- 清除站点数据、更换浏览器或使用隐私模式会丢失本地记录，本站不提供云端同步。

## 项目结构

```text
index.html                 应用入口
sw.js                      Service Worker 缓存
assets/css/                页面样式
assets/js/                 路由、存储、计时、图表、题库与业务逻辑
assets/js/views/           各页面视图
assets/data/papers/        客观题真题 JSON
assets/data/vocabulary.json
icons/                     PWA 图标
server.js                  零依赖本地静态服务器
```

技术栈为原生 HTML / CSS / ES Modules，无构建步骤、无前端框架、无运行时 npm 依赖。

## 题目与数据来源

- **客观题真题**：来自 `structured-kaoyan-english` 的试题数据。仅使用可自由使用的题目、选项、答案与配图；不收录 `explanation`、Markdown 解析等 CC BY-NC 内容。
- **考纲词库**：`exam-data/NETEMVocabulary`，CC BY-NC-SA 4.0。
- **例句**：Tatoeba，CC BY 2.0；少量无合适例句的词由本站补写。
- **音标与词形**：ECDICT，MIT License。
- **主观题材料**：题目来自上述真题数据；参考译文、范文与学习提示由本站整理、校对或撰写，仅供非商业学习使用。

完整署名与许可条款见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)、[assets/data/NOTICE.txt](assets/data/NOTICE.txt) 与 [assets/data/papers/NOTICE.txt](assets/data/papers/NOTICE.txt)。

## 许可证

- 站点代码：**GNU Affero General Public License v3.0 only（AGPL-3.0-only）**，完整文本见 [LICENSE](LICENSE)。
- 词库及据此生成的易混选项数据：**CC BY-NC-SA 4.0**，仅限非商业学习用途。
- 第三方试题、例句、音标与词形数据保留其原有许可。

由于词库采用禁止商业使用的许可，本项目整体仅限非商业学习用途，并非严格符合 OSI 定义的开源项目；代码的 AGPL 授权不改变第三方数据的原有许可。

## 免责声明

本项目为个人学习工具，与教育部教育考试院及任何考试机构无关。AI 批改、参考译文、范文、词义与题目解析均可能存在错误，不构成备考承诺或官方答案；请结合官方大纲、真题原文与权威资料使用。因使用本项目产生的任何后果由使用者自行承担。
