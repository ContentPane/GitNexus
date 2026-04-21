/**
 * Module Filter for Wiki Generation
 *
 * Handles module selection, exclusion, and change detection.
 * Provides interactive prompts when modules change between generations.
 */

import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import type { ModuleTreeNode } from './generator.js';

export interface ModuleConfig {
  selectedModules: string[];
  excludedModules: string[];
  orphanDocs?: string[];
  lastGeneratedAt: string;
  lastCommit?: string;
}

export interface ModuleFilterResult {
  filteredTree: ModuleTreeNode[];
  newModules: ModuleTreeNode[];
  deletedModules: string[];
  splitModules: Array<{ original: string; children: string[] }>;
}

export interface ModuleChangeReport {
  newModules: ModuleTreeNode[];
  deletedModules: string[];
  splitModules: Array<{ original: string; children: string[] }>;
  currentModules: ModuleTreeNode[];
}

export interface DeletedModulesPromptResult {
  selectedModules: string[];
  confirmedDelete: boolean;
}

export interface ApplyModuleFilterResult {
  filteredTree: ModuleTreeNode[];
  config: ModuleConfig;
  deletedDocs: string[];
}

export interface OrphanDocsResult {
  orphanDocs: string[];
  confirmedDelete: boolean;
}

const CONFIG_FILE = 'module_config.json';

