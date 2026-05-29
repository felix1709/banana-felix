# 蕉蕉Agent 开发计划清单

> 影视创作智能体 — 完整开发任务清单
> 版本：v1.0 | 日期：2026-05-27

---

## 一、需求摘要

为香蕉画布新增 AI 智能体"蕉蕉"，集成：
- 独立人设对话 + 头脑风暴
- Skill 技能调度（分镜创作、提示词优化）
- 画布状态识别 + 提示词优化
- 确认式画布节点部署
- 悬浮气泡入口 + 窗口展开/收起

## 二、技术决策

| 决策项 | 方案 |
|--------|------|
| LLM API | 复用项目 baseUrl + apiKey，调用 /v1/chat/completions |
| 流式输出 | 支持 SSE streaming，逐字显示 Agent 回复 |
| 首批 Skill | 分镜创作 + 提示词优化 |
| 分镜部署 | 每镜头 = gen-image + text-node + 连线 |
| 蕉蕉头像 | 🍌 emoji |
| 对话持久化 | localStorage（key: banana_canvas_agent） |
| 面板状态 | 独立 agentStore，不污染 uiStore |

## 三、文件清单

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `src/types/agent.ts` | 新建 | Agent 类型定义 |
| 2 | `src/stores/agentStore.ts` | 新建 | Agent 状态管理 |
| 3 | `src/services/chatService.ts` | 新建 | LLM 对话服务（含 streaming） |
| 4 | `src/services/skillRegistry.ts` | 新建 | Skill 注册表 + 执行管道 |
| 5 | `src/components/Agent/JiaojiaoBubble.tsx` | 新建 | 悬浮气泡按钮 |
| 6 | `src/components/Agent/JiaojiaoPanel.tsx` | 新建 | 聊天面板主组件 |
| 7 | `src/components/Agent/ChatBubble.tsx` | 新建 | 对话气泡组件 |
| 8 | `src/components/Agent/SkillSelector.tsx` | 新建 | Skill 选择模块 |
| 9 | `src/components/Agent/NodeDeployPreview.tsx` | 新建 | 节点部署预览 |
| 10 | `src/services/apiService.ts` | 修改 | 新增 streaming chat 支持 |
| 11 | `src/App.tsx` | 修改 | 渲染 Bubble + Panel，paneClick 收起 |
| 12 | `src/styles/index.css` | 修改 | Agent 动画样式 |

## 四、实施步骤

### 步骤 1：类型定义 `src/types/agent.ts`
- [ ] AgentStatus 枚举
- [ ] ChatMessage 接口
- [ ] SkillDefinition 接口
- [ ] SkillCallResult 接口
- [ ] DeployPreview / PreviewNode / PreviewEdge 接口

### 步骤 2：Agent Store `src/stores/agentStore.ts`
- [ ] 面板状态：panelOpen, panelCollapsed
- [ ] 对话：messages, status
- [ ] 配置：selectedModel, loadedSkills
- [ ] 部署：pendingDeploy
- [ ] localStorage 持久化（messages, model, skills）
- [ ] Actions: open/close/toggle/collapse, addMessage, setStatus, loadSkill/unloadSkill, setPendingDeploy, confirmDeploy

### 步骤 3：Chat 服务 `src/services/chatService.ts`
- [ ] sendChatMessage() — 非流式
- [ ] streamChatMessage() — 流式 SSE
- [ ] buildCanvasContext() — 读取画布节点构建上下文
- [ ] 复用 apiService 的 baseUrl + apiKey

### 步骤 4：Skill 注册表 `src/services/skillRegistry.ts`
- [ ] 分镜创作 Skill 定义（systemPrompt + outputFormat）
- [ ] 提示词优化 Skill 定义
- [ ] getSkill() / getAllSkills()
- [ ] executeSkill() — 组装消息 → 调 LLM → 解析 JSON 输出

### 步骤 5：悬浮气泡 `src/components/Agent/JiaojiaoBubble.tsx`
- [ ] fixed 定位，left:48 bottom:20, z-[200]
- [ ] 🍌 emoji + 呼吸光效动画
- [ ] 点击 toggle panelOpen

### 步骤 6：聊天面板 `src/components/Agent/JiaojiaoPanel.tsx`
- [ ] fixed 定位，left:36 top:36 bottom:0, w:380, z-[200]
- [ ] 顶部栏：蕉蕉名称 + 模型下拉 + 最小化/关闭
- [ ] 状态栏：🍌 头像 + 状态文字
- [ ] Skill 区：已加载 Skill 列表 + 加载/卸载
- [ ] 对话区：ChatBubble 列表，自定义滚动条
- [ ] 输入区：文本框 + 发送按钮
- [ ] 滑入/滑出动画

