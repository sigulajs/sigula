# API Reference Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate `Reference.md` from the TSDoc comments in `dist/sigula.d.ts` and reduce the README's API listing to a link to it.

**Architecture:** A dependency-free Node script (`scripts/gen-reference.ts`, run via `tsx`) parses the regular shape of `dist/sigula.d.ts` line by line: top-level JSDoc blocks followed by `export` declarations, grouped by `@group`. It writes a deterministic `Reference.md`. The README's hand-written API sections are removed and replaced by a pointer; the Errors table and Reactivity model move to top-level sections.

**Tech Stack:** Node ESM + `tsx` (existing devDependency). No TypeScript API (TS 7 here is the native preview and exposes none) and no new dependencies.

Spec: `docs/superpowers/specs/2026-10-05-api-reference-generation-design.md`

---

## Files

- Create: `scripts/gen-reference.ts`
- Create: `Reference.md` (generated and committed)
- Modify: `package.json` (add `docs:api`)
- Modify: `README.md`

---

### Task 1: The generator and the `docs:api` script

**Files:**
- Create: `scripts/gen-reference.ts`
- Modify: `package.json`
- Create: `Reference.md` (by running the script)

- [ ] **Step 1: Create `scripts/gen-reference.ts`**

```ts
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dts = readFileSync(join(root, 'dist', 'sigula.d.ts'), 'utf8');
const out = join(root, 'Reference.md');

const GROUP_ORDER = [
  'Reactivity',
  'Templates',
  'DOM bindings',
  'Control flow',
  'Rendering',
  'Low-level API',
];

interface Tag {
  name: string;
  text: string;
}

interface Member {
  name: string;
  doc: string;
}

interface ApiSymbol {
  name: string;
  group: string;
  signatures: string[];
  summary: string;
  typeParams: string[];
  params: string[];
  returns: string;
  example: string;
  members: Member[];
}

const stripPrefix = (s: string): string =>
  s.replace(/^export declare /, '').replace(/^export /, '');

const parseJsDoc = (text: string): {summary: string; tags: Tag[]} => {
  const body = text
    .replace(/^\/\*\*?/, '')
    .replace(/\*\/\s*$/, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').replace(/\s+$/, ''));

  const summaryLines: string[] = [];
  const tags: Tag[] = [];
  let current: Tag | undefined;

  for (const line of body) {
    const m = /^@(\w+)\s?(.*)$/.exec(line);
    if (m) {
      current = {name: m[1] as string, text: m[2] ?? ''};
      tags.push(current);
    } else if (current) {
      current.text += (current.text ? '\n' : '') + line;
    } else {
      summaryLines.push(line);
    }
  }

  return {
    summary: summaryLines.join('\n').trim(),
    tags: tags.map((t) => ({name: t.name, text: t.text.trim()})),
  };
};

const memberName = (decl: string): string => {
  const s = decl.trim();
  if (s.startsWith('[')) {
    const colon = s.indexOf(':');
    return colon === -1 ? s : s.slice(0, colon).trim();
  }
  return /^([A-Za-z_$][\w$]*)/.exec(s)?.[1] ?? s;
};

const parseMember = (docText: string, decl: string): Member => {
  const {summary, tags} = parseJsDoc(docText);
  const dv = tags.find((t) => t.name === 'defaultValue')?.text;
  const base = summary.replace(/\n+/g, ' ').trim();
  return {
    name: memberName(decl),
    doc: dv ? `${base} (defaults to \`${dv.replace(/`/g, '')}\`)` : base,
  };
};

