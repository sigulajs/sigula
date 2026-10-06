import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dts = readFileSync(join(root, 'dist', 'sigula.d.ts'), 'utf8');
const out = join(root, 'Reference.md');

// Display order: the README "API Cheat Sheet" symbols first, then the remaining
// supporting symbols.
const ORDER = [
  'sig',
  'compute',
  'effect',
  'html',
  'text',
  'raw',
  'patch',
  'id',
  'val',
  'attr',
  'style',
  'styleProp',
  'toggleClass',
  'toggleClasses',
  'on',
  'act',
  'view',
  'repeat',
  'list',
  'frag',
  'render',
  'createBind',
  'removeBind',
  'eq',
  'toBoundary',
  'walkBoundary',
  'toPatchItem',
  'Sig',
  'DerivedSig',
  'View',
  'Patch',
  'Reactive',
  'Eq',
  'Equatable',
  'Bind',
  'AnyBind',
  'UnknownRecord',
  'SigRecord',
  'ValRecord',
  'ViewContext',
  'ChildView',
  'AnyView',
  'replaceWithView',
  'PatchProps',
  'PatchContext',
  'PatchItem',
  'ToPatchItem',
  'AnyPatchItem',
  'ToAnyPatchItem',
  'WritableStyleKey',
  'ActFn',
  'RepeatProp',
  'RepeatContext',
  'Boundary',
  'removeBoundary',
  'replaceWithNode',
  'CmdContext',
  'Cmd',
  'AnyCmd',
  'at',
  'err',
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
  examples: string[];
  members: Member[];
}

const stripPrefix = (s: string): string =>
  s.replace(/^export declare /, '').replace(/^export /, '');

const cleanInline = (s: string): string =>
  s.replace(/\{@link\s+([\w.$]+)\s*\}/g, '`$1`');

const isBlockStart = (line: string): boolean =>
  /^export (?:declare )?(interface|class)\b/.test(line) ||
  /^export (?:declare )?type\b.*=\s*\{\s*$/.test(line);

const parseJsDoc = (text: string): {summary: string; tags: Tag[]} => {
  const body = text
    .replace(/^\s*\/\*\*?/, '')
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
    summary: cleanInline(summaryLines.join('\n').trim()),
    tags: tags.map((t) => ({name: t.name, text: cleanInline(t.text.trim())})),
  };
};

const memberName = (decl: string): string => {
  const s = decl.trim();
  if (s.startsWith('[')) {
    const end = s.indexOf(']');
    return end === -1 ? s : s.slice(0, end + 1);
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

  const isBlock = isBlockStart(first);
  const brace = full.indexOf('{');
  const signature =
    isBlock && brace !== -1
      ? `${stripPrefix(full.slice(0, brace).trimEnd())} { ... }`
      : stripPrefix(full).replace(/\s+/g, ' ').trim();

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
    examples: many('example'),
    members,
  };
};

const lines = dts.split('\n');
const collected: ApiSymbol[] = [];

const gatherDeclaration = (start: number): {decl: string[]; next: number} => {
  const first = lines[start] as string;
  const decl: string[] = [first];
  if (isBlockStart(first) && first.includes('{')) {
    // a one-line block such as `export interface Empty {}`
    if (/\{\s*\}\s*;?\s*$/.test(first)) {
      return {decl, next: start + 1};
    }
    let j = start;
    while (j + 1 < lines.length) {
      j++;
      decl.push(lines[j] as string);
      if (/^\}\s*;?\s*$/.test(lines[j] as string)) break;
    }
    if (!/^\}\s*;?\s*$/.test((lines[j] as string) ?? '')) {
      throw new Error(`unterminated block starting at line ${start + 1}`);
    }
    return {decl, next: j + 1};
  }
  // A non-block declaration may still wrap across lines (for example a const
  // whose type is an object literal). Consume lines until the accumulated text
  // is bracket-balanced and ends with `;`.
  const balanced = (text: string): boolean => {
    let depth = 0;
    for (const ch of text) {
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
    }
    return depth <= 0;
  };
  let j = start;
  while (j + 1 < lines.length) {
    const text = decl.join('\n');
    if (balanced(text) && /;\s*$/.test(text)) break;
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
    let k = i;
    while (
      k < lines.length &&
      ((lines[k] as string).trim() === '' || (lines[k] as string).trim().startsWith('//'))
    ) {
      k++;
    }
    if (k < lines.length && (lines[k] as string).startsWith('export ')) {
      const {decl, next} = gatherDeclaration(k);
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

const uniqPush = (target: string[], add: string[]): void => {
  for (const value of add) {
    if (value && !target.includes(value)) target.push(value);
  }
};

const byName = new Map<string, ApiSymbol>();
for (const s of collected) {
  const existing = byName.get(s.name);
  if (!existing) {
    byName.set(s.name, s);
    continue;
  }
  existing.signatures.push(...s.signatures);
  uniqPush(existing.params, s.params);
  uniqPush(existing.typeParams, s.typeParams);
  uniqPush(existing.examples, s.examples);
  if (!existing.returns) existing.returns = s.returns;
  if (s.summary && s.summary !== existing.summary) {
    existing.summary = `${existing.summary}\n\n${s.summary}`;
  }
}

const orderIndex = new Map(ORDER.map((name, index) => [name, index]));
const sourceIndex = new Map(
  [...byName.keys()].map((name, index) => [name, index]),
);
const sorted = [...byName.values()].sort((a, b) => {
  const ai = orderIndex.get(a.name);
  const bi = orderIndex.get(b.name);
  if (ai !== undefined && bi !== undefined) return ai - bi;
  if (ai !== undefined) return -1;
  if (bi !== undefined) return 1;
  return (
    (sourceIndex.get(a.name) as number) - (sourceIndex.get(b.name) as number)
  );
});
for (const s of sorted) {
  if (!orderIndex.has(s.name)) {
    console.warn(`gen-reference: "${s.name}" is not in ORDER; appended`);
  }
}

const renderTag = (text: string): string => {
  const m = /^(\S+)\s*-\s*(.*)$/.exec(text);
  return m ? `- \`${m[1]}\` — ${m[2]}` : `- ${text}`;
};

let md = '# Reference\n\n';
md +=
  '> Generated from the TSDoc comments in `src/`. Do not edit by hand — run `pnpm docs:api`.\n\n';

for (const s of sorted) {
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
  if (s.examples.length) {
    md += '**Example**\n\n';
    for (const ex of s.examples) {
      md += (ex.startsWith('```') ? ex : `\`\`\`ts\n${ex}\n\`\`\``) + '\n\n';
    }
  }
  if (s.members.length) {
    md += '**Members**\n\n';
    md += s.members.map((m) => `- \`${m.name}\` — ${m.doc}`).join('\n') + '\n\n';
  }
}

writeFileSync(out, md);
