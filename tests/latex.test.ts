import { describe, it, expect } from 'vitest';
import { analyzeLatex, spellWords, balancedGroup, environmentAt } from '../src/editor/latex';
import { insertMenuSnippet, insertSnippet, snippets } from '../src/editor/snippets';
import {
  defaultConfig,
  finalPdfName,
  selectedVariants,
  simplifyConfig,
  validateConfig,
} from '../src/domain/types';
const words = (source: string) => spellWords(source).map((token) => token.word);
describe('LaTeX-Struktur und Rechtschreibbereiche', () => {
  it('prüft Fließtext und bekannte Textargumente', () => {
    expect(
      words(String.raw`Ein \textbf{schöner \emph{Text}} mit \href{https://falsch.invalid}{sichtbarem Link}.`),
    ).toEqual(['Ein', 'schöner', 'Text', 'mit', 'sichtbarem', 'Link']);
  });
  it('ignoriert Mathematik, Metadaten, Referenzen, URLs und Kommentare', () => {
    expect(
      words(
        String.raw`Hallo \label{falschlabel} \cite{falschcite} $falschmath$ \(falschmath\) https://falsch.invalid Welt % falschcomment`,
      ),
    ).toEqual(['Hallo', 'Welt']);
  });
  it('ignoriert technische Umgebungen und verbatim', () => {
    expect(
      words(
        String.raw`Text \begin{align} falschertext &= 1 \end{align} \verb|falschverb| \begin{verbatim} falschraw \end{verbatim} Ende`,
      ),
    ).toEqual(['Text', 'Ende']);
  });
  it('versteht verschachtelte Gruppen und escaped Prozentzeichen', () => {
    const source = String.raw`{eins {zwei} \} drei}`;
    expect(balancedGroup(source, 0)?.to).toBe(source.length);
    expect(words(String.raw`Text \% bleibt % fällt weg`)).toEqual(['Text', 'bleibt']);
  });
  it('ordnet verschachtelte Umgebungen für Folding zu', () => {
    const source = '\\begin{itemize}\n\\begin{itemize}\n\\item Text\n\\end{itemize}\n\\end{itemize}';
    const result = analyzeLatex(source).environments;
    expect(result).toHaveLength(2);
    expect(result[1].to).toBe(source.length);
    expect(result[0].from).toBeGreaterThan(result[1].from);
    expect(environmentAt(source, source.indexOf('Text'))).toBe('itemize');
  });
  it('behält Wortpositionen für Korrekturen exakt bei', () => {
    const source = '\\section{Überblick}\nEin Fehlerwort.';
    for (const token of spellWords(source)) expect(source.slice(token.from, token.to)).toBe(token.word);
  });
});
describe('Snippets', () => {
  const snippet = (id: string) => snippets.find((s) => s.id === id)!;
  it('wrappt Auswahl ohne doppelte Klammern', () => {
    const edit = insertSnippet('{Text}', 0, 6, snippet('bold'));
    expect(edit.text).toBe('\\textbf{Text}');
    expect(edit.stops[0]).toEqual({ from: 8, to: 12 });
  });
  it('erhält mehrere eigenständige Argumentplätze', () => {
    const edit = insertSnippet('x', 0, 1, snippet('fraction'));
    expect(edit.text).toBe('\\frac{x}{Nenner}');
    expect(edit.stops).toHaveLength(3);
  });
  it('behandelt eine mehrzeilige Auswahl als Listeneinträge', () => {
    expect(insertSnippet('eins\nzwei', 0, 9, snippet('list')).text).toContain('\\item eins\n\t\\item zwei');
  });
  it('fügt Mathematik im Text und abgesetzt ein', () => {
    expect(insertSnippet('x^2', 0, 3, snippet('math')).text).toBe('\\(x^2\\)');
    expect(insertSnippet('x^2', 0, 3, snippet('display-math')).text).toBe('\\[x^2\\]');
  });
  it('erstellt Tasks mit Abstand zwischen den Aufgaben', () => {
    const result = insertSnippet('', 0, 0, snippet('tasks')).text;
    expect(result).toBe('\\begin{tasks}[after-item-skip=.5cm](1)\n\t\\task \n\t\\task \n\\end{tasks}');
  });
  it('erstellt eine Aufgabe mit Lösungsrahmen', () => {
    const result = insertSnippet('', 0, 0, snippet('exercise')).text;
    expect(result).toContain('\\begin{Aufgabe}[\\hilfsmittelfrei, \\differenzierung{1}, BE: 4]');
    expect(result).toContain('\\begin{lsg}{14cm}');
    expect(result).toContain('\\task \\textbf{Berechne}');
  });
  it('erstellt einen Schnipsel mit Kennung und Text', () => {
    const result = insertSnippet('', 0, 0, snippet('snippet')).text;
    expect(result).toBe(
      '\\begin{schnipsel}[5434]\n\t\\schnipselzeile{Dies ist Text mit Inline-Mathe $a^2+b^2=c^2$.}\n\\end{schnipsel}',
    );
  });
  it('erstellt einen Punkt', () => {
    expect(insertSnippet('', 0, 0, snippet('point')).text).toBe('$\\punkt{x,y,z}$');
  });
  it('erstellt ein zweidimensionales Koordinatensystem', () => {
    expect(insertSnippet('', 0, 0, snippet('coordinate-system')).text).toBe(
      '\\begin{tikzpicture}[scale=.8]\n\t\\tkzInit[xmin=-3,xmax=3,ymin=-3,ymax=3]\n\t\\tkzGrid\n\t\\tkzAxeXY\n\t\\lsg{\\tkzFct[ultra thick,domain=-6:6]{x\\*2}}\n\\end{tikzpicture}',
    );
  });
  it('erstellt eine linierte Lösung', () => {
    expect(insertSnippet('', 0, 0, snippet('lined-solution')).text).toBe('\\liniert[5]{Lösung}');
  });
  it('erstellt ein links offenes Intervall', () => {
    expect(insertSnippet('', 0, 0, snippet('open-interval')).text).toBe('$\\interval[open left]{a}{b}\\to$');
  });
  it('erstellt eine Umformung', () => {
    expect(insertSnippet('', 0, 0, snippet('equation-transformation')).text).toBe(
      '\\begin{alignat*}{6} \n2x\t&\t+2\t&&\t~~=~~\t&&\t5x\t&&\t+8\t&& \\qquad\\mid-2\\ \t\\\\\n2x\t&\t\t&&\t~~=~~\t&&\t5x\t&&\t+6\t&& \n\\end{alignat*}',
    );
  });
  it('erstellt eine schattierte Tabelle', () => {
    const result = insertSnippet('', 0, 0, snippet('shaded-table')).text;
    expect(result).toBe(
      '\\begin{tabular}{>{\\columncolor[gray]{0.8}}M{.7cm}|M{.7cm}|M{.7cm}}\n\t1\t&\t2\t&\t3\t\\\\' +
        '\\hline\n\t4\t&\t5\t&\t6\t\\\\\n\\end{tabular}',
    );
  });
  it('erstellt eine Ja-Nein-Aufgabe', () => {
    expect(insertSnippet('', 0, 0, snippet('yes-no')).text).toBe(
      '\\textbf{Entscheide}, ob die Aussage wahr oder falsch ist, indem du das Zutreffende ankreuzt.\n\\begin{tasks}[label-width = {1cm}, item-indent = {1.5cm}]\n\t\\task[\\janein{0.4}{WF}] \n\\end{tasks}',
    );
  });
  it('erstellt ein Wahr-oder-falsch-Symbol', () => {
    expect(insertSnippet('', 0, 0, snippet('square-x')).text).toBe('\\squareX{WvsF}');
  });
  it('erstellt Seiteneinstellungen', () => {
    expect(insertSnippet('', 0, 0, snippet('page-margins')).text).toBe(
      '\\geometry{landscape,a5paper}\n\\addtolength{\\textheight}{2cm}\n\\addtolength{\\voffset}{-.5cm}\n\\addtolength{\\textwidth}{2cm}\n\\addtolength{\\hoffset}{-1cm}\n\\newgeometry{hmargin=1cm,vmargin=2cm,landscape}\\restoregeometry',
    );
  });
  it('erstellt Anweisungen zum Entfernen von Seiten', () => {
    expect(insertSnippet('', 0, 0, snippet('discard-pages')).text).toBe(
      '\\discardpages{1,3,5,7,9,29,35,40}\n\\keeppages{2,4,6}',
    );
  });
  it('erstellt eine Lücke mit Lösung', () => {
    expect(insertSnippet('', 0, 0, snippet('gap')).text).toBe(
      '$\\luecke{\\hspace*{.3cm}}$\\lsg{\\hspace*{-.5cm}$X$}',
    );
  });
  it('erstellt eine Präsentationsaufgabe', () => {
    expect(insertSnippet('', 0, 0, snippet('presentation')).text).toBe(
      '\\begin{Aufgabe}\n\\textbf{Erstelle} in deinem digitalen Notizbuch einen Abschnitt und \\textbf{füge} dort die Präsentation \\textbf{ein}.\n\\end{Aufgabe}',
    );
  });
  it('erstellt eine textbasierte Klausur', () => {
    const result = insertSnippet('', 0, 0, snippet('text-exam')).text;
    expect(result).toContain('\\begin{Aufgabe}[30 \\%]');
    expect(result).toContain('\\begin{doublespacing}\\begin{linenumbers}\\begin{adjustwidth}{0cm}{5cm}');
    expect(result).toContain('\\end{tiny}\\end{flushright}');
  });
  it('erstellt einen Lösungsbereich', () => {
    expect(insertSnippet('', 0, 0, snippet('solution')).text).toBe(
      '\\begin{lsg}[hspaceCM]{vspaceCM}\n\\end{lsg}',
    );
  });
  it('erstellt einen Klausur-Header', () => {
    const result = insertSnippet('', 0, 0, snippet('exam-header')).text;
    expect(result).toContain('\\geometry{includehead}\\clearpairofpagestyles');
    expect(result).toContain('\\begin{tblr}{width=\\textwidth');
    expect(result).toContain('\\ofoot*{\\thepage~von~\\pageref*{LastPage}}');
  });
  it('erstellt einen QR-Code', () => {
    expect(insertSnippet('', 0, 0, snippet('qr-code')).text).toBe(
      '\\qrRand[2cm]{https://geogebra.org}[Text][-0cm][0cm]',
    );
  });
  it('erstellt eine Fußzeile für Testergebnisse', () => {
    expect(insertSnippet('', 0, 0, snippet('test-result')).text).toBe(
      '\\setlength{\\footheight}{1cm}\\ofoot*{\\ifnum\\value{page}=\\getpagerefnumber{LastPage}\\Large\\textbf{BE:\\hspace*{1cm}/~\\BESumme\\hspace{.5cm}$=\\hspace{1cm}\\%$}\\\\' +
        '\\textbf{Note:}\\hspace{3.75cm}\\fi}',
    );
  });
  it('erstellt eine Fußzeile für den Namen', () => {
    expect(insertSnippet('', 0, 0, snippet('test-name')).text).toBe(
      '\\ifoot*{\\Large{\\textbf{\\ifthenelse{\\isodd{\\value{page}}}{Name:\\underline{\\hspace*{4.5cm}}}{}}}}',
    );
  });
  it('erstellt eine Fußzeile für Hilfsmittel', () => {
    expect(insertSnippet('', 0, 0, snippet('test-aids')).text).toBe(
      '\\cfoot*{\\Large{\\textbf{\\ifthenelse{\\value{page}<5}{Ohne Hilfsmittel}{Mit Hilfsmitteln}}}}',
    );
  });
  it('blendet die Kopfzeilenlinie aus', () => {
    expect(insertSnippet('', 0, 0, snippet('hide-headline')).text).toBe(
      '\\addtokomafont{headsepline}{\\color{white}}',
    );
  });
  it('erstellt eine kurze Lösung mit Tasks', () => {
    expect(insertSnippet('', 0, 0, snippet('short-solution')).text).toBe(
      '\\lsg{\\begin{tasks}[label-format=\\color{red}\\bfseries,item-format=\\color{red}]\\end{tasks}}',
    );
  });
  it('erzeugt keine Aufrufe des alten Lösungsbefehls', () => {
    expect(snippets.map((entry) => insertSnippet('', 0, 0, entry).text).join('\n')).not.toContain(
      '\\lsgZwei',
    );
  });
  it('konsumiert vorhandene leere Klammern', () => {
    const edit = insertSnippet('{}', 0, 0, snippet('bold'));
    expect(edit.to).toBe(2);
    expect(edit.text).toBe('\\textbf{Text}');
  });
});
describe('Menü-Snippets', () => {
  const snippet = (id: string) => snippets.find((s) => s.id === id)!;
  it('setzt Einfügungen mitten im Text auf eine eigene Zeile', () => {
    const edit = insertMenuSnippet('vorher nachher', 7, 7, snippet('bold'));
    expect('vorher ' + edit.text + 'nachher').toBe('vorher \n\\textbf{Text}\nnachher');
    expect(edit.stops[0]).toEqual({ from: 16, to: 20 });
  });
  it('fügt an Zeilengrenzen keine unnötigen Leerzeilen ein', () => {
    expect(insertMenuSnippet('vorher\nnachher', 7, 7, snippet('bold')).text).toBe('\\textbf{Text}\n');
    expect(insertMenuSnippet('vorher\nnachher', 6, 6, snippet('bold')).text).toBe('\n\\textbf{Text}');
    expect(insertMenuSnippet('', 0, 0, snippet('bold')).text).toBe('\\textbf{Text}');
  });
  it('belässt umschlossene Auswahl im laufenden Text', () => {
    const edit = insertMenuSnippet('vorher xxxx nachher', 7, 11, snippet('bold'));
    expect(edit.text).toBe('\\textbf{xxxx}');
  });
});
describe('Varianten', () => {
  it('baut genau einen Entwurf und stets beide Endausgaben', () => {
    const config = defaultConfig();
    expect(selectedVariants(config, 'draft')).toHaveLength(1);
    expect(selectedVariants(config, 'draft')[0]).not.toHaveProperty('solution');
    expect(selectedVariants(config, 'final')).toHaveLength(2);
    expect(selectedVariants(config, 'final').map((variant) => variant.solution)).toEqual([false, true]);
    config.finals = ['loesung'];
    expect(selectedVariants(config, 'final').map((variant) => variant.id)).toEqual([
      'arbeitsblatt',
      'loesung',
    ]);
    expect(simplifyConfig(config).finals).toEqual(['arbeitsblatt', 'loesung']);
    config.finals = [];
    expect(selectedVariants(config, 'final').map((variant) => variant.id)).toEqual([
      'arbeitsblatt',
      'loesung',
    ]);
    expect(simplifyConfig(config).finals).toEqual(['arbeitsblatt', 'loesung']);
    expect(defaultConfig().variants.map((variant) => finalPdfName('Aufgabe.tex', variant))).toEqual([
      'Aufgabe (Arbeitsblatt).pdf',
      'Aufgabe (Lösung).pdf',
    ]);
  });
  it('stellt ältere freie Varianten auf die zwei festen Ausgaben um', () => {
    const old = validateConfig({
      ...defaultConfig(),
      variants: [{ id: 'student', name: 'Schüler', suffix: 'student', defines: { Solutions: false } }],
      draft: 'student',
      finals: ['student'],
    });
    const migrated = simplifyConfig(old);
    expect(migrated.variants.map((variant) => variant.id)).toEqual(['arbeitsblatt', 'loesung']);
    expect(migrated.finals).toEqual(['arbeitsblatt', 'loesung']);
    expect(migrated.engine).toBe(old.engine);
  });
  it('aktiviert Shell Escape standardmäßig und respektiert gespeicherte Ausnahmen', () => {
    const config = defaultConfig();
    expect(config.shellEscape).toBe(true);
    const { shellEscape, ...oldConfig } = config;
    expect(validateConfig(oldConfig).shellEscape).toBe(true);
    expect(validateConfig({ ...config, shellEscape: false }).shellEscape).toBe(false);
    expect(() => validateConfig({ ...config, shellEscape: 'true' })).toThrow();
  });
  it('verhindert ungültige Varianten und Defines', () => {
    const config = defaultConfig();
    expect(() =>
      validateConfig({ ...config, variants: [config.variants[0], { ...config.variants[0], id: 'b' }] }),
    ).toThrow();
    expect(() =>
      validateConfig({ ...config, variants: [{ ...config.variants[0], suffix: '../escape' }] }),
    ).toThrow();
    expect(() =>
      validateConfig({ ...config, variants: [{ ...config.variants[0], defines: { 'bad-name': true } }] }),
    ).toThrow();
  });
  it('gibt unveränderliche Kopien der Buildauswahl zurück', () => {
    const config = defaultConfig();
    const selected = selectedVariants(config, 'draft');
    selected[0].name = 'changed';
    expect(config.variants[0].name).toBe('Arbeitsblatt');
  });
});