function slugify(name: string): string {
  // Try ASCII slug first
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // If empty (e.g., Chinese name), preserve Unicode characters
  if (slug.length === 0) {
    slug = name
      .replace(/[\s/\\:*?"<>|]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  return slug || 'unnamed-module';
}

export async function cleanupDeletedModuleDocs(
  wikiDir: string,
  deletedModules: string[],
  currentTree: ModuleTreeNode[],
): Promise<string[]> {
  const currentSlugs = new Set<string>();
  const collectSlugs = (nodes: ModuleTreeNode[]) => {
    for (const node of nodes) {
      currentSlugs.add(slugify(node.name));
      if (node.children) collectSlugs(node.children);
    }
  };
  collectSlugs(currentTree);

  const removed: string[] = [];
  for (const moduleName of deletedModules) {
    const slug = slugify(moduleName);
    if (!currentSlugs.has(slug)) {
      const mdPath = path.join(wikiDir, `${slug}.md`);
      try {
        await fs.unlink(mdPath);
        removed.push(moduleName);
      } catch {}
    }
  }
  return removed;
}

export async function loadModuleConfig(wikiDir: string): Promise<ModuleConfig | null> {
  try {
    const raw = await fs.readFile(path.join(wikiDir, CONFIG_FILE), 'utf-8');
    return JSON.parse(raw) as ModuleConfig;
  } catch {
    return null;
  }
}

export async function saveModuleConfig(wikiDir: string, config: ModuleConfig): Promise<void> {
  await fs.writeFile(
    path.join(wikiDir, CONFIG_FILE),
    JSON.stringify(config, null, 2),
    'utf-8',
  );
}

export async function deleteModuleConfig(wikiDir: string): Promise<void> {
  try {
    await fs.unlink(path.join(wikiDir, CONFIG_FILE));
  } catch {}
}

export function getAllModuleNames(tree: ModuleTreeNode[]): string[] {
  const names: string[] = [];
  for (const node of tree) {
    names.push(node.name);
    if (node.children) {
      for (const child of node.children) {
        names.push(child.name);
      }
    }
  }
  return names;
}

export function findModuleByName(tree: ModuleTreeNode[], name: string): ModuleTreeNode | null {
  for (const node of tree) {
    if (node.name === name) return node;
    if (node.children) {
      for (const child of node.children) {
        if (child.name === name) return child;
      }
    }
  }
  return null;
}

export function filterModuleTree(
  tree: ModuleTreeNode[],
  selectedModules: string[],
  excludedModules: string[],
): ModuleTreeNode[] {
  if (selectedModules.length === 0 && excludedModules.length === 0) {
    return tree;
  }

  const selectedSet = new Set(selectedModules);
  const excludedSet = new Set(excludedModules);

  const filtered: ModuleTreeNode[] = [];

  for (const node of tree) {
    if (excludedSet.has(node.name)) continue;

    if (node.children && node.children.length > 0) {
      // Parent node with children
      if (selectedSet.has(node.name)) {
        // Parent selected -> include all children (unless excluded)
        const filteredChildren = node.children.filter((child) => !excludedSet.has(child.name));
        if (filteredChildren.length > 0) {
          filtered.push({
            ...node,
            children: filteredChildren,
            files: [],
          });
        }
      } else {
        // Parent not selected -> check individual children
        const filteredChildren = node.children.filter((child) => {
          if (excludedSet.has(child.name)) return false;
          if (selectedSet.size > 0 && !selectedSet.has(child.name)) return false;
          return true;
        });
        if (filteredChildren.length > 0) {
          filtered.push({
            ...node,
            children: filteredChildren,
            files: [],
          });
        }
      }
    } else {
      // Leaf node: check directly
      if (selectedSet.size > 0 && !selectedSet.has(node.name)) continue;
      filtered.push(node);
    }
  }

  return filtered;
}

export function detectModuleChanges(
  oldConfig: ModuleConfig,
  currentTree: ModuleTreeNode[],
): ModuleChangeReport {
  const oldSelected = new Set(oldConfig.selectedModules);
  const oldExcluded = new Set(oldConfig.excludedModules);
  const currentNames = new Set(getAllModuleNames(currentTree));

  const newModules: ModuleTreeNode[] = [];
  const deletedModules: string[] = [];
  const splitModules: Array<{ original: string; children: string[] }> = [];

  for (const name of oldSelected) {
    if (!currentNames.has(name)) {
      deletedModules.push(name);
    }
  }

  for (const name of oldExcluded) {
    if (!currentNames.has(name)) {
      deletedModules.push(name);
    }
  }

  for (const node of currentTree) {
    if (!oldSelected.has(node.name) && !oldExcluded.has(node.name)) {
      if (node.children && node.children.length > 0) {
        const allChildrenWereInOld = node.children.every(
          (child) => oldSelected.has(child.name) || oldExcluded.has(child.name),
        );
        if (!allChildrenWereInOld) {
          newModules.push(node);
        } else {
          splitModules.push({
            original: node.name,
            children: node.children.map((c) => c.name),
          });
        }
      } else {
        newModules.push(node);
      }
    }

    if (node.children) {
      for (const child of node.children) {
        if (!oldSelected.has(child.name) && !oldExcluded.has(child.name)) {
          const parentWasInOld = oldSelected.has(node.name) || oldExcluded.has(node.name);
          if (!parentWasInOld) {
            newModules.push(child);
          }
        }
      }
    }
  }

  return {
    newModules,
    deletedModules,
    splitModules,
    currentModules: currentTree,
  };
}

async function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function promptForNewModules(
  newModules: ModuleTreeNode[],
): Promise<{ added: string[]; skipped: string[] }> {
  if (!process.stdin.isTTY) {
    return { added: newModules.map((m) => m.name), skipped: [] };
  }

  console.log('\n  New modules detected:\n');
  for (const mod of newModules) {
    const fileCount = mod.files?.length || mod.children?.length || 0;
    console.log(`    - ${mod.name} (${fileCount} items)`);
  }
  console.log('');

  const answer = await prompt('  Add these to generation? (Y/n/select): ');
  const choice = answer.toLowerCase();

  if (choice === 'n' || choice === 'no') {
    return { added: [], skipped: newModules.map((m) => m.name) };
  }

  if (choice === 'select' || choice === 's') {
    console.log('\n  Enter module names to add (comma-separated):\n');
    const names = newModules.map((m) => m.name).join(', ');
    console.log(`  Available: ${names}\n`);
    const selectAnswer = await prompt('  Modules to add: ');
    const selected = selectAnswer
      .split(',')
      .map((s) => s.trim())
      .filter((s) => newModules.some((m) => m.name === s));
    const skipped = newModules.map((m) => m.name).filter((n) => !selected.includes(n));
    return { added: selected, skipped };
  }

  return { added: newModules.map((m) => m.name), skipped: [] };
}

export async function promptForDeletedModules(
  deletedModules: string[],
  currentModules: ModuleTreeNode[],
  oldSelected: string[],
): Promise<DeletedModulesPromptResult> {
  if (!process.stdin.isTTY) {
    const remaining = oldSelected.filter((n) => !deletedModules.includes(n));
    return { selectedModules: remaining, confirmedDelete: true };
  }

  console.log('\n  ⚠ Previously selected modules no longer exist:\n');
  for (const name of deletedModules) {
    console.log(`    - ${name}`);
  }
  console.log('\n  Their documentation files will be removed.\n');
  console.log('  Current available modules:\n');

  for (const mod of currentModules) {
    const fileCount = mod.files?.length || 0;
    const childCount = mod.children?.length || 0;
    const suffix =
      fileCount > 0 ? ` (${fileCount} files)` : childCount > 0 ? ` (${childCount} children)` : '';
    console.log(`    - ${mod.name}${suffix}`);
    if (mod.children) {
      for (const child of mod.children) {
        console.log(`      - ${child.name} (${child.files?.length || 0} files)`);
      }
    }
  }
  console.log('');

  const answer = await prompt('  Continue and select modules? (Y/n/select): ');
  const choice = answer.toLowerCase().trim();

  if (choice === 'n' || choice === 'no') {
    return { selectedModules: [], confirmedDelete: false };
  }

  if (choice === 'select' || choice === 's') {
    console.log('\n  Enter module names to generate (comma-separated):\n');
    const names = getAllModuleNames(currentModules).join(', ');
    console.log(`  Available: ${names}\n`);
    const selectAnswer = await prompt('  Modules to generate: ');
    const selected = selectAnswer
      .split(',')
      .map((s) => s.trim())
      .filter((s) => {
        const allNames = getAllModuleNames(currentModules);
        return allNames.includes(s);
      });
    return { selectedModules: selected, confirmedDelete: true };
  }

  const remaining = oldSelected.filter((n) => !deletedModules.includes(n));
  return { selectedModules: remaining, confirmedDelete: true };
}

export function formatModuleList(tree: ModuleTreeNode[], detail: boolean): string {
  const lines: string[] = [];

  const printNode = (node: ModuleTreeNode, indent: number) => {
    const prefix = '  '.repeat(indent);
    const fileCount = node.files?.length || 0;
    const childCount = node.children?.length || 0;

    if (detail) {
      lines.push(`${prefix}${node.name}`);
      if (fileCount > 0) {
        lines.push(`${prefix}  Files (${fileCount}):`);
        for (const file of node.files.slice(0, 10)) {
          lines.push(`${prefix}    - ${file}`);
        }
        if (node.files.length > 10) {
          lines.push(`${prefix}    ... and ${node.files.length - 10} more`);
        }
      }
      if (childCount > 0) {
        lines.push(`${prefix}  Children (${childCount}):`);
        for (const child of node.children) {
          printNode(child, indent + 2);
        }
      }
      lines.push('');
    } else {
      const suffix = fileCount > 0 ? ` (${fileCount} files)` : childCount > 0 ? ` (${childCount} children)` : '';
      lines.push(`${prefix}- ${node.name}${suffix}`);
      if (node.children) {
        for (const child of node.children) {
          const childPrefix = '  '.repeat(indent + 1);
          const childFiles = child.files?.length || 0;
          lines.push(`${childPrefix}  - ${child.name} (${childFiles} files)`);
        }
      }
    }
  };

  for (const node of tree) {
    printNode(node, 0);
  }

  return lines.join('\n');
}

export async function applyModuleFilterWithPrompts(
  tree: ModuleTreeNode[],
  existingConfig: ModuleConfig | null,
  cliModules: string[] | undefined,
  cliExcludeModules: string[] | undefined,
  wikiDir: string,
  currentCommit: string,
): Promise<ApplyModuleFilterResult> {
  const deletedDocs: string[] = [];

  if (cliModules || cliExcludeModules) {
    const allModuleNames = getAllModuleNames(tree);

    // Validate CLI module names exist in current tree
    if (cliModules) {
      const notFound = cliModules.filter((m) => !allModuleNames.includes(m));
      if (notFound.length > 0) {
        const availableList = formatModuleList(tree, false);
        throw new Error(
          `Modules not found: ${notFound.join(', ')}\n\nAvailable modules:\n${availableList}`,
        );
      }
    }

    if (cliExcludeModules) {
      const notFound = cliExcludeModules.filter((m) => !allModuleNames.includes(m));
      if (notFound.length > 0) {
        const availableList = formatModuleList(tree, false);
        throw new Error(
          `Exclude modules not found: ${notFound.join(', ')}\n\nAvailable modules:\n${availableList}`,
        );
      }
    }

    const selected = cliModules || existingConfig?.selectedModules || getAllModuleNames(tree);
    const excluded = cliExcludeModules || existingConfig?.excludedModules || [];
    const filteredTree = filterModuleTree(tree, selected, excluded);
    const config: ModuleConfig = {
      selectedModules: selected,
      excludedModules: excluded,
      lastGeneratedAt: new Date().toISOString(),
      lastCommit: currentCommit,
    };
    await saveModuleConfig(wikiDir, config);
    return { filteredTree, config, deletedDocs };
  }

  if (!existingConfig) {
    return {
      filteredTree: tree,
      config: {
        selectedModules: getAllModuleNames(tree),
        excludedModules: [],
        lastGeneratedAt: new Date().toISOString(),
        lastCommit: currentCommit,
      },
      deletedDocs,
    };
  }

  const changes = detectModuleChanges(existingConfig, tree);

  if (changes.newModules.length > 0 && process.stdin.isTTY) {
    const { added, skipped } = await promptForNewModules(changes.newModules);
    existingConfig.selectedModules = [...existingConfig.selectedModules, ...added];
    existingConfig.excludedModules = [...existingConfig.excludedModules, ...skipped];
  }

  if (changes.deletedModules.length > 0 && process.stdin.isTTY) {
    const result = await promptForDeletedModules(
      changes.deletedModules,
      changes.currentModules,
      existingConfig.selectedModules,
    );

    if (!result.confirmedDelete) {
      console.log('\n  Generation cancelled by user.\n');
      process.exit(0);
    }

    existingConfig.selectedModules = result.selectedModules;
    existingConfig.excludedModules = existingConfig.excludedModules.filter(
      (n) => !changes.deletedModules.includes(n),
    );

    const cleaned = await cleanupDeletedModuleDocs(wikiDir, changes.deletedModules, tree);
    deletedDocs.push(...cleaned);
  }

  const filteredTree = filterModuleTree(
    tree,
    existingConfig.selectedModules,
    existingConfig.excludedModules,
  );

  const config: ModuleConfig = {
    ...existingConfig,
    lastGeneratedAt: new Date().toISOString(),
    lastCommit: currentCommit,
  };
  await saveModuleConfig(wikiDir, config);

  return { filteredTree, config, deletedDocs };
}

// ─── Orphan Docs Detection ────────────────────────────────────────────────

export async function detectOrphanDocs(
  wikiDir: string,
  currentModuleTree: ModuleTreeNode[],
): Promise<string[]> {
  const currentSlugs = new Set<string>();
  const collectSlugs = (nodes: ModuleTreeNode[]) => {
    for (const node of nodes) {
      currentSlugs.add(node.slug);
      if (node.children) collectSlugs(node.children);
    }
  };
  collectSlugs(currentModuleTree);

  const dirEntries = await fs.readdir(wikiDir).catch(() => [] as string[]);
  const orphanDocs: string[] = [];

  for (const f of dirEntries) {
    if (f.endsWith('.md') && f !== 'overview.md') {
      const slug = f.replace(/\.md$/, '');
      if (!currentSlugs.has(slug)) {
        orphanDocs.push(slug);
      }
    }
  }

  return orphanDocs;
}

export async function promptForOrphanDocs(
  orphanDocs: string[],
): Promise<OrphanDocsResult> {
  if (!process.stdin.isTTY || orphanDocs.length === 0) {
    return { orphanDocs, confirmedDelete: false };
  }

  console.log('\n  ⚠ Found orphan documentation files not in selected modules:\n');
  for (const slug of orphanDocs) {
    console.log(`    - ${slug}.md`);
  }
  console.log('\n  These files will be preserved but no longer updated.\n');

  const answer = await prompt('  Delete orphan docs? (Y/n): ');
  const choice = answer.toLowerCase().trim();

  if (choice === 'n' || choice === 'no') {
    console.log('\n  Orphan docs preserved.\n');
    return { orphanDocs, confirmedDelete: false };
  }

  return { orphanDocs, confirmedDelete: true };
}

export async function deleteOrphanDocs(
  wikiDir: string,
  orphanDocs: string[],
): Promise<string[]> {
  const deleted: string[] = [];
  for (const slug of orphanDocs) {
    try {
      await fs.unlink(path.join(wikiDir, `${slug}.md`));
      deleted.push(slug);
    } catch {}
  }
  return deleted;
}