# MyAI 私人 AI 聊天助手

一个可部署到 HTTPS 静态网站、并添加到 iPhone 主屏幕的 PWA。支持：
- OpenAI 兼容 Chat Completions 接口
- Anthropic Messages 接口
- 手动配置多个模型并切换
- 本地保存聊天记录
- Markdown 渲染
- 上传最多 4 张图片进行视觉问答（取决于模型和中转站能力）

## 重要说明
1. 本项目是个人自用的前端原型。API Key 存在当前浏览器 localStorage 中，不适合公开给多人使用。
2. 浏览器直接请求中转站，需要中转站允许网页来源的 CORS 请求。
3. OpenAI 协议图片格式使用 `image_url`；Anthropic 使用 `image` + base64。中转站需完整支持对应格式。
4. Anthropic 请求使用 `x-api-key`、`anthropic-version` 和 `anthropic-dangerous-direct-browser-access` 请求头。部分中转站可能只接受 Bearer Token 或不允许浏览器直连；如遇此情况需按服务商文档调整或增加后端代理。
5. 目前不包含流式输出、语音、文件上传和跨设备同步。
6. 聊天记录及图片保存在浏览器本机，清理 Safari 网站数据可能导致记录丢失。图片会压缩后保存，但大量图片仍可能占用本机存储。

## 本地预览
PWA / Service Worker 需要 HTTPS 或 localhost。不要直接用 `file://` 打开。
在电脑安装 Python 后，在项目目录运行：
```bash
python -m http.server 8000
```
浏览器打开 `http://localhost:8000`。

## 部署到 GitHub Pages（免费静态托管）
1. 注册或登录 GitHub，创建一个 Public 仓库，例如 `myai-chat`。
2. 将本项目所有文件上传到仓库根目录。
3. 打开仓库 Settings -> Pages。
4. 在 Build and deployment 中选择 Deploy from a branch。
5. Branch 选择 `main`，目录选择 `/ (root)`，保存。
6. 等待 GitHub Pages 发布，打开页面提供的 HTTPS 地址。

如果使用 GitHub Pages，仓库内容是公开的；本项目没有把 API Key 写进代码或仓库，填写的 Key 只保存在你自己的浏览器里。不要把真实 Key 写入任何项目文件。

## iPhone 添加到主屏幕
1. 用 iPhone Safari 打开部署后的 HTTPS 地址。
2. 点击底部分享按钮。
3. 选择“添加到主屏幕”。
4. 确认名称为 MyAI，点击添加。
5. 从主屏幕图标打开。

## 填写接口
打开右上角设置：
- 接口协议：按中转站支持情况选择 OpenAI 或 Anthropic。
- Base URL：通常填 `https://域名/v1`。不要填 Key。
- API Key：粘贴你自己的 Key。
- 模型列表：每行填写一个模型 ID。
- 默认模型：填写其中一个模型 ID。
- 保存设置，然后点击“测试连接”。

### URL 拼接规则
OpenAI：
- Base URL `https://host/v1` -> 请求 `https://host/v1/chat/completions`
- 如果 Base URL 已经以 `/chat/completions` 结尾，则直接使用。

Anthropic：
- Base URL `https://host/v1` -> 请求 `https://host/v1/messages`
- 如果 Base URL 已经以 `/messages` 结尾，则直接使用。

如果你的中转站要求不同路径、不同认证头或自定义请求体，需要根据中转站文档修改 `app.js` 中的 `endpoint()` 和 `callAI()`。

## 常见问题
- **Failed to fetch / CORS**：中转站未开放浏览器跨域，或 HTTPS 页面请求了 HTTP 地址。需要中转站开启 CORS，或部署一个后端代理。
- **401 / 403**：检查 Key、权限和认证头格式。
- **404**：检查 Base URL 与接口路径拼接。
- **模型不存在**：检查模型 ID 是否是中转站实际支持的 ID。
- **图片报错**：确认所选模型有视觉能力，中转站允许图片输入，且协议格式兼容。
- **Anthropic 浏览器请求失败**：部分服务商不支持浏览器直连或不支持相关请求头，需要使用服务商指定的兼容方式或后端代理。

## 安全建议
如果准备长期使用，建议改成“前端网页 + 自己的后端代理”结构，由后端保存 API Key，并限制访问来源、请求频率和额度。不要把 Key 硬编码进 HTML、JS、Git 仓库或公开链接。
