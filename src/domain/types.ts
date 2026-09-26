export type Engine = 'lualatex' | 'pdflatex' | 'xelatex';
export type Variant = {
  id: string;
  name: string;
  suffix: string;
  defines: Record<string, boolean | string>;
  solution?: boolean;
};
export type Configuration = {
  version: 1;
  variants: Variant[];
  draft: string;
  finals: string[];
  engine: Engine;
  shellEscape: boolean;
};
export type Diagnostic = {
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line?: number;
  column?: number;
};
export type BuildRequest = {
  workspace: string;
  main: string;
  engine: Engine;
  shellEscape: boolean;
  variants: Variant[];
  preamble?: string;
  solution?: boolean;
};
export type VariantResult = {
  variant: string;
  ok: boolean;
  artifact?: string;
  diagnostics: Diagnostic[];
  log: string;
};
export type BuildResult = {
  id: string;
  state: 'queued' | 'running' | 'done' | 'cancelled';
  progress: string;
  results: VariantResult[];
};
export type SyncLocation = {
  file?: string;
  line?: number;
  column?: number;
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};
export type Capabilities = {
  engines: Engine[];
  tools: string[];
  version: string;
  texDir?: string | null;
  gnuplotDir?: string | null;
  gnuplotPath?: string | null;
  preamble?: boolean;
};
export const fixedVariants = (): Variant[] => [
  { id: 'arbeitsblatt', name: 'Arbeitsblatt', suffix: 'arbeitsblatt', defines: {}, solution: false },
  { id: 'loesung', name: 'Lösung', suffix: 'loesung', defines: {}, solution: true },
];
export const defaultConfig = (): Configuration => ({
  version: 1,
  variants: fixedVariants(),
  draft: 'arbeitsblatt',
  finals: ['arbeitsblatt', 'loesung'],
  engine: 'pdflatex',
  shellEscape: true,
});
export function validateConfig(value: unknown): Configuration {
  if (!value || typeof value !== 'object') throw new Error('Ungültige Variantenkonfiguration.');
  const c = value as Configuration;
  if (c.version !== 1 || !Array.isArray(c.variants) || !c.variants.length || c.variants.length > 20)
    throw new Error('Es sind 1–20 Varianten erforderlich.');
  if (!['lualatex', 'pdflatex', 'xelatex'].includes(c.engine)) throw new Error('Unbekannte Engine.');
  if (c.shellEscape !== undefined && typeof c.shellEscape !== 'boolean')
    throw new Error('Ungültige Shell-Escape-Einstellung.');
  const ids = new Set<string>(),
    suffixes = new Set<string>();
  for (const v of c.variants) {
    if (!v || typeof v.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(v.id) || ids.has(v.id))
      throw new Error('Varianten benötigen eindeutige IDs.');
    if (v.solution !== undefined && typeof v.solution !== 'boolean')
      throw new Error('Ungültiger Lösungswert.');
    if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 80)
      throw new Error('Varianten benötigen einen Namen.');
    if (
      typeof v.suffix !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(v.suffix) ||
      suffixes.has(v.suffix.toLowerCase())
    )
      throw new Error('Suffixe müssen eindeutig sein und dürfen nur Buchstaben, Zahlen, _ und - enthalten.');
    if (
      !v.defines ||
      typeof v.defines !== 'object' ||
      Array.isArray(v.defines) ||
      Object.keys(v.defines).length > 50
    )
      throw new Error('Ungültige Defines.');
    for (const [key, val] of Object.entries(v.defines)) {
      if (
        !/^[A-Za-z]{1,48}$/.test(key) ||
        /^(?:end|input|include|documentclass|usepackage|csname|def|newif|if|else|fi|begin)$/.test(key)
      )
        throw new Error(`Ungültiger Define-Name: ${key}`);
      if (
        typeof val !== 'boolean' &&
        (typeof val !== 'string' || val.length > 1000 || /[\x00-\x1f\x7f]/.test(val))
      )
        throw new Error(`Ungültiger Wert: ${key}`);
    }
    ids.add(v.id);
    suffixes.add(v.suffix.toLowerCase());
  }
  if (
    !ids.has(c.draft) ||
    !Array.isArray(c.finals) ||
    c.finals.some((id) => !ids.has(id)) ||
    new Set(c.finals).size !== c.finals.length
  )
    throw new Error('Ungültige Variantenauswahl.');
  return { ...structuredClone(c), shellEscape: c.shellEscape ?? true };
}
export function simplifyConfig(config: Configuration): Configuration {
  const fixed = fixedVariants();
  return {
    version: 1,
    variants: fixed,
    draft: 'arbeitsblatt',
    finals: fixed.map((variant) => variant.id),
    engine: config.engine,
    shellEscape: config.shellEscape,
  };
}
export function selectedVariants(c: Configuration, mode: 'draft' | 'final'): Variant[] {
  validateConfig(c);
  if (mode === 'final') return fixedVariants();
  const variants = c.variants.filter((variant) => variant.id === c.draft);
  return structuredClone(variants.map(({ solution: _solution, ...variant }) => variant));
}
export const stem = (name: string) => name.replace(/\.tex$/i, '');
export const finalPdfName = (main: string, variant: Variant) => `${stem(main)} (${variant.name}).pdf`;