const parseSymbol = (docText: string, declLines: string[]): ApiSymbol => {
  const {summary, tags} = parseJsDoc(docText);
  const first = declLines[0] as string;
  const full = declLines.join('\n');

  const name =
    /export (?:declare )?(?:interface|class|type|function) (\w+)/.exec(first)?.[1] ??
    /export (?:declare )?const (\w+)/.exec(first)?.[1] ??
    'unknown';

  const isBlock = /^export (?:declare )?(interface|class)\b/.test(first);
  const brace = full.indexOf('{');
  const signature =
    isBlock && brace !== -1
      ? `${stripPrefix(full.slice(0, brace).trimEnd())} { ... }`
      : stripPrefix(first).trim();

  const members: Member[] = [];
  if (isBlock) {
    const end = declLines.length - 1;
    let j = 1;
    while (j < end) {
      const line = declLines[j] as string;
      if (!/^\s*\/\*\*/.test(line)) {
        j++;
        continue;
      }
      const docLines: string[] = [line];
      while (
        !/\*\//.test(docLines[docLines.length - 1] as string) &&
        j + 1 < end
      ) {
        j++;
        docLines.push(declLines[j] as string);
      }
      const chunk: string[] = [];
      let k = j + 1;
      while (k < end) {
        chunk.push(declLines[k] as string);
        if (/;\s*$/.test(declLines[k] as string)) break;
        k++;
      }
      j = k + 1;
      const doc = docLines.join('\n');
      const {summary: ms, tags: mt} = parseJsDoc(doc);
      if (ms || mt.length) members.push(parseMember(doc, chunk.join(' ')));
    }
  }

  const many = (tag: string): string[] =>
    tags.filter((t) => t.name === tag).map((t) => t.text);

  return {
    name,
    group: tags.find((t) => t.name === 'group')?.text ?? 'Other',
    signatures: [signature],
    summary,
    typeParams: many('typeParam'),
    params: many('param'),
    returns: tags.find((t) => t.name === 'returns')?.text ?? '',
    example: tags.find((t) => t.name === 'example')?.text ?? '',
    members,
  };
};

const lines = dts.split('\n');
const collected: ApiSymbol[] = [];

const gatherDeclaration = (start: number): {decl: string[]; next: number} => {
  const first = lines[start] as string;
  const decl: string[] = [first];
  if (!/^export (?:declare )?(interface|class)\b/.test(first)) {
    return {decl, next: start + 1};
  }
  let j = start;
  while (!/^\}\s*$/.test(lines[j] as string)) {
    j++;
    decl.push(lines[j] as string);
  }
  return {decl, next: j + 1};
};

let i = 0;
while (i < lines.length) {
  const line = lines[i] as string;
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('//')) {
    i++;
    continue;
  }
  if (line.startsWith('/**')) {
    const docLines: string[] = [line];
    while (
      !/\*\//.test(docLines[docLines.length - 1] as string) &&
      i + 1 < lines.length
    ) {
      i++;
      docLines.push(lines[i] as string);
    }
    i++;
    if (i < lines.length && (lines[i] as string).startsWith('export ')) {
      const {decl, next} = gatherDeclaration(i);
      collected.push(parseSymbol(docLines.join('\n'), decl));
      i = next;
    }
    continue;
  }
  if (line.startsWith('export ')) {
    const {decl, next} = gatherDeclaration(i);
    collected.push(parseSymbol('/** */', decl));
    i = next;
    continue;
  }
  i++;
}

const byName = new Map<string, ApiSymbol>();
for (const s of collected) {
  const existing = byName.get(s.name);
  if (existing) existing.signatures.push(...s.signatures);
  else byName.set(s.name, s);
}

const grouped = new Map<string, ApiSymbol[]>();
for (const s of byName.values()) {
  const g = GROUP_ORDER.includes(s.group) ? s.group : 'Other';
  const bucket = grouped.get(g);
  if (bucket) bucket.push(s);
  else grouped.set(g, [s]);
}

const renderTag = (text: string): string => {
  const m = /^(\S+)\s*-\s*(.*)$/.exec(text);
  return m ? `- \`${m[1]}\` — ${m[2]}` : `- ${text}`;
};

let md = '# Reference\n\n';
md +=
  '> Generated from the TSDoc comments in `src/`. Do not edit by hand — run `pnpm docs:api`.\n\n';

