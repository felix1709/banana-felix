export interface AgentImageNodeSpec {
  nodeName: string;
  prompt: string;
}

const IMAGE_NODE_COMMAND = /(生成|创建|新增|建立|部署|放到|传送).{0,10}(节点|图片节点|图片生成节点|生图节点|画布)|节点.{0,10}(生成|创建|新增|建立|部署)|确认部署|部署到画布|应用优化/;
const ROLE_HEADING = /^(?:#{1,6}\s*)?(?:[-*]\s*)?角色(?:\s*[一二三四五六七八九十\dA-Za-z]*)?\s*[:：]\s*(.+?)\s*$/;
const ROLE_FIELD = /^(?:[-*•]\s*)?(外观|气质|动作特征|性格|服装|发型|能力|特征|设定|身份|道具)\s*[:：]\s*(.+?)\s*$/;
const SECTION_HEADING = /^(?:#{1,6}\s*|[-*]\s*)?(.+?(?:完整提示词|提示词|分镜|镜头|画面|场景))\s*[:：]?\s*$/;
const PROMPT_VALUE_LINE = /^(?:优化后|最终提示词|完整提示词|提示词)\s*[:：]\s*(.+)$/;
const CHATTER_LINE = /^(?:我先|我会|接下来|需要我|是否需要|你可以|请点击|点击|请选择|如果你|好的|已为你|下面是|以下是|示例|例如|使用说明|匹配结果|参考案例|分类|风格|场景|改进|原文)/;
const OPTION_LABEL_LINE = /^(?:[-*•]\s*)?(?:确认部署|部署到画布|应用优化|不用|否|取消|调整|继续调整|手动复制|粘贴提示词|✏️\s*自定义|自定义)(?:[。.!！?？]?|\s*)$/;

export function isImageNodeGenerationRequest(text: string): boolean {
  return IMAGE_NODE_COMMAND.test(text);
}

export function parseRoleImageNodeSpecs(text: string): AgentImageNodeSpec[] {
  const specs: AgentImageNodeSpec[] = [];
  let currentName = "";
  let currentPromptLines: string[] = [];

  const flush = () => {
    if (!currentName || currentPromptLines.length === 0) return;
    specs.push({
      nodeName: `角色：${currentName}`,
      prompt: currentPromptLines.join("\n"),
    });
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(ROLE_HEADING);
    if (heading) {
      flush();
      currentName = cleanRoleName(heading[1]);
      currentPromptLines = [];
      continue;
    }

    const field = line.match(ROLE_FIELD);
    if (field && currentName) {
      currentPromptLines.push(`- ${field[1]}：${field[2].trim()}`);
    }
  }

  flush();
  return dedupeSpecs(specs);
}

export function parseImageNodeSpecsForAgentCommand(requestText: string, assistantText: string): AgentImageNodeSpec[] {
  if (!isImageNodeGenerationRequest(requestText)) return [];
  const fromAssistant = parseRoleImageNodeSpecs(assistantText);
  const fromRequest = parseRoleImageNodeSpecs(requestText);
  const roleSpecs = dedupeSpecs([...fromAssistant, ...fromRequest]);
  if (roleSpecs.length > 0) return roleSpecs;

  const titledSpecs = parseTitledPromptNodeSpecs(assistantText);
  if (titledSpecs.length > 0) return titledSpecs;

  const singlePrompt = cleanPromptTextForCanvas(assistantText);
  if (!singlePrompt) return [];
  return [{ nodeName: "出图提示词", prompt: singlePrompt }];
}

export function parseTitledPromptNodeSpecs(text: string): AgentImageNodeSpec[] {
  const specs: AgentImageNodeSpec[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  const flush = () => {
    const prompt = cleanPromptTextForCanvas(currentLines.join("\n"));
    if (!currentTitle || !prompt) return;
    specs.push({ nodeName: cleanGenericTitle(currentTitle), prompt });
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      if (currentTitle) currentLines.push("");
      continue;
    }

    const heading = line.match(SECTION_HEADING);
    if (heading && !ROLE_HEADING.test(line)) {
      flush();
      currentTitle = heading[1].trim();
      currentLines = [];
      continue;
    }

    if (currentTitle) {
      currentLines.push(rawLine.trimEnd());
    }
  }

  flush();
  return dedupeSpecs(specs);
}

export function cleanPromptTextForCanvas(text: string): string {
  const withoutBlocks = text
    .replace(/\[OPTIONS\][\s\S]*?(?:\[\/OPTIONS\]|$)/g, "")
    .replace(/\[STORYBOARD_COMPLETE\][\s\S]*?(?:\[\/STORYBOARD_COMPLETE\]|$)/g, "")
    .replace(/```(?:\w+)?/g, "");

  const lines: string[] = [];
  for (const rawLine of withoutBlocks.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const promptValue = line.match(PROMPT_VALUE_LINE);
    if (promptValue?.[1]?.trim()) {
      lines.push(promptValue[1].trim());
      continue;
    }

    const normalized = line.replace(/^#{1,6}\s*/, "").trim();
    if (CHATTER_LINE.test(normalized)) continue;
    if (OPTION_LABEL_LINE.test(normalized)) continue;
    if (/^\[\/?[A-Z_]+\]$/.test(normalized)) continue;
    if (/^(?:[-*•]\s*)?(?:是|否|确认|不用|自定义)$/.test(normalized)) continue;

    lines.push(line);
  }

  return lines.join("\n").trim();
}

function cleanRoleName(name: string): string {
  return name
    .replace(/[。.!！?？]+$/g, "")
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
    .trim();
}

function cleanGenericTitle(title: string): string {
  return title
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
    .replace(/[。.!！?？]+$/g, "")
    .trim();
}

function dedupeSpecs(specs: AgentImageNodeSpec[]): AgentImageNodeSpec[] {
  const seen = new Set<string>();
  const result: AgentImageNodeSpec[] = [];
  for (const spec of specs) {
    const key = `${spec.nodeName}\n${spec.prompt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(spec);
  }
  return result;
}
