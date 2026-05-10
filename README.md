# Auto Questionnaire Filler / 问卷助手

[English](#english) | [中文](#中文)

---

## English

A Chrome extension that automatically detects and fills web questionnaires using LLM (Large Language Model). Supports OpenAI-compatible APIs including DeepSeek, Tongyi Qianwen, Moonshot, and more.

### Features

- **Auto Detection** — Automatically identifies questionnaire pages and parses questions
- **LLM-Powered** — Uses AI to generate contextually appropriate answers
- **Multiple Question Types** — Supports radio, checkbox, text, textarea, rating, matrix, date, slider, and more
- **Platform Adapters** — Optimized for Wenjuanxing (wjx.cn), Tencent Questionnaire, Google Forms, and generic forms
- **Follow-up Inputs** — Handles options that trigger additional text inputs (e.g., "Other" with explanation)
- **Auto Submit** — Optional automatic submission after filling
- **Floating Panel** — Real-time progress and status display

### Installation

1. Download the latest release from [Releases](https://github.com/braze-taffo/auto-questionnaire-filler/releases)
2. Unzip the downloaded file
3. Open Chrome → `chrome://extensions` → Enable **Developer mode**
4. Click **Load unpacked** and select the unzipped folder

### Configuration

1. Click the extension icon in the toolbar
2. Enter your API settings:
   - **API Base URL** — e.g., `https://api.deepseek.com/v1`
   - **API Key** — Your API key
   - **Model** — e.g., `deepseek-chat`
3. Click **Test Connection** to verify
4. Adjust tone and auto-submit settings as needed

### Usage

1. Open any questionnaire page
2. A floating panel will appear in the bottom-right corner
3. Click **Start Filling** to begin
4. The extension will parse questions, generate answers via LLM, and fill them in automatically

### Supported Platforms

| Platform | URL Pattern | Status |
|----------|-------------|--------|
| Wenjuanxing (问卷星) | wjx.cn, sojump.com | Optimized |
| Tencent Questionnaire | wj.qq.com | Optimized |
| Google Forms | docs.google.com/forms | Optimized |
| Other forms | Any webpage | Generic fallback |

---

## 中文

一个 Chrome 浏览器扩展，使用大语言模型（LLM）自动检测并填写网页问卷。支持 OpenAI 兼容接口，包括 DeepSeek、通义千问、月之暗面等。

### 功能特点

- **自动检测** — 自动识别问卷页面并解析题目
- **AI 生成答案** — 使用大语言模型生成合理的回答
- **多种题型** — 支持单选、多选、填空、文本域、评分、矩阵、日期、滑块等
- **平台适配** — 针对问卷星、腾讯问卷、Google Forms 进行优化适配
- **附带文本** — 支持选择"其他"等选项后弹出的额外文本输入框
- **自动提交** — 可配置填写完成后自动提交
- **浮动面板** — 实时显示填写进度和状态日志

### 安装方法

1. 从 [Releases](https://github.com/braze-taffo/auto-questionnaire-filler/releases) 页面下载最新版本
2. 解压下载的 zip 文件
3. 打开 Chrome 浏览器 → 地址栏输入 `chrome://extensions` → 开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择解压后的文件夹

### 配置说明

1. 点击浏览器工具栏中的插件图标
2. 填写 API 配置信息：
   - **API 地址** — 例如 `https://api.deepseek.com/v1`
   - **API Key** — 你的密钥
   - **模型名称** — 例如 `deepseek-chat`
3. 点击 **测试连接** 验证配置是否正确
4. 根据需要调整回答风格和自动提交设置

### 使用方法

1. 打开任意问卷页面
2. 页面右下角会出现浮动面板
3. 点击 **开始填写** 按钮
4. 插件会自动解析题目、调用 AI 生成答案并逐题填写

### 支持平台

| 平台 | 网址 | 支持状态 |
|------|------|----------|
| 问卷星 | wjx.cn, sojump.com | 专项适配 |
| 腾讯问卷 | wj.qq.com | 专项适配 |
| Google Forms | docs.google.com/forms | 专项适配 |
| 其他表单 | 任意网页 | 通用适配 |

---

## License / 开源协议

[MIT License](LICENSE)
