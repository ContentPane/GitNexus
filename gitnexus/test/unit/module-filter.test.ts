/**
 * Unit tests for module-filter.ts
 */
import { describe, it, expect } from 'vitest';
import type { ModuleTreeNode } from '../../src/core/wiki/generator.js';
import {
  getAllModuleNames,
  findModuleByName,
  filterModuleTree,
  detectModuleChanges,
  formatModuleList,
  cleanupDeletedModuleDocs,
  type ModuleConfig,
} from '../../src/core/wiki/module-filter.js';

describe('getAllModuleNames', () => {
  it('extracts all module names from flat tree', () => {
    const tree: ModuleTreeNode[] = [
      { name: 'Auth', slug: 'auth', files: ['auth.ts'] },
      { name: 'Services', slug: 'services', files: ['svc.ts'] },
    ];
    expect(getAllModuleNames(tree)).toEqual(['Auth', 'Services']);
  });

  it('extracts names from hierarchical tree', () => {
    const tree: ModuleTreeNode[] = [
      {
        name: 'Core',
        slug: 'core',
        files: [],
        children: [
          { name: 'Core-Auth', slug: 'core-auth', files: ['auth.ts'] },
          { name: 'Core-Db', slug: 'core-db', files: ['db.ts'] },
        ],
      },
    ];
    expect(getAllModuleNames(tree)).toEqual(['Core', 'Core-Auth', 'Core-Db']);
  });
});

describe('findModuleByName', () => {
  it('finds module in flat tree', () => {
    const tree: ModuleTreeNode[] = [
      { name: 'Auth', slug: 'auth', files: ['auth.ts'] },
      { name: 'Services', slug: 'services', files: ['svc.ts'] },
    ];
    const found = findModuleByName(tree, 'Auth');
    expect(found?.name).toBe('Auth');
  });

  it('finds child module in hierarchical tree', () => {
    const tree: ModuleTreeNode[] = [
      {
        name: 'Core',
        slug: 'core',
        files: [],
        children: [
          { name: 'Core-Auth', slug: 'core-auth', files: ['auth.ts'] },
        ],
      },
    ];
    const found = findModuleByName(tree, 'Core-Auth');
    expect(found?.name).toBe('Core-Auth');
  });

  it('returns null when not found', () => {
    const tree: ModuleTreeNode[] = [{ name: 'Auth', slug: 'auth', files: [] }];
    expect(findModuleByName(tree, 'NotFound')).toBeNull();
  });
});

describe('filterModuleTree', () => {
  it('returns full tree when no filters applied', () => {
    const tree: ModuleTreeNode[] = [
      { name: 'Auth', slug: 'auth', files: ['auth.ts'] },
      { name: 'Services', slug: 'services', files: ['svc.ts'] },
    ];
    const result = filterModuleTree(tree, [], []);
    expect(result).toHaveLength(2);
  });

  it('filters to selected modules', () => {
    const tree: ModuleTreeNode[] = [
      { name: 'Auth', slug: 'auth', files: ['auth.ts'] },
      { name: 'Services', slug: 'services', files: ['svc.ts'] },
      { name: 'Eval', slug: 'eval', files: ['eval.ts'] },
    ];
    const result = filterModuleTree(tree, ['Auth', 'Services'], []);
    expect(result).toHaveLength(2);
    expect(result.map((n) => n.name)).toEqual(['Auth', 'Services']);
  });

  it('excludes specified modules', () => {
    const tree: ModuleTreeNode[] = [
      { name: 'Auth', slug: 'auth', files: ['auth.ts'] },
      { name: 'Services', slug: 'services', files: ['svc.ts'] },
      { name: 'Eval', slug: 'eval', files: ['eval.ts'] },
    ];
    const result = filterModuleTree(tree, [], ['Eval']);
    expect(result).toHaveLength(2);
    expect(result.map((n) => n.name)).toEqual(['Auth', 'Services']);
  });

  it('filters child modules in hierarchical tree', () => {
    const tree: ModuleTreeNode[] = [
      {
        name: 'Core',
        slug: 'core',
        files: [],
        children: [
          { name: 'Core-Auth', slug: 'core-auth', files: ['auth.ts'] },
          { name: 'Core-Db', slug: 'core-db', files: ['db.ts'] },
        ],
      },
    ];
    const result = filterModuleTree(tree, ['Core-Auth'], []);
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].name).toBe('Core-Auth');
  });

  it('selects parent module includes all children', () => {
    const tree: ModuleTreeNode[] = [
      {
        name: 'Screen Management',
        slug: 'screen-management',
        files: [],
        children: [
          { name: 'Screen Management — java', slug: 'screen-management-java', files: ['a.java'] },
          { name: 'Screen Management — core', slug: 'screen-management-core', files: ['b.java'] },
        ],
      },
    ];
    const result = filterModuleTree(tree, ['Screen Management'], []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Screen Management');
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children!.map((c) => c.name)).toEqual([
      'Screen Management — java',
      'Screen Management — core',
    ]);
  });

  it('selects parent with excluded child', () => {
    const tree: ModuleTreeNode[] = [
      {
        name: 'Screen Management',
        slug: 'screen-management',
        files: [],
        children: [
          { name: 'Screen Management — java', slug: 'screen-management-java', files: ['a.java'] },
          { name: 'Screen Management — core', slug: 'screen-management-core', files: ['b.java'] },
        ],
      },
    ];
    const result = filterModuleTree(tree, ['Screen Management'], ['Screen Management — core']);
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].name).toBe('Screen Management — java');
  });

  it('excludes child modules in hierarchical tree', () => {
    const tree: ModuleTreeNode[] = [
      {
        name: 'Core',
        slug: 'core',
        files: [],
        children: [
          { name: 'Core-Auth', slug: 'core-auth', files: ['auth.ts'] },
          { name: 'Core-Db', slug: 'core-db', files: ['db.ts'] },
        ],
      },
    ];
    const result = filterModuleTree(tree, [], ['Core-Db']);
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].name).toBe('Core-Auth');
  });
});

