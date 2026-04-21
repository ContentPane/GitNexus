/**
 * LLM Prompt Templates for Wiki Generation
 *
 * All prompts produce deterministic, source-grounded documentation.
 * Templates use {{PLACEHOLDER}} substitution.
 */

// ─── Grouping Prompt ──────────────────────────────────────────────────

export const GROUPING_SYSTEM_PROMPT = `你是一个文档架构师。给定源文件列表及其导出的符号，将它们分组为逻辑文档模块。

规则：
- 每个模块应该代表一个具有内聚性的功能、层或领域
- 每个文件必须只出现在一个模块中
- 模块名称应该易于理解（例如 "认证", "数据库层", "API路由"）
- 对于典型项目，目标是5-15个模块。小型项目可少些，大型项目可多些
- 按功能分组，而不是仅按文件类型或目录结构分组
- 不要为测试、配置或非源文件创建模块`;

export const GROUPING_USER_PROMPT = `将这些源文件分组到文档模块中。

**文件及其导出：**
{{FILE_LIST}}

**目录结构：**
{{DIRECTORY_TREE}}

仅返回一个JSON对象，将模块名称映射到文件路径数组。不要使用markdown，不要解释。
示例格式：
{
  "认证": ["src/auth/login.ts", "src/auth/session.ts"],
  "数据库": ["src/db/connection.ts", "src/db/models.ts"]
}`;

// ─── Leaf Module Prompt ───────────────────────────────────────────────

export const MODULE_SYSTEM_PROMPT = `你是一个技术文档编写者。为代码模块编写清晰、面向开发者的文档。

规则：
- 仅输出文档内容 — 不要添加元评论如"我已编写..."、"这是文档..."、"文档涵盖..."等
- 直接从模块标题和内容开始
- 引用实际的函数名、类名和代码模式 — 不要虚构API
- 使用调用图和执行流程数据以确保准确性，但不要机械地列出每一条边
- 仅在真正有助于理解时才包含Mermaid图表。保持图表较小（最多5-10个节点）
- 按适合此模块的方式组织文档 — 没有强制格式
- 为需要理解和贡献此代码的开发者编写`;

export const MODULE_USER_PROMPT = `为 **{{MODULE_NAME}}** 模块编写文档。

## 源代码

{{SOURCE_CODE}}

## 调用图与执行流程（用于确保准确性）

内部调用：{{INTRA_CALLS}}
对外调用：{{OUTGOING_CALLS}}
被调用：{{INCOMING_CALLS}}
执行流程：{{PROCESSES}}

---

为该模块编写全面的文档。涵盖其目的、工作原理、关键组件，以及它如何与代码库的其他部分连接。使用最适合此模块的结构 — 由你决定章节和标题。仅在真正能阐明架构时才包含Mermaid图表。`;

// ─── Parent Module Prompt ─────────────────────────────────────────────

export const PARENT_SYSTEM_PROMPT = `你是一个技术文档编写者。为包含子模块的模块编写摘要页面。综合子模块的文档 — 不要重新阅读源代码。

规则：
- 仅输出文档内容 — 不要添加元评论如"我已编写..."、"这是文档..."、"文档涵盖..."等
- 直接从模块标题和内容开始
- 引用子模块中的实际组件
- 专注于子模块如何协同工作，而不是重复它们各自的文档
- 保持简洁 — 读者可以点击进入子页面查看详情
- 仅在真正能阐明子模块关系时才包含Mermaid图表`;

export const PARENT_USER_PROMPT = `为 **{{MODULE_NAME}}** 模块编写文档，该模块包含以下子模块：

{{CHILDREN_DOCS}}

跨模块调用：{{CROSS_MODULE_CALLS}}
共享执行流程：{{CROSS_PROCESSES}}

---

为该模块组编写简洁的概览。解释其目的、子模块如何组合在一起，以及贯穿它们的关键工作流程。链接到子模块页面（例如 \`[子模块名称](sub-module-slug.md)\`），而不是重复其内容。使用最适合的结构。`;

