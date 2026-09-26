const fugen = ['', 's', 'es', 'n', 'en', 'e', 'er', 'ns'];
const minimum = 3;
const depthLimit = 2;
const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function scanDictionary(dic: string) {
  const stems = new Set<string>();
  const standalone = new Set<string>();
  const compoundOnly = new Set<string>();
  for (const line of dic.split('\n')) {
    if (!line || line.charCodeAt(0) === 9) continue;
    const slash = line.indexOf('/');
    const word = slash < 1 ? line.trim() : line.slice(0, slash);
    if (!word) continue;
    const flags = slash < 1 ? '' : line.slice(slash + 1);
    if (/[jek]/.test(flags)) stems.add(word.toLowerCase());
    (flags.includes('o') ? compoundOnly : standalone).add(word);
  }
  const misflagged = new Set<string>();
  for (const word of compoundOnly) if (standalone.has(word)) misflagged.add(word);
  return { stems, misflagged };
}

export function createCompoundChecker(dic: string, exact: (word: string) => boolean) {
  const { stems, misflagged } = scanDictionary(dic);
  const correct = (word: string) => exact(word) || misflagged.has(word);
  const headOk = (head: string) => {
    if (head.length < minimum) return false;
    const lower = head.toLowerCase();
    return stems.has(lower) || stems.has(lower.replace(/e?[sn]$/, ''));
  };
  const tailOk = (tail: string) =>
    tail.length >= minimum && (correct(tail) || correct(capitalize(tail)) || correct(tail.toLowerCase()));
  const splits = (word: string, depth: number): boolean => {
    if (depth > depthLimit) return false;
    for (let cut = word.length - minimum; cut >= minimum; cut--) {
      const head = word.slice(0, cut);
      if (!headOk(head)) continue;
      const rest = word.slice(cut);
      for (const fuge of fugen) {
        if (fuge && !rest.startsWith(fuge)) continue;
        const tail = rest.slice(fuge.length);
        if (tailOk(tail)) return true;
        if (tail.length >= minimum * 2 && splits(capitalize(tail), depth + 1)) return true;
      }
    }
    return false;
  };
  const accepts = (word: string): boolean => {
    if (correct(word) || splits(word, 0)) return true;
    if (!word.includes('-')) return false;
    const parts = word.split('-');
    return parts.length > 1 && parts.every((part) => correct(part) || splits(part, 0));
  };
  const suggestTail = (word: string, suggest: (word: string) => string[]) => {
    for (let cut = word.length - minimum; cut >= minimum; cut--) {
      const head = word.slice(0, cut);
      if (!headOk(head)) continue;
      const candidates: string[] = [];
      for (const option of suggest(capitalize(word.slice(cut)))) {
        if (/[^\p{L}\p{M}]/u.test(option)) continue;
        candidates.push(head + option.toLocaleLowerCase());
        if (candidates.length >= 5) break;
      }
      if (candidates.length) return candidates;
    }
    return [];
  };
  return { accepts, suggestTail, correct, stems, misflagged };
}