for (const g of [...GROUP_ORDER, 'Other']) {
  const list = grouped.get(g);
  if (!list || list.length === 0) continue;
  md += `## ${g}\n\n`;
  for (const s of list) {
    md += `### \`${s.name}\`\n\n`;
    md += '```ts\n' + s.signatures.join('\n') + '\n```\n\n';
    if (s.summary) md += `${s.summary}\n\n`;
    if (s.typeParams.length) {
      md += '**Type parameters**\n\n';
      md += s.typeParams.map(renderTag).join('\n') + '\n\n';
    }
    if (s.params.length) {
      md += '**Parameters**\n\n';
      md += s.params.map(renderTag).join('\n') + '\n\n';
    }
    if (s.returns) md += `**Returns** ${s.returns}\n\n`;
    if (s.example) md += `**Example**\n\n${s.example}\n\n`;
    if (s.members.length) {
      md += '**Members**\n\n';
      md += s.members.map((m) => `- \`${m.name}\` — ${m.doc}`).join('\n') + '\n\n';
    }
  }
}

writeFileSync(out, md);
```

- [ ] **Step 2: Add the `docs:api` script to `package.json`**

In `"scripts"`, after `"build": "tsdown",`, add:

```json
    "docs:api": "pnpm build && tsx scripts/gen-reference.ts",
```

- [ ] **Step 3: Generate `Reference.md`**

Run: `pnpm docs:api`
Expected: build succeeds, then `Reference.md` is written. Inspect it:
- every `##` group appears in the fixed order and no `Other` group exists;
- all 61 symbols are present exactly once (overloads `patch` and `compute` share one entry);
- signatures, summaries, parameter/type-parameter/returns lists, examples, and interface/class member lists render.

If any symbol is missing or a member list is malformed, fix the parser in `scripts/gen-reference.ts` (do not hand-edit `Reference.md`) and rerun.

- [ ] **Step 4: Confirm determinism**

Run `pnpm docs:api`, then `shasum Reference.md`, then run `pnpm docs:api` again and `shasum Reference.md`. Expected: identical hashes.

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-reference.ts package.json Reference.md
git commit -m "docs: generate API Reference.md from TSDoc"
```

---

### Task 2: Point the README at `Reference.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Remove the API listing and add the pointer**

In `README.md`, delete everything from the `## 📖 Reference` heading through the end of the `### Low-level API` subsection (i.e. up to, but not including, the `### Errors` heading). That span includes the intro bullet list and the `### Reactivity`, `### Templates`, `### DOM bindings`, `### Control flow`, `### Rendering`, and `### Low-level API` subsections.

Replace it with exactly:

```markdown
## 📖 Reference

The full API reference is generated from the TSDoc comments in the source: see [Reference.md](./Reference.md).
```

- [ ] **Step 2: Promote the retained subsections**

Change the `### Errors` heading to `## Errors`, and the `### Reactivity model` heading to `## Reactivity model`. Leave their content unchanged.

- [ ] **Step 3: Verify structure**

Run: `rg -n "^## |^### " README.md`
Expected: the Reference pointer is followed by `## Errors`, `## Reactivity model`, and then `## License`; no API-listing `###` headings remain under Reference. Confirm the `Reference.md` file exists and the link path is `./Reference.md`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: link README to generated Reference.md"
```

---

### Task 3: Full verification

- [ ] **Step 1: Regenerate and check for drift**

Run: `pnpm docs:api`
Expected: succeeds, and `git status --short` shows `Reference.md` unchanged (no diff).

- [ ] **Step 2: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS (no source changed).

- [ ] **Step 3: Confirm the spec's acceptance criteria**

- `pnpm docs:api` generates `Reference.md` deterministically from `dist/sigula.d.ts`.
- `Reference.md` lists every exported symbol, grouped by `@group`, with signature,
  documentation, params/type params/returns, example, and member docs.
- `README.md` links to `Reference.md` and retains the Errors table and Reactivity
  model.
- No runtime or type behavior changed; `pnpm test` and `pnpm typecheck` pass.
- `Reference.md` is committed.