describe('Automatische Umgebungsvervollständigung', () => {
  it('fügt einen fehlenden End-Partner ein', async () => {
    const { completeEnvironment } = await import('../src/editor/latex');
    const source = '\\begin{itemize';
    const result = completeEnvironment(source, source.length, source.length);
    expect(result?.insert).toBe('}\n\t\n\\end{itemize}');
  });
  it('vermeidet doppelte End-Partner und Klammern', async () => {
    const { completeEnvironment } = await import('../src/editor/latex');
    const source = '\\begin{itemize}\n\\end{itemize}';
    expect(completeEnvironment(source, 14, 14)).toBeUndefined();
    const empty = '\\begin{itemize}';
    expect(completeEnvironment(empty, 14, 14)?.to).toBe(15);
  });
  it('vervollständigt gleichnamig verschachtelte Umgebungen', async () => {
    const { completeEnvironment } = await import('../src/editor/latex');
    const source = '\\begin{itemize}\n  \\begin{itemize}\n\\end{itemize}';
    const from = source.indexOf('}', 16);
    expect(completeEnvironment(source, from, from)?.insert).toContain('\\end{itemize}');
  });
  it('ignoriert Umgebungen in Kommentaren', async () => {
    const { completeEnvironment } = await import('../src/editor/latex');
    const source = '\\begin{itemize}\n% \\end{itemize}';
    expect(completeEnvironment(source, 14, 14)?.insert).toContain('\\end{itemize}');
  });
});

it('dupliziert keine schließenden Mathematikumgebungen', async () => {
  const { completeEnvironment } = await import('../src/editor/latex');
  const source = '\\begin{equation}\nx=1\n\\end{equation}';
  const from = source.indexOf('}');
  expect(completeEnvironment(source, from, from)).toBeUndefined();
});
