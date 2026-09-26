export type Span = { from: number; to: number };
export type LatexCommand = Span & { name: string };
export type LatexEnvironment = Span & { name: string; openEnd: number; closeStart: number };
export type LatexAnalysis = {
  commands: LatexCommand[];
  environments: LatexEnvironment[];
  ignored: Span[];
  text: Span[];
};

const textArguments: Record<string, boolean[]> = {
  textbf: [true],
  textit: [true],
  emph: [true],
  textrm: [true],
  textsf: [true],
  texttt: [true],
  underline: [true],
  section: [true],
  subsection: [true],
  subsubsection: [true],
  paragraph: [true],
  subparagraph: [true],
  chapter: [true],
  part: [true],
  title: [true],
  author: [true],
  date: [true],
  caption: [true],
  footnote: [true],
  footnotetext: [true],
  thanks: [true],
  href: [false, true],
  textcolor: [false, true],
  colorbox: [false, true],
  fcolorbox: [false, false, true],
  foreignlanguage: [false, true],
  enquote: [true],
  blockquote: [true],
  quote: [true],
  mbox: [true],
  makebox: [true],
};
export const environments = [
  'document',
  'itemize',
  'enumerate',
  'description',
  'figure',
  'table',
  'tabular',
  'center',
  'quote',
  'quotation',
  'abstract',
  'equation',
  'align',
  'gather',
  'verbatim',
];
const mathEnvironments = new Set([
  'math',
  'displaymath',
  'equation',
  'equation*',
  'align',
  'align*',
  'alignat',
  'alignat*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'flalign',
  'flalign*',
  'eqnarray',
  'eqnarray*',
  'tikzpicture',
]);
export const rawEnvironments = new Set([
  'verbatim',
  'verbatim*',
  'Verbatim',
  'lstlisting',
  'minted',
  'comment',
]);
const beginArguments: Record<string, number> = {
  tabular: 1,
  'tabular*': 2,
  tabularx: 2,
  array: 1,
  minipage: 1,
  list: 2,
  thebibliography: 1,
};