// ─── Overview Prompt ──────────────────────────────────────────────────

export const OVERVIEW_SYSTEM_PROMPT = `你是一个技术文档编写者。为代码库Wiki编写顶层概览页面。这是新开发者看到的第一个页面。

规则：
- 仅输出文档内容 — 不要添加元评论如"我已编写..."、"这是文档..."、"页面已重写..."等
- 直接从项目标题和内容开始
- 保持清晰和友好 — 这是整个代码库的入口点
- 引用实际的模块名称，以便读者可以导航到其文档
- 包含高层Mermaid架构图，仅显示最重要的模块及其关系（最多10个节点）。新开发者应在10秒内理解
- 不要创建模块索引表或列出每个模块的描述 — 只在文本中自然地链接到模块页面
- 使用模块间边和执行流程数据以确保准确性，但不要原始输出`;

export const OVERVIEW_USER_PROMPT = `为该代码库的Wiki编写概览页面。

## 项目信息

{{PROJECT_INFO}}

## 模块摘要

{{MODULE_SUMMARIES}}

## 参考数据（用于准确性 — 不要逐字复现）

模块间调用边：{{MODULE_EDGES}}
关键系统流程：{{TOP_PROCESSES}}

---

为该项目编写清晰的概览：它做什么、如何架构、以及关键的端到端流程。包含一个简单的Mermaid架构图（最多10个节点，仅展示大图景）。在文本中自然地链接到模块页面（例如 \`[模块名称](module-slug.md)\`），而不是在表格中列出。如果提供了项目配置，包含简短的设置说明。使用最适合阅读的结构。`;

// ─── Template Substitution Helper ─────────────────────────────────────

/**
 * Replace {{PLACEHOLDER}} tokens in a template string.
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// ─── Formatting Helpers ───────────────────────────────────────────────

/**
 * Format file list with exports for the grouping prompt.
 */
export function formatFileListForGrouping(
  files: Array<{ filePath: string; symbols: Array<{ name: string; type: string }> }>,
): string {
  return files
    .map((f) => {
      const exports =
        f.symbols.length > 0
          ? f.symbols.map((s) => `${s.name} (${s.type})`).join(', ')
          : '无导出';
      return `- ${f.filePath}: ${exports}`;
    })
    .join('\n');
}

/**
 * Build a directory tree string from file paths.
 */
export function formatDirectoryTree(filePaths: string[]): string {
  const dirs = new Set<string>();
  for (const fp of filePaths) {
    const parts = fp.replace(/\\/g, '/').split('/');
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'));
    }
  }

  const sorted = Array.from(dirs).sort();
  if (sorted.length === 0) return '(扁平结构)';

  return (
    sorted.slice(0, 50).join('\n') +
    (sorted.length > 50 ? `\n... 还有 ${sorted.length - 50} 个目录` : '')
  );
}

/**
 * Format call edges as readable text.
 */
export function formatCallEdges(
  edges: Array<{ fromFile: string; fromName: string; toFile: string; toName: string }>,
): string {
  if (edges.length === 0) return '无';
  return edges
    .slice(0, 30)
    .map((e) => `${e.fromName} (${shortPath(e.fromFile)}) → ${e.toName} (${shortPath(e.toFile)})`)
    .join('\n');
}

/**
 * Format process traces as readable text.
 */
export function formatProcesses(
  processes: Array<{
    label: string;
    type: string;
    steps: Array<{ step: number; name: string; filePath: string }>;
  }>,
): string {
  if (processes.length === 0) return '该模块未检测到执行流程。';

  return processes
    .map((p) => {
      const stepsText = p.steps
        .map((s) => `  ${s.step}. ${s.name} (${shortPath(s.filePath)})`)
        .join('\n');
      return `**${p.label}** (${p.type}):\n${stepsText}`;
    })
    .join('\n\n');
}

/**
 * Shorten a file path for readability.
 */
function shortPath(fp: string): string {
  const parts = fp.replace(/\\/g, '/').split('/');
  return parts.length > 3 ? parts.slice(-3).join('/') : fp;
}