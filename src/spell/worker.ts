import nspell from 'nspell';
import { spellWords } from '../editor/latex';
import { createCompoundChecker } from './compound';
export type SpellIssue = { from: number; to: number; word: string; suggestions: string[] };
export type SpellRequest = {
  id: number;
  source: string;
  language: 'de' | 'en';
  customWords: string[];
  ignoredWords: string[];
};
export type SpellResponse = { id: number; issues: SpellIssue[]; error?: string };
type Suggester = (word: string) => string[];
type Dictionary = {
  spell: ReturnType<typeof nspell>;
  accepts: (word: string) => boolean;
  suggestTail: (word: string, suggest: Suggester) => string[];
};
const issueLimit = 2000;
const dictionaries = new Map<string, Promise<Dictionary>>();
function dictionary(language: 'de' | 'en') {
  let existing = dictionaries.get(language);
  if (!existing) {
    existing = Promise.all(
      ['aff', 'dic'].map(async (extension) => {
        const response = await fetch(`${import.meta.env.BASE_URL}dictionaries/${language}.${extension}`);
        if (!response.ok) throw new Error('Wörterbuch nicht verfügbar. App-Ressourcen neu installieren.');
        return response.text();
      }),
    ).then(([aff, dic]) => {
      const spell = nspell({ aff, dic });
      const correct = (word: string) => spell.correct(word);
      if (language !== 'de') return { spell, accepts: correct, suggestTail: () => [] };
      const { accepts, suggestTail } = createCompoundChecker(dic, correct);
      return { spell, accepts, suggestTail };
    });
    dictionaries.set(language, existing);
    existing.catch(() => dictionaries.delete(language));
  }
  return existing;
}
function spellSuggestions(loaded: Dictionary, word: string) {
  const suggest: Suggester = (value) => loaded.spell.suggest(value);
  const direct = suggest(word).slice(0, 5);
  if (direct.length) return direct;
  return loaded.suggestTail(word, suggest);
}
let latest = 0;
self.onmessage = async (event: MessageEvent<SpellRequest>) => {
  const { id, source, language, customWords, ignoredWords } = event.data;
  latest = id;
  try {
    const loaded = await dictionary(language);
    if (id !== latest) return;
    const issues: SpellIssue[] = [];
    const cache = new Map<string, string[]>();
    const accepted = new Set(
      [...customWords, ...ignoredWords].map((word) => word.normalize('NFC').toLocaleLowerCase()),
    );
    for (const token of spellWords(source)) {
      const word = token.word.normalize('NFC');
      if (accepted.has(word.toLocaleLowerCase()) || loaded.accepts(word)) continue;
      let suggestions = cache.get(word);
      if (!suggestions) {
        suggestions = spellSuggestions(loaded, word);
        cache.set(word, suggestions);
      }
      issues.push({ ...token, suggestions });
      if (issues.length >= issueLimit) break;
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