export function balancedGroup(source: string, from: number): Span | undefined {
  const opening = source[from];
  const closing = opening === '{' ? '}' : opening === '[' ? ']' : undefined;
  if (!closing) return;
  let level = 1;
  for (let i = from + 1; i < source.length; i++) {
    if (source[i] === '\\') {
      i++;
      continue;
    }
    if (source[i] === '%') {
      const end = source.indexOf('\n', i);
      if (end < 0) return;
      i = end;
      continue;
    }
    if (source[i] === opening) level++;
    if (source[i] === closing && --level === 0) return { from, to: i + 1 };
  }
}
function skipSpace(source: string, from: number) {
  while (/\s/.test(source[from] ?? '') && from < source.length) from++;
  return from;
}
export function analyzeLatex(source: string): LatexAnalysis {
  const ignored: Span[] = [];
  const commands: LatexCommand[] = [];
  const matched: LatexEnvironment[] = [];
  const stack: { name: string; from: number; openEnd: number }[] = [];
  const hide = (from: number, to: number) => {
    if (to > from) ignored.push({ from, to });
  };
  function walk(start: number, end: number) {
    let i = start;
    while (i < end) {
      const char = source[i];
      if (char === '%') {
        const newline = source.indexOf('\n', i);
        const next = newline < 0 ? end : Math.min(end, newline);
        hide(i, next);
        i = next;
        continue;
      }
      if (char === '$') {
        const delimiter = source[i + 1] === '$' ? '$$' : '$';
        let next = i + delimiter.length;
        for (; next < end; next++) {
          if (source[next] === '\\') {
            next++;
            continue;
          }
          if (source.startsWith(delimiter, next)) {
            next += delimiter.length;
            break;
          }
        }
        hide(i, Math.min(next, end));
        i = next;
        continue;
      }
      if (char === '\\') {
        if (source[i + 1] === '(' || source[i + 1] === '[') {
          const close = source[i + 1] === '(' ? '\\)' : '\\]';
          const at = source.indexOf(close, i + 2);
          const next = at < 0 ? end : at + 2;
          hide(i, next);
          i = next;
          continue;
        }
        const match = /^\\([A-Za-z@]+\*?|.)/s.exec(source.slice(i, end));
        if (!match) {
          hide(i, i + 1);
          i++;
          continue;
        }
        const name = match[1].replace(/\*$/, '');
        const commandEnd = i + match[0].length;
        commands.push({ name, from: i, to: commandEnd });
        hide(i, commandEnd);
        if (name === 'verb') {
          const delimiter = source[commandEnd];
          const at = delimiter ? source.indexOf(delimiter, commandEnd + 1) : -1;
          const next =
            at < 0
              ? Math.min(end, source.indexOf('\n', commandEnd) < 0 ? end : source.indexOf('\n', commandEnd))
              : at + 1;
          hide(commandEnd, next);
          i = next;
          continue;
        }
        let cursor = skipSpace(source, commandEnd);
        if (name === 'begin' || name === 'end') {
          const group = balancedGroup(source, cursor);
          if (group && source[cursor] === '{') {
            const env = source.slice(cursor + 1, group.to - 1);
            hide(cursor, group.to);
            if (name === 'begin' && (mathEnvironments.has(env) || rawEnvironments.has(env))) {
              const closing = `\\end{${env}}`;
              const at = source.indexOf(closing, group.to);
              const next = at < 0 ? end : at + closing.length;
              hide(group.to, next);
              if (at >= 0) commands.push({ name: 'end', from: at, to: at + 4 });
              if (at >= 0) matched.push({ name: env, from: i, to: next, openEnd: group.to, closeStart: at });
              i = next;
              continue;
            }
            if (name === 'begin') stack.push({ name: env, from: i, openEnd: group.to });
            else {
              const index = stack.findLastIndex((open) => open.name === env);
              if (index >= 0) {
                const open = stack[index];
                matched.push({ ...open, to: group.to, closeStart: i });
                stack.splice(index);
              }
            }
            cursor = group.to;
            if (name === 'begin') {
              let count = beginArguments[env] ?? 0;
              while (count > 0 || source[skipSpace(source, cursor)] === '[') {
                const at = skipSpace(source, cursor);
                const arg = balancedGroup(source, at);
                if (!arg) break;
                hide(at, arg.to);
                cursor = arg.to;
                if (source[at] === '{') count--;
              }
            }
            i = cursor;
            continue;
          }
        }
        const spec = textArguments[name];
        let argument = 0;
        while (cursor < end && (source[cursor] === '{' || source[cursor] === '[')) {
          const group = balancedGroup(source, cursor);
          if (!group) break;
          const optional = source[cursor] === '[';
          const textual = optional
            ? !!spec && ['section', 'subsection', 'chapter', 'caption'].includes(name)
            : spec?.[argument] === true;
          hide(cursor, cursor + 1);
          hide(group.to - 1, group.to);
          if (textual) walk(cursor + 1, group.to - 1);
          else hide(cursor + 1, group.to - 1);
          if (!optional) argument++;
          cursor = skipSpace(source, group.to);
        }
        i = Math.max(commandEnd, cursor);
        continue;
      }
      if (
        char === '{' ||
        char === '}' ||
        char === '[' ||
        char === ']' ||
        char === '&' ||
        char === '_' ||
        char === '^'
      )
        hide(i, i + 1);
      i++;
    }
  }
  walk(0, source.length);
  for (const match of source.matchAll(/(?:https?:\/\/|www\.)[^\s{}<>]+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi))
    hide(match.index, match.index + match[0].length);
  ignored.sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: Span[] = [];
  for (const span of ignored) {
    const last = merged.at(-1);
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }
  const text: Span[] = [];
  let cursor = 0;
  for (const span of merged) {
    if (span.from > cursor) text.push({ from: cursor, to: span.from });
    cursor = span.to;
  }
  if (cursor < source.length) text.push({ from: cursor, to: source.length });
  return { commands, environments: matched, ignored: merged, text };
}
export function spellWords(source: string): { word: string; from: number; to: number }[] {
  const result: { word: string; from: number; to: number }[] = [];
  for (const range of analyzeLatex(source).text) {
    for (const match of source
      .slice(range.from, range.to)
      .matchAll(/\p{L}[\p{L}\p{M}]*(?:['’\-][\p{L}\p{M}]+)*/gu)) {
      if (match[0].length < 2) continue;
      result.push({
        word: match[0],
        from: range.from + match.index,
        to: range.from + match.index + match[0].length,
      });
    }
  }
  return result;
}
export function environmentAt(source: string, position: number): string | undefined {
  const prefix = source.slice(0, position);
  const stack: string[] = [];
  for (const line of prefix.split('\n')) {
    const code = line.replace(/(?<!\\)%.*/, '');
    for (const match of code.matchAll(/\\(begin|end)\{([^}]+)\}/g)) {
      if (match[1] === 'begin') stack.push(match[2]);
      else {
        const index = stack.lastIndexOf(match[2]);
        if (index >= 0) stack.splice(index);
      }
    }
  }
  return stack.at(-1);
}

export function completeEnvironment(source: string, from: number, to: number) {
  const prefix = source.slice(0, from);
  const match = /\\begin\{([A-Za-z*]+)$/.exec(prefix);
  if (!match) return;
  const name = match[1];
  if (source[to] === '}') to++;
  const candidate = prefix + '}' + source.slice(to);
  const analysis = analyzeLatex(candidate);
  let balance = 0;
  for (const command of analysis.commands) {
    if (command.name !== 'begin' && command.name !== 'end') continue;
    const group = balancedGroup(candidate, skipSpace(candidate, command.to));
    if (group && candidate.slice(group.from + 1, group.to - 1) === name)
      balance += command.name === 'begin' ? 1 : -1;
  }
  if (balance <= 0) return;
  const line = prefix.slice(prefix.lastIndexOf('\n') + 1);
  const indent = /^\s*/.exec(line)?.[0] ?? '';
  const insert = `}\n${indent}  \n${indent}\\end{${name}}`;
  return { from, to, insert, anchor: from + indent.length + 4 };
}