### 步骤 7：对话气泡 `src/components/Agent/ChatBubble.tsx`
- [ ] 用户消息右对齐（蓝底白字）
- [ ] Agent 消息左对齐（灰底，带🍌头像）
- [ ] 长文本自适应高度
- [ ] 流式文字逐字显示

### 步骤 8：Skill 选择器 `src/components/Agent/SkillSelector.tsx`
- [ ] Skill 列表（名称 + 图标 + 描述）
- [ ] 点击加载/卸载
- [ ] 已加载高亮

### 步骤 9：节点部署预览 `src/components/Agent/NodeDeployPreview.tsx`
- [ ] 展示 Skill 生成结果摘要
- [ ] 分镜：镜头编号 + 描述列表
- [ ] 提示词优化：原文 vs 优化后对比
- [ ] [确认部署] [调整] 按钮
- [ ] 确认后触发画布节点创建

### 步骤 10：节点部署逻辑（在 agentStore 或独立 service）
- [ ] findEmptySpot 空位定位算法（复用 CanvasNodeComponent）
- [ ] gen-image + text-node 创建 + 连线
- [ ] 分镜 JSON → 节点映射
- [ ] graphStore.addNode + setNodes(toXyNode)
- [ ] graphStore.addEdge + setEdges(toXyEdge)
- [ ] 部署完成 toast 提示

### 步骤 11：修改现有文件
- [ ] apiService.ts：新增 streamChatCompletion 函数
- [ ] App.tsx：渲染 Bubble + Panel，onPaneClick 收起面板
- [ ] index.css：Agent 面板动画 + 气泡呼吸光效

## 五、蕉蕉人设提示词

```
你是蕉蕉，一位专业影视/广告全能创作者、分镜创意大师。

性格特点：
- 沟通亲和、有网感、不机械呆板，擅长循序渐进头脑风暴
- 主动追问细节、补全用户模糊需求，引导用户完善创意
- 创意沟通时轻松活跃，专业创作时严谨专业
- 懂镜头语言、广告逻辑、画面构图，能结合用户现有画布资源做适配创作

工作方式：
1. 先通过多轮对话了解用户的创作需求（主题、风格、参考、镜头偏好等）
2. 需求不清晰时主动追问，不盲目执行
3. 需求明确后，告知用户即将调用Skill执行创作
4. 等待Skill返回结果后展示给用户确认
5. 用户确认后才部署到画布

约束：
- 只负责对话和调度，不直接生成专业内容
- 不修改、删除、移动用户原有画布节点
- 所有专业内容生成由Skill完成
```

## 六、分镜 Skill 输出格式

```json
{
  "title": "科幻短片",
  "totalShots": 8,
  "shots": [
    {
      "shotNumber": 1,
      "shotType": "远景",
      "cameraMovement": "缓慢推入",
      "duration": 3,
      "visualDescription": "浩瀚星空中，一艘飞船缓缓驶向蓝色星球",
      "prompt": "Wide shot of a spacecraft approaching a blue planet in deep space, slow push-in, cinematic lighting, sci-fi atmosphere, 4K"
    }
  ]
}
```

## 七、兼容性约束

- ✅ 不修改、不覆盖任何现有节点组件
- ✅ 不改动 TopBar、LeftToolbar 等现有 UI
- ✅ 不影响项目保存/读取 (.gaga 格式)
- ✅ 不影响 Ctrl+S/Z/Y/D 等现有快捷键
- ✅ Agent 面板是独立层，不影响画布拖拽/缩放/连线
- ✅ Agent 只新增节点，不修改/删除/移动已有节点

## 八、验证清单

- [ ] 左下角气泡常驻显示，不受画布缩放/平移影响
- [ ] 点击气泡展开聊天面板
- [ ] 选择 chat 模型正常工作
- [ ] 加载分镜Skill后，蕉蕉以人设语气开始对话
- [ ] 多轮对话流畅，蕉蕉主动追问细节
- [ ] 流式输出逐字显示
- [ ] 分镜Skill生成结构化结果 + 预览卡片
- [ ] 用户确认后，gen-image + text-node 按序部署
- [ ] 部署节点自动填充prompt + 创建连线
- [ ] 提示词优化Skill正常工作
- [ ] 点击画布空白收起面板，气泡保留
- [ ] 重新展开恢复全部对话状态
- [ ] 刷新页面后对话记录、模型、Skill选择保留
- [ ] 不影响现有节点拖拽、连线、生成、保存功能
- [ ] 无白屏、无报错、无卡顿