describe('detectModuleChanges', () => {
  it('detects new modules', () => {
    const oldConfig: ModuleConfig = {
      selectedModules: ['Auth', 'Services'],
      excludedModules: [],
      lastGeneratedAt: '2025-01-01',
    };
    const currentTree: ModuleTreeNode[] = [
      { name: 'Auth', slug: 'auth', files: ['auth.ts'] },
      { name: 'Services', slug: 'services', files: ['svc.ts'] },
      { name: 'NewModule', slug: 'new', files: ['new.ts'] },
    ];
    const changes = detectModuleChanges(oldConfig, currentTree);
    expect(changes.newModules).toHaveLength(1);
    expect(changes.newModules[0].name).toBe('NewModule');
    expect(changes.deletedModules).toHaveLength(0);
  });

  it('detects deleted modules', () => {
    const oldConfig: ModuleConfig = {
      selectedModules: ['Auth', 'Services', 'OldModule'],
      excludedModules: [],
      lastGeneratedAt: '2025-01-01',
    };
    const currentTree: ModuleTreeNode[] = [
      { name: 'Auth', slug: 'auth', files: ['auth.ts'] },
      { name: 'Services', slug: 'services', files: ['svc.ts'] },
    ];
    const changes = detectModuleChanges(oldConfig, currentTree);
    expect(changes.deletedModules).toHaveLength(1);
    expect(changes.deletedModules[0]).toBe('OldModule');
    expect(changes.newModules).toHaveLength(0);
  });

  it('detects both new and deleted modules', () => {
    const oldConfig: ModuleConfig = {
      selectedModules: ['Auth', 'OldModule'],
      excludedModules: [],
      lastGeneratedAt: '2025-01-01',
    };
    const currentTree: ModuleTreeNode[] = [
      { name: 'Auth', slug: 'auth', files: ['auth.ts'] },
      { name: 'NewModule', slug: 'new', files: ['new.ts'] },
    ];
    const changes = detectModuleChanges(oldConfig, currentTree);
    expect(changes.newModules).toHaveLength(1);
    expect(changes.deletedModules).toHaveLength(1);
  });

  it('handles empty old config', () => {
    const oldConfig: ModuleConfig = {
      selectedModules: [],
      excludedModules: [],
      lastGeneratedAt: '2025-01-01',
    };
    const currentTree: ModuleTreeNode[] = [
      { name: 'Auth', slug: 'auth', files: ['auth.ts'] },
    ];
    const changes = detectModuleChanges(oldConfig, currentTree);
    expect(changes.newModules).toHaveLength(1);
  });
});

describe('formatModuleList', () => {
  it('formats simple list without detail', () => {
    const tree: ModuleTreeNode[] = [
      { name: 'Auth', slug: 'auth', files: ['auth.ts', 'auth2.ts'] },
    ];
    const output = formatModuleList(tree, false);
    expect(output).toContain('Auth');
    expect(output).toContain('2 files');
  });

  it('formats detailed list with files', () => {
    const tree: ModuleTreeNode[] = [
      { name: 'Auth', slug: 'auth', files: ['auth.ts'] },
    ];
    const output = formatModuleList(tree, true);
    expect(output).toContain('Auth');
    expect(output).toContain('auth.ts');
  });

  it('formats hierarchical tree', () => {
    const tree: ModuleTreeNode[] = [
      {
        name: 'Core',
        slug: 'core',
        files: [],
        children: [
          { name: 'Core-Auth', slug: 'core-auth', files: ['auth.ts'] },
        ],
      },
    ];
    const output = formatModuleList(tree, false);
    expect(output).toContain('Core');
    expect(output).toContain('Core-Auth');
  });
});

describe('cleanupDeletedModuleDocs', () => {
  it('returns empty array when no docs to delete', async () => {
    const wikiDir = '/nonexistent/wiki';
    const deletedModules = ['OldModule'];
    const currentTree: ModuleTreeNode[] = [
      { name: 'Auth', slug: 'auth', files: ['auth.ts'] },
    ];
    const result = await cleanupDeletedModuleDocs(wikiDir, deletedModules, currentTree);
    expect(result).toEqual([]);
  });

  it('identifies slugs for deleted modules', async () => {
    const currentTree: ModuleTreeNode[] = [
      { name: 'Auth', slug: 'auth', files: ['auth.ts'] },
      { name: 'Services', slug: 'services', files: ['svc.ts'] },
    ];
    const deletedModules = ['OldModule'];
    const result = await cleanupDeletedModuleDocs('/tmp/wiki', deletedModules, currentTree);
    expect(result).toEqual([]);
  });

  it('handles hierarchical tree', async () => {
    const currentTree: ModuleTreeNode[] = [
      {
        name: 'Core',
        slug: 'core',
        files: [],
        children: [
          { name: 'Core-Auth', slug: 'core-auth', files: ['auth.ts'] },
        ],
      },
    ];
    const deletedModules = ['OldChild'];
    const result = await cleanupDeletedModuleDocs('/tmp/wiki', deletedModules, currentTree);
    expect(result).toEqual([]);
  });
});