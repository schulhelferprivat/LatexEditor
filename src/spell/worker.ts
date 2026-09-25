import nspell from 'nspell';
import { spellWords } from '../editor/latex';
export type SpellIssue = { from: number; to: number; word: string; suggestions: string[] };
export type SpellRequest = {
  id: number;
  source: string;
  language: 'de' | 'en';
  customWords: string[];
  ignoredWords: string[];
};
export type SpellResponse = { id: number; issues: SpellIssue[]; error?: string };
const dictionaries = new Map<string, Promise<ReturnType<typeof nspell>>>();
function dictionary(language: 'de' | 'en') {
  let existing = dictionaries.get(language);
  if (!existing) {
    existing = Promise.all(
      ['aff', 'dic'].map(async (extension) => {
        const response = await fetch(`${import.meta.env.BASE_URL}dictionaries/${language}.${extension}`);
        if (!response.ok) throw new Error('Wörterbuch nicht verfügbar. App-Ressourcen neu installieren.');
        return response.text();
      }),
    ).then(([aff, dic]) => nspell({ aff, dic }));
    dictionaries.set(language, existing);
    existing.catch(() => dictionaries.delete(language));
  }
  return existing;
}
let latest = 0;
self.onmessage = async (event: MessageEvent<SpellRequest>) => {
  const { id, source, language, customWords, ignoredWords } = event.data;
  latest = id;
  try {
    const spell = await dictionary(language);
    if (id !== latest) return;
    const issues: SpellIssue[] = [];
    const cache = new Map<string, string[]>();
    const accepted = new Set(
      [...customWords, ...ignoredWords].map((word) => word.normalize('NFC').toLocaleLowerCase()),
    );
    for (const token of spellWords(source)) {
      if (accepted.has(token.word.normalize('NFC').toLocaleLowerCase()) || spell.correct(token.word))
        continue;
      let suggestions = cache.get(token.word);
      if (!suggestions) {
        suggestions = spell.suggest(token.word).slice(0, 5);
        cache.set(token.word, suggestions);
      }
      issues.push({ ...token, suggestions });
      if (issues.length >= 500) break;
    }
    self.postMessage({ id, issues } satisfies SpellResponse);
  } catch (error) {
    self.postMessage({
      id,
      issues: [],
      error: error instanceof Error ? error.message : String(error),
    } satisfies SpellResponse);
  }
};
