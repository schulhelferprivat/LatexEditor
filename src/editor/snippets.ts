export type Snippet = {
  id: string;
  label: string;
  icon: string;
  buttonText?: string;
  parts: (string | { placeholder: string; selection?: boolean })[];
};
export type SnippetInsertion = {
  from: number;
  to: number;
  text: string;
  stops: { from: number; to: number }[];
};
export type SnippetGroup = {
  id: string;
  label: string;
  snippets: string[];
  showIcons?: boolean;
};
const argument = (placeholder: string, selection = false) => ({ placeholder, selection });
export const snippets: Snippet[] = [
  { id: 'bold', label: 'Fett', icon: 'Bold', parts: ['\\textbf{', argument('Text', true), '}'] },
  { id: 'italic', label: 'Kursiv', icon: 'Italic', parts: ['\\emph{', argument('Text', true), '}'] },
  {
    id: 'underline',
    label: 'Unterstreichen',
    icon: 'Underline',
    parts: ['\\underline{', argument('Text', true), '}'],
  },
  {
    id: 'list',
    label: 'Aufzählung',
    icon: 'List',
    parts: ['\\begin{itemize}\n\t\\item ', argument('Eintrag', true), '\n\\end{itemize}'],
  },
  {
    id: 'numbered',
    label: 'Nummerierte Liste',
    icon: 'NumberedList',
    parts: ['\\begin{enumerate}\n\t\\item ', argument('Eintrag', true), '\n\\end{enumerate}'],
  },
  {
    id: 'tasks',
    label: 'Task',
    icon: 'AlphabeticalTasks',
    buttonText: 'Task',
    parts: [
      '\\begin{tasks}[after-item-skip=.5cm](1)\n\t\\task ',
      argument('', true),
      '\n\t\\task \n\\end{tasks}',
    ],
  },
  {
    id: 'exercise',
    label: 'Aufgaben-Block',
    icon: 'Pencil',
    buttonText: 'Aufgaben-Block',
    parts: [
      '\\begin{Aufgabe}[\\hilfsmittelfrei, \\differenzierung{1}, BE: 4]\nHallo.\n\\begin{tasks}\n\\task \\textbf{',
      argument('Berechne', true),
      '}\n\\end{tasks}\n\\begin{framed}\n\\begin{lsg}{14cm}\n\\begin{tasks}\n\\task \n\\end{tasks}\n\\end{lsg}\n\\end{framed}\n\\end{Aufgabe}',
    ],
  },
  {
    id: 'snippet',
    label: 'Schnipsel',
    icon: 'SnippetCards',
    buttonText: 'Schnipsel',
    parts: [
      '\\begin{schnipsel}[',
      argument('5434'),
      ']\n\t\\schnipselzeile{',
      argument('Dies ist Text mit Inline-Mathe $a^2+b^2=c^2$.', true),
      '}\n\\end{schnipsel}',
    ],
  },
  {
    id: 'point',
    label: 'Punkt',
    icon: 'Point',
    buttonText: 'Punkt',
    parts: ['$\\punkt{', argument('x,y,z', true), '}$'],
  },
  {
    id: 'coordinate-system',
    label: 'Koordinatensystem (2D)',
    icon: 'CoordinateSystem',
    parts: [
      '\\begin{tikzpicture}[scale=.8]\n\t\\tkzInit[xmin=-3,xmax=3,ymin=-3,ymax=3]\n\t\\tkzGrid\n\t\\tkzAxeXY\n\t\\lsg{\\tkzFct[ultra thick,domain=-6:6]{x\\*2}}\n\\end{tikzpicture}',
    ],
  },
  {
    id: 'lined-solution',
    label: 'Linien',
    icon: 'Lines',
    buttonText: 'Linien',
    parts: ['\\liniert[5]{', argument('Lösung', true), '}'],
  },
  {
    id: 'open-interval',
    label: 'Intervall',
    icon: 'Interval',
    buttonText: 'Intervall',
    parts: ['$\\interval[open left]{', argument('a', true), '}{', argument('b'), '}\\to$'],
  },
  {
    id: 'equation-transformation',
    label: 'Äquivalenzumformung',
    icon: 'Equivalence',
    buttonText: 'Äquivalenzumformung',
    parts: [
      '\\begin{alignat*}{6} \n2x\t&\t+2\t&&\t~~=~~\t&&\t5x\t&&\t+8\t&& \\qquad\\mid-2\\ \t\\\\\n2x\t&\t\t&&\t~~=~~\t&&\t5x\t&&\t+6\t&& \n\\end{alignat*}',
    ],
  },
  {
    id: 'shaded-table',
    label: 'Tabelle',
    icon: 'TableGrid',
    parts: [
      '\\begin{tabular}{>{\\columncolor[gray]{0.8}}M{.7cm}|M{.7cm}|M{.7cm}}\n\t1\t&\t2\t&\t3\t\\\\',
      '\\hline\n\t4\t&\t5\t&\t6\t\\\\\n\\end{tabular}',
    ],
  },
  {
    id: 'yes-no',
    label: 'Single Choice',
    icon: 'SingleChoice',
    buttonText: 'Single Choice',
    parts: [
      '\\textbf{Entscheide}, ob die Aussage wahr oder falsch ist, indem du das Zutreffende ankreuzt.\n\\begin{tasks}[label-width = {1cm}, item-indent = {1.5cm}]\n\t\\task[\\janein{0.4}{WF}] \n\\end{tasks}',
    ],
  },
  {
    id: 'square-x',
    label: 'Ankreuzen',
    icon: 'SquareX',
    parts: ['\\squareX{', argument('WvsF', true), '}'],
  },
  {
    id: 'page-margins',
    label: 'Seitenränder',
    icon: 'FileText',
    buttonText: 'Seitenränder',
    parts: [
      '\\geometry{landscape,a5paper}\n\\addtolength{\\textheight}{2cm}\n\\addtolength{\\voffset}{-.5cm}\n\\addtolength{\\textwidth}{2cm}\n\\addtolength{\\hoffset}{-1cm}\n\\newgeometry{hmargin=1cm,vmargin=2cm,landscape}\\restoregeometry',
    ],
  },
  {
    id: 'discard-pages',
    label: 'Seiten löschen',
    icon: 'StruckFile',
    buttonText: 'Seiten löschen',
    parts: ['\\discardpages{1,3,5,7,9,29,35,40}\n\\keeppages{2,4,6}'],
  },
  {
    id: 'gap',
    label: 'Lücke',
    icon: 'Square',
    buttonText: 'Lücke',
    parts: ['$\\luecke{\\hspace*{.3cm}}$\\lsg{\\hspace*{-.5cm}$', argument('X', true), '$}'],
  },
  {
    id: 'presentation',
    label: 'Präsentation ins Notizbuch',
    icon: 'NotebookPresentation',
    buttonText: 'Präsentation ins Notizbuch',
    parts: [
      '\\begin{Aufgabe}\n\\textbf{Erstelle} in deinem digitalen Notizbuch einen Abschnitt und \\textbf{füge} dort die Präsentation \\textbf{ein}.\n\\end{Aufgabe}',
    ],
  },
  {
    id: 'text-exam',
    label: 'Textbasierte Klausur',
    icon: 'FileText',
    buttonText: 'Textbasierte Klausur',
    parts: [
      '\\begin{Aufgabe}[30 \\%]\n\\textbf{Gib} den Gedankengang von X \\textbf{wieder}.\n\\end{Aufgabe}\n\\begin{Aufgabe}[40 \\%]\n\\textbf{Setze} den Gedankengang von X \\textbf{in Beziehung} zu Unterrichtsergebnissen zum Thema „Y“.\n\\end{Aufgabe}\n\\begin{Aufgabe}[30 \\%]\n\\textbf{Nimm Stellung} zur Frage, ob Z. Berücksichtige dabei auch im Unterricht behandelte anthropologische/ethische/erkenntnistheoretische/lebensphilosophische Positionen.\n\\end{Aufgabe}\n\\begin{large}\\vspace{.75cm}\n\\textbf{Hans Wurst: Titel}\n\\end{large}\\vspace{.25cm}\n\n\\begin{small}\n\\textbf{Vorbemerkung:}\t\nHans Wurst (1900-2000) war ein toller Typ .\n\\end{small}\n\n\\begin{doublespacing}\\begin{linenumbers}\\begin{adjustwidth}{0cm}{5cm}\nblabla\n\n\\end{adjustwidth}\\end{linenumbers}\\end{doublespacing}\\resetlinenumber\n\\begin{flushright}\\begin{tiny}\nWurst, Hans (1950): \\textit{Gutes Buch}, S. 2.\n\\end{tiny}\\end{flushright}',
    ],
  },
  {
    id: 'solution',
    label: 'Lösung',
    icon: 'Checkmark',
    buttonText: 'Lösung',
    parts: ['\\begin{lsg}[', argument('hspaceCM', true), ']{', argument('vspaceCM'), '}\n\\end{lsg}'],
  },
  {
    id: 'exam-header',
    label: 'Klausur-Header',
    icon: 'FileText',
    buttonText: 'Klausur-Header',
    parts: [
      '\\geometry{includehead}\\clearpairofpagestyles\\addtokomafont{headsepline}{\\color{white}}\\ihead{\\setstretch{1}\\begin{tblr}{width=\\textwidth,colspec={Q[l,wd=.29\\textwidth]X[c]Q[c,wd=.08\\textwidth]Q[r,wd=.25\\textwidth]},rows={ht=0.6cm,bg=gray!30,fg=black,font={\\normalfont\\small},valign=m},rowsep=1pt,colsep=10pt,hlines={white,.5pt},vlines={white,.5pt}}\nSchriftliche Arbeit JG--HJ--NR & \\SetCell[c=2]{c} FACH && Material für Prüflinge\\\\\n\\SetCell[c=2]{l} Thema: XXX && gA/eA & Prüfungszeit: 90 min\n%\\SetCell[c=3]{l} Thema: XXX &&  & Prüfungszeit: 90 min\n\\end{tblr}}\n\\KOMAoptions{singlespacing=true}\\ofoot*{\\thepage~von~\\pageref*{LastPage}}',
    ],
  },
  {
    id: 'heading',
    label: 'Überschrift',
    icon: 'FileText',
    buttonText: 'Überschrift',
    parts: ['\\chead{\\textbf{', argument('THEMA', true), '}\\seitenzahl}'],
  },
  {
    id: 'qr-code',
    label: 'QR',
    icon: 'FileText',
    buttonText: 'QR',
    parts: ['\\qrRand[2cm]{', argument('https://geogebra.org', true), '}[', argument('Text'), '][-0cm][0cm]'],
  },
  {
    id: 'test-result',
    label: 'Test-Ergebnis',
    icon: 'FileText',
    buttonText: 'Test-Ergebnis',
    parts: [
      '\\setlength{\\footheight}{1cm}\\ofoot*{\\ifnum\\value{page}=\\getpagerefnumber{LastPage}\\Large\\textbf{BE:\\hspace*{1cm}/~\\BESumme\\hspace{.5cm}$=\\hspace{1cm}\\%$}\\\\',
      '\\textbf{Note:}\\hspace{3.75cm}\\fi}',
    ],
  },
  {
    id: 'test-name',
    label: 'Name des Prüflings',
    icon: 'FileText',
    buttonText: 'Name des Prüflings',
    parts: [
      '\\ifoot*{\\Large{\\textbf{\\ifthenelse{\\isodd{\\value{page}}}{Name:\\underline{\\hspace*{4.5cm}}}{}}}}',
    ],
  },
  {
    id: 'test-aids',
    label: 'Hilfsmittelhinweis',
    icon: 'FileText',
    buttonText: 'Hilfsmittelhinweis',
    parts: ['\\cfoot*{\\Large{\\textbf{\\ifthenelse{\\value{page}<5}{Ohne Hilfsmittel}{Mit Hilfsmitteln}}}}'],
  },
  {
    id: 'hide-headline',
    label: 'Titellinie aus',
    icon: 'FileText',
    buttonText: 'Titellinie aus',
    parts: ['\\addtokomafont{headsepline}{\\color{white}}'],
  },
  {
    id: 'short-solution',
    label: 'Lösung (kurz)',
    icon: 'Checkmark',
    buttonText: 'Lösung (kurz)',
    parts: [
      '\\lsg{\\begin{tasks}[label-format=\\color{red}\\bfseries,item-format=\\color{red}]\\end{tasks}}',
    ],
  },
  {
    id: 'math',
    label: 'Inline-Mathcode',
    icon: 'InlineMath',
    buttonText: '\\( \\)',
    parts: ['\\(', argument('Formel', true), '\\)'],
  },
  {
    id: 'display-math',
    label: 'Absatz-Mathcode',
    icon: 'BlockMath',
    buttonText: '\\[ \\]',
    parts: ['\\[', argument('Formel', true), '\\]'],
  },
  {
    id: 'fraction',
    label: 'Bruch',
    icon: 'Divide',
    parts: ['\\frac{', argument('Zähler', true), '}{', argument('Nenner'), '}'],
  },
  {
    id: 'figure',
    label: 'Abbildung',
    icon: 'Image',
    parts: [
      '\\begin{figure}[htbp]\n\t\\centering\n\t\\includegraphics[width=\\linewidth]{',
      argument('bild.pdf'),
      '}\n\t\\caption{',
      argument('Beschreibung', true),
      '}\n\t\\label{',
      argument('fig:bild'),
      '}\n\\end{figure}',
    ],
  },
];
export const snippetGroups: SnippetGroup[] = [
  {
    id: 'text-layout',
    label: 'Layout',
    snippets: ['bold', 'italic', 'underline', 'page-margins', 'discard-pages', 'figure'],
  },
  {
    id: 'lists',
    label: 'Listen',
    snippets: ['list', 'numbered', 'tasks', 'shaded-table'],
  },
  {
    id: 'tasks',
    label: 'Aufgaben',
    snippets: [
      'exercise',
      'snippet',
      'presentation',
      'gap',
      'lined-solution',
      'solution',
      'short-solution',
      'yes-no',
      'square-x',
    ],
  },
  {
    id: 'math-graphics',
    label: 'Mathe',
    snippets: [
      'math',
      'display-math',
      'fraction',
      'point',
      'open-interval',
      'equation-transformation',
      'coordinate-system',
    ],
  },
  {
    id: 'tables-templates',
    label: 'Vorlagen',
    showIcons: false,
    snippets: [
      'text-exam',
      'exam-header',
      'heading',
      'qr-code',
      'test-result',
      'test-name',
      'test-aids',
      'hide-headline',
    ],
  },
];
export function insertSnippet(source: string, from: number, to: number, snippet: Snippet): SnippetInsertion {
  let selection = source.slice(from, to);
  const parts = snippet.parts;
  const selectionIndex = parts.findIndex((part) => typeof part !== 'string' && part.selection);
  const insideBraces = selection.startsWith('{') && selection.endsWith('}') && isSingleGroup(selection);
  if (
    insideBraces &&
    selectionIndex > 0 &&
    String(parts[selectionIndex - 1]).endsWith('{') &&
    String(parts[selectionIndex + 1]).startsWith('}')
  )
    selection = selection.slice(1, -1);
  if (from === to && source[from] === '{' && source[from + 1] === '}' && String(parts[0]).endsWith('{'))
    to += 2;
  let text = '';
  const stops: { from: number; to: number }[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      text += part;
      continue;
    }
    let value = part.selection && selection ? selection : part.placeholder;
    if (['list', 'numbered', 'tasks'].includes(snippet.id) && part.selection && selection) {
      const item = snippet.id === 'tasks' ? '\\task' : '\\item';
      value = selection
        .split('\n')
        .map((line, index) => (index ? `\t${item} ${line}` : line))
        .join('\n');
    }
    const start = text.length;
    text += value;
    stops.push({ from: from + start, to: from + text.length });
  }
  stops.push({ from: from + text.length, to: from + text.length });
  return { from, to, text, stops };
}
export function insertMenuSnippet(
  source: string,
  from: number,
  to: number,
  snippet: Snippet,
): SnippetInsertion {
  const insertion = insertSnippet(source, from, to, snippet);
  const wrapsSelection =
    from !== to && snippet.parts.some((part) => typeof part !== 'string' && part.selection);
  if (wrapsSelection) return insertion;
  const before = from > 0 && source[from - 1] !== '\n' ? '\n' : '';
  const after = insertion.to < source.length && source[insertion.to] !== '\n' ? '\n' : '';
  return {
    ...insertion,
    text: before + insertion.text + after,
    stops: insertion.stops.map((stop) => ({ from: stop.from + before.length, to: stop.to + before.length })),
  };
}
function isSingleGroup(text: string) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return i === text.length - 1;
  }
  return false;
}
