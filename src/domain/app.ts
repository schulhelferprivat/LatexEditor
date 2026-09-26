import { Bridge } from '../infra/bridge';
import * as files from '../infra/files';
import defaultPreambleText from '../default-preamble.tex?raw';
import {
  defaultConfig,
  finalPdfName,
  fixedVariants,
  selectedVariants,
  simplifyConfig,
  stem,
  validateConfig,
  type BuildResult,
  type Capabilities,
  type Configuration,
  type Diagnostic,
  type SyncLocation,
} from './types';
export type Document = {
  id: string;
  name: string;
  text: string;
  saved: string;
  file?: FileSystemFileHandle;
  dir?: FileSystemDirectoryHandle;
  config: Configuration;
  savedConfig: string;
  configRaw: string | null;
  revision: number;
  pdf?: string;
  preview?: { job: string; variant: string; revision: number; workspace: string };
};
export type Question = { title: string; message: string; options: string[] };
export type PreambleSettings = { enabled: boolean; text: string };
export const defaultPreamble = defaultPreambleText;
export function loadPreamble(): PreambleSettings {
  try {
    const value = JSON.parse(localStorage.getItem('preamble') ?? 'null');
    if (value && typeof value.enabled === 'boolean' && typeof value.text === 'string')
      return { enabled: value.enabled, text: value.text };
  } catch {}
  return { enabled: true, text: defaultPreamble };
}
export type AppState = {
  preamble: PreambleSettings;
  solution: boolean;
  documents: Document[];
  active: string;
  status: string;
  busy: boolean;
  saving: boolean;
  error: string;
  capabilities?: Capabilities;
  bridgeOffline: boolean;
  diagnostics: Diagnostic[];
  resultDocument?: string;
  log: string;
  panel: boolean;
  jump?: { id: string; line: number; nonce: number };
  pdfTarget?: SyncLocation;
  question?: Question;
  language: 'de' | 'en';
};
export const dirty = (d: Document) => d.text !== d.saved || JSON.stringify(d.config) !== d.savedConfig;
const seconds = (milliseconds: number) =>
  `${(milliseconds / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export const template = '\\begin{document}\n\\end{document}\n';
export class AppController {
  state: AppState = {
    preamble: loadPreamble(),
    solution: false,
    documents: [],
    active: '',
    status: 'Bereit',
    busy: false,
    saving: false,
    error: '',
    bridgeOffline: false,
    diagnostics: [],
    log: '',
    panel: false,
    language: localStorage.getItem('language') === 'en' ? 'en' : 'de',
  };
  private listeners = new Set<() => void>();
  private jumpNonce = 0;
  private answer?: (value: number) => void;
  private job?: string;
  private buildingWorkspace?: string;
  private launched = false;
  private restoredId?: string;
  private cancelRequested = false;
  private persistence = Promise.resolve();
  private digests = new Map<string, Map<string, string>>();
  readonly bridge = new Bridge();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  get active() {
    return this.state.documents.find((d) => d.id === this.state.active);
  }
  emit() {
    this.state = { ...this.state, documents: [...this.state.documents] };
    this.listeners.forEach((fn) => fn());
  }
  notify(error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    this.state.error = error instanceof Error ? error.message : String(error);
    this.emit();
  }
  ask(question: Question) {
    if (this.answer) throw new Error('Bitte zuerst den offenen Dialog beantworten.');
    this.state.question = question;
    this.emit();
    return new Promise<number>((resolve) => {
      this.answer = resolve;
    });
  }
  respond(value: number) {
    const answer = this.answer;
    this.answer = undefined;
    this.state.question = undefined;
    this.emit();
    answer?.(value);
  }
  dispose() {
    this.bridge.unload(
      [
        ...this.state.documents.flatMap((d) => (d.preview ? [d.preview.workspace] : [])),
        ...(this.buildingWorkspace ? [this.buildingWorkspace] : []),
      ],
      this.job,
    );
  }
  async init() {
    this.bridge.onReset = () => {
      for (const d of this.state.documents) d.preview = undefined;
      this.emit();
    };
    window.launchQueue?.setConsumer((params) => {
      if (params.files.length) {
        this.launched = true;
        if (this.restoredId) {
          this.state.documents = this.state.documents.filter((d) => d.id !== this.restoredId || dirty(d));
          this.restoredId = undefined;
        }
        void this.run(async () => {
          for (const file of params.files) await this.openHandle(file);
        });
      }
    });
    void this.connectBridge();
    try {
      const last = await files.lastDocument();
      if (!this.launched && last) {
        if ((await last.file.queryPermission({ mode: 'read' })) === 'granted' && !this.launched)
          await this.openHandle(last.file, last.dir, true);
        else if (!this.launched) {
          this.state.error = 'Letztes Dokument benötigt erneut eine Freigabe. Über „Öffnen“ auswählen.';
          this.emit();
        }
      }
    } catch (error) {
      this.notify(error);
    }
  }
  async connectBridge() {
    try {
      const capabilities = await this.bridge.connect();
      const recovered = this.state.bridgeOffline;
      this.state.capabilities = capabilities;
      this.state.bridgeOffline = false;
      if (recovered && !this.state.busy) this.state.status = 'Bereit';
      this.emit();
    } catch {
      if (this.state.bridgeOffline && !this.state.capabilities) return;
      this.state.capabilities = undefined;
      this.state.bridgeOffline = true;
      this.emit();
    }
  }
  async run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      this.notify(error);
    }
  }
  newDocument() {
    const config = defaultConfig();
    const doc: Document = {
      id: crypto.randomUUID(),
      name: 'Unbenannt.tex',
      text: template,
      saved: '',
      config,
      savedConfig: JSON.stringify(config),
      configRaw: null,
      revision: 0,
    };
    this.state.documents.push(doc);
    this.activate(doc.id);
  }
  async open() {
    for (const file of await window.showOpenFilePicker({ types: files.fileTypes, multiple: true }))
      await this.openHandle(file);
  }
  async openHandle(file: FileSystemFileHandle, dir?: FileSystemDirectoryHandle, restore = false) {
    if (!/\.tex$/i.test(file.name)) throw new Error('Bitte eine .tex-Datei öffnen.');
    for (const doc of this.state.documents)
      if (doc.file && (await file.isSameEntry(doc.file))) {
        this.activate(doc.id);
        return;
      }
    const text = await (await file.getFile()).text();
    const config =
      dir && (await dir.queryPermission({ mode: 'read' })) === 'granted'
        ? await files.readConfig(dir, file.name)
        : { config: defaultConfig(), raw: null };
    const doc: Document = {
      id: crypto.randomUUID(),
      name: file.name,
      text,
      saved: text,
      file,
      dir,
      ...{ config: config.config, configRaw: config.raw },
      savedConfig: JSON.stringify(config.config),
      revision: 0,
    };
    if (restore) {
      if (this.launched || this.state.documents.length) return;
      this.restoredId = doc.id;
    }
    this.state.documents.push(doc);
    this.activate(doc.id);
  }
  activate(id: string) {
    this.state.active = id;
    this.state.pdfTarget = undefined;
    this.emit();
    this.remember();
  }
  private remember() {
    const d = this.active;
    const last = d?.file ? { file: d.file, dir: d.dir } : null;
    this.persistence = this.persistence
      .then(() => files.lastDocument(last))
      .then(() => {})
      .catch((error) => this.notify(error));
  }
  edit(id: string, text: string) {
    const d = this.state.documents.find((d) => d.id === id);
    if (!d || d.text === text) return;
    d.text = text;
    d.revision++;
    this.emit();
  }
  setPreamble(preamble: PreambleSettings) {
    if (this.state.busy || this.state.saving) return;
    localStorage.setItem('preamble', JSON.stringify(preamble));
    this.state.preamble = { ...preamble };
    for (const document of this.state.documents) document.revision++;
    this.emit();
  }
  setSolution(solution: boolean) {
    if (
      this.state.busy ||
      this.state.saving ||
      !this.state.preamble.enabled ||
      this.state.solution === solution
    )
      return;
    this.state.solution = solution;
    for (const document of this.state.documents) document.revision++;
    this.emit();
  }
  configure(config: Configuration) {
    const d = this.active;
    if (!d || this.state.busy || this.state.saving) return;
    d.config = simplifyConfig(validateConfig(config));
    d.revision++;
    this.emit();
  }
  language(language: 'de' | 'en') {
    this.state.language = language;
    localStorage.setItem('language', language);
    this.emit();
  }
  async chooseFolder() {
    if (this.state.busy || this.state.saving) return;
    this.state.saving = true;
    this.emit();
    try {
      await this.attach();
    } finally {
      this.state.saving = false;
      this.emit();
    }
  }
  private async attach(d = this.active) {
    if (!d) return;
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    await files.permission(dir);
    if (d.file) {
      const path = await dir.resolve(d.file);
      if (!path || path.length !== 1)
        throw new Error('Bitte genau den Ordner auswählen, in dem die .tex-Datei liegt.');
    }
    const loaded = await files.readConfig(dir, d.name);
    if (JSON.stringify(d.config) === d.savedConfig) {
      d.config = loaded.config;
      d.savedConfig = JSON.stringify(loaded.config);
      d.revision++;
    } else if (loaded.raw !== null) {
      const choice = await this.ask({
        title: 'Varianten im Ordner',
        message: 'Gespeicherte Varianten laden oder die aktuell bearbeiteten Varianten behalten?',
        options: ['Gespeicherte laden', 'Aktuelle behalten', 'Abbrechen'],
      });
      if (choice === 2) throw new DOMException('Abgebrochen', 'AbortError');
      if (choice === 0) {
        d.config = loaded.config;
        d.savedConfig = JSON.stringify(loaded.config);
        d.revision++;
      }
    }
    d.configRaw = loaded.raw;
    d.dir = dir;
    this.remember();
    this.emit();
  }
  async save(d = this.active) {
    if (this.state.busy || this.state.saving) return;
    this.state.saving = true;
    this.emit();
    try {
      return await this.saveDocument(d);
    } finally {
      this.state.saving = false;
      this.emit();
    }
  }
  private async saveDocument(
    d = this.active,
  ): Promise<{ text: string; config: Configuration; revision: number } | undefined> {
    if (!d) return;
    if (!d.file) {
      const selected = await window.showSaveFilePicker({ suggestedName: d.name, types: files.fileTypes });
      for (const other of this.state.documents)
        if (other !== d && other.file && (await selected.isSameEntry(other.file)))
          throw new Error('Diese Datei ist bereits in einem anderen Tab geöffnet.');
      d.file = selected;
      d.name = d.file.name;
      if (!/\.tex$/i.test(d.name)) {
        d.file = undefined;
        throw new Error('Der Dateiname muss auf .tex enden.');
      }
      d.saved = await (await d.file.getFile()).text();
      this.remember();
    }
    await files.permission(d.file);
    if (d.dir) {
      const relative = await d.dir.resolve(d.file);
      if (!relative || relative.length !== 1) {
        d.dir = undefined;
        d.configRaw = null;
        this.remember();
      }
    }
    if (JSON.stringify(d.config) !== d.savedConfig && !d.dir) await this.attach(d);
    const current = await (await d.file.getFile()).text();
    if (current !== d.saved) {
      const choice = await this.ask({
        title: 'Datei extern geändert',
        message: `„${d.name}“ wurde außerhalb von LatexHelper geändert.`,
        options: ['Abbrechen', 'Von Festplatte laden', 'Überschreiben'],
      });
      if (choice === 1) {
        d.text = current;
        d.saved = current;
        d.revision++;
        this.emit();
        return;
      }
      if (choice !== 2) return;
    }
    const snapshot = { text: d.text, config: simplifyConfig(validateConfig(d.config)), revision: d.revision };
    const configText = JSON.stringify(snapshot.config);
    let writeConfig =
      configText !== d.savedConfig ||
      (d.configRaw !== null && configText !== JSON.stringify(JSON.parse(d.configRaw)));
    if (d.dir) {
      await files.permission(d.dir);
      const disk = await files.optionalText(d.dir, `${stem(d.name)}.latexapp.json`);
      if (disk !== d.configRaw) {
        const choice = await this.ask({
          title: 'Varianten extern geändert',
          message: 'Die Begleitdatei wurde außerhalb von LatexHelper geändert.',
          options: ['Abbrechen', 'Von Festplatte laden', 'Überschreiben'],
        });
        if (choice === 1) {
          const loaded = await files.readConfig(d.dir, d.name);
          d.config = loaded.config;
          d.savedConfig = JSON.stringify(loaded.config);
          d.configRaw = loaded.raw;
          this.emit();
          return;
        }
        if (choice !== 2) return;
        writeConfig = true;
      }
    }
    await files.write(d.file, snapshot.text);
    d.saved = snapshot.text;
    d.config = snapshot.config;
    if (d.dir && writeConfig) {
      const raw = JSON.stringify(snapshot.config, null, 2) + '\n';
      await files.write(await d.dir.getFileHandle(`${stem(d.name)}.latexapp.json`, { create: true }), raw);
      d.configRaw = raw;
      d.savedConfig = configText;
    }
    this.state.status = 'Gespeichert';
    this.remember();
    this.emit();
    return snapshot;
  }
  async close(id: string) {
    if (this.state.busy || this.state.saving) throw new Error('Bitte den laufenden Build zuerst beenden.');
    const d = this.state.documents.find((doc) => doc.id === id);
    if (!d) return;
    if (dirty(d)) {
      const answer = await this.ask({
        title: 'Ungespeicherte Änderungen',
        message: `Änderungen an „${d.name}“ speichern?`,
        options: ['Speichern', 'Verwerfen', 'Abbrechen'],
      });
      if (answer === 2) return;
      if (answer === 0) {
        await this.save(d);
        if (dirty(d)) return;
      }
    }
    if (d.pdf) URL.revokeObjectURL(d.pdf);
    if (d.preview) void this.bridge.release(d.preview.workspace).catch(() => {});
    this.digests.delete(id);
    this.state.documents = this.state.documents.filter((doc) => doc.id !== id);
    if (this.state.active === id) this.state.active = this.state.documents.at(-1)?.id ?? '';
    this.emit();
    this.remember();
  }
  async build(mode: 'draft' | 'final') {
    const d = this.active;
    if (!d || this.state.busy || this.state.saving) return;
    if (this.state.preamble.enabled && !this.state.preamble.text.trim())
      throw new Error('Bitte unter „Präambel“ eine Präambel einschließlich \\documentclass einfügen.');
    if (mode === 'final' && !this.state.preamble.enabled)
      throw new Error('Für Arbeitsblatt und Lösung die gemeinsame Präambel aktivieren.');
    this.cancelRequested = false;
    this.state.busy = true;
    this.state.error = '';
    this.state.status = 'Speichern';
    this.emit();
    const started = performance.now();
    let workspace: string | undefined;
    let retained = false;
    try {
      if (!d.file) {
        if (!(await this.saveDocument(d))) return;
      }
      if (d.dir) {
        await files.permission(d.dir);
        if (d.configRaw === null) {
          const loaded = await files.readConfig(d.dir, d.name);
          if (loaded.raw !== null && JSON.stringify(d.config) === d.savedConfig) {
            d.config = loaded.config;
            d.savedConfig = JSON.stringify(loaded.config);
            d.revision++;
          }
          d.configRaw = loaded.raw;
        }
      } else {
        await this.attach(d);
        if (!d.dir) return;
      }
      const snapshot = await this.saveDocument(d);
      if (!snapshot) return;
      const preamble = this.state.preamble.enabled ? this.state.preamble.text : undefined;
      if (preamble !== undefined && !preamble.trim())
        throw new Error('Bitte unter „Präambel“ eine Präambel einschließlich \\documentclass einfügen.');
      const variants =
        mode === 'draft' && preamble !== undefined
          ? fixedVariants().filter((variant) => variant.solution === this.state.solution)
          : selectedVariants(snapshot.config, mode);
      this.state.capabilities = await this.bridge.connect();
      if (preamble !== undefined && !this.state.capabilities.preamble)
        throw new Error('Diese Bridge unterstützt keine separate Präambel. Bitte die Bridge aktualisieren.');
      if (!this.state.capabilities.engines.includes(snapshot.config.engine))
        throw new Error(
          `${snapshot.config.engine} fehlt. MiKTeX, TeX Live oder MacTeX installieren, oder das bin-Verzeichnis der vorhandenen Installation in LATEXHELPER_TEX_DIR eintragen, und Bridge neu starten.`,
        );
      this.state.status = 'Dateien vorbereiten';
      this.emit();
      const preparing = performance.now();
      const inputs = await files.collectFiles(d.dir);
      const known = this.digests.get(d.id);
      const digests = new Map<string, string>();
      const prepared = [];
      for (const input of inputs) {
        if (this.cancelRequested) throw new DOMException('Abgebrochen', 'AbortError');
        const main = input.path === d.name;
        const blob = main ? new Blob([snapshot.text]) : input.file;
        const identity = `${input.path}|${input.file.size}|${input.file.lastModified}`;
        const hash = (!main && known?.get(identity)) || (await sha256(blob));
        if (!main) digests.set(identity, hash);
        prepared.push({ path: input.path, blob, size: blob.size, hash });
      }
      this.digests.set(d.id, digests);
      const created = await this.bridge.workspace(
        d.preview?.workspace,
        prepared.map(({ path, size, hash }) => ({ path, size, hash })),
      );
      workspace = created.id;
      this.buildingWorkspace = workspace;
      const missing = new Set(created.missing ?? prepared.map((input) => input.path));
      for (const input of prepared) {
        if (this.cancelRequested) throw new DOMException('Abgebrochen', 'AbortError');
        if (!missing.has(input.path)) continue;
        await this.bridge.upload(workspace, input.path, input.blob);
      }
      if (!inputs.some((input) => input.path === d.name))
        throw new Error('Die Hauptdatei ist nicht mehr im freigegebenen Ordner.');
      const preparation = `LatexHelper: Dateien vorbereiten · ${seconds(performance.now() - preparing)}\n`;
      const job = await this.bridge.build({
        workspace,
        main: d.name,
        engine: snapshot.config.engine,
        shellEscape: snapshot.config.shellEscape,
        preamble,
        variants,
      });
      this.job = job.id;
      if (this.cancelRequested) await this.bridge.cancel(job.id);
      let result: BuildResult;
      do {
        result = await this.bridge.status(job.id);
        this.state.status = result.progress;
        this.emit();
        if (result.state === 'running' || result.state === 'queued')
          await new Promise((resolve) => setTimeout(resolve, 120));
      } while (result.state === 'running' || result.state === 'queued');
      const elapsed = seconds(performance.now() - started);
      this.state.resultDocument = d.id;
      this.state.diagnostics = result.results.flatMap((r) => r.diagnostics);
      this.state.log =
        preparation +
        result.results
          .map((r) => `━━ ${variants.find((v) => v.id === r.variant)?.name ?? r.variant} ━━\n${r.log}`)
          .join('\n');
      const successful = result.results.filter((r) => r.ok);
      const finalReady =
        mode === 'final' &&
        result.state === 'done' &&
        result.results.length === variants.length &&
        variants.every((variant) => successful.some((r) => r.variant === variant.id));
      if (successful.length) {
        const preview = successful.find((r) => r.variant === snapshot.config.draft) ?? successful[0];
        const blob = await this.bridge.pdf(job.id, preview.variant);
        if (d.pdf) URL.revokeObjectURL(d.pdf);
        if (d.preview) void this.bridge.release(d.preview.workspace).catch(() => {});
        d.pdf = URL.createObjectURL(blob);
        d.preview = { job: job.id, variant: preview.variant, revision: snapshot.revision, workspace };
        retained = true;
        if (finalReady) {
          const exports = variants.map((variant) => ({
            result: successful.find((r) => r.variant === variant.id)!,
            name: finalPdfName(d.name, variant),
          }));
          const existing: string[] = [];
          for (const output of exports) {
            try {
              await d.dir.getFileHandle(output.name);
              existing.push(output.name);
            } catch (error) {
              if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
            }
          }
          if (
            !existing.length ||
            (await this.ask({
              title: 'PDFs ersetzen',
              message: `Diese Dateien überschreiben?\n${existing.join('\n')}`,
              options: ['Ersetzen', 'Abbrechen'],
            })) === 0
          ) {
            for (const output of exports)
              await files.write(
                await d.dir.getFileHandle(output.name, { create: true }),
                await this.bridge.pdf(job.id, output.result.variant),
              );
          } else {
            this.state.status = 'Export abgebrochen';
            return;
          }
        }
      }
      const failed =
        result.results.some((r) => !r.ok) || (mode === 'final' && result.state === 'done' && !finalReady);
      this.state.status =
        result.state === 'cancelled'
          ? 'Abgebrochen'
          : failed
            ? successful.length
              ? 'Teilweise fehlgeschlagen'
              : 'Fehlgeschlagen'
            : `Fertig · ${elapsed}`;
      if (failed) {
        this.state.panel = true;
        const errors = this.state.diagnostics.filter((e) => e.severity === 'error');
        const relevant = errors.find((e) => e.file === d.name && e.line) || errors[0];
        if (relevant) this.jump(relevant, d.id);
      }
    } catch (error) {
      this.state.status =
        error instanceof DOMException && error.name === 'AbortError' ? 'Abgebrochen' : 'Fehlgeschlagen';
      if (this.job) await this.bridge.cancel(this.job).catch(() => {});
      throw error;
    } finally {
      this.buildingWorkspace = undefined;
      this.job = undefined;
      this.state.busy = false;
      if (workspace && !retained) void this.bridge.release(workspace).catch(() => {});
      if (this.state.status === 'Speichern') this.state.status = 'Bereit';
      this.emit();
    }
  }
  async cancel() {
    this.cancelRequested = true;
    if (this.job) await this.bridge.cancel(this.job);
  }
  jump(diagnostic: Diagnostic, id = this.state.active) {
    const d = this.state.documents.find((doc) => doc.id === id);
    if (d && diagnostic.line && diagnostic.file === d.name) {
      this.state.active = id;
      this.state.jump = { id, line: diagnostic.line, nonce: ++this.jumpNonce };
      this.emit();
    }
  }
  async sync(location: SyncLocation) {
    const d = this.active;
    if (!d?.preview || d.preview.revision !== d.revision) {
      this.notify(new Error('Die Vorschau ist nicht aktuell. Bitte zuerst neu kompilieren.'));
      return;
    }
    const preview = d.preview;
    const result = await this.bridge.sync(preview.job, preview.variant, location);
    if (this.active?.id !== d.id || d.preview !== preview || preview.revision !== d.revision) return;
    const target = result[0];
    if (!target) {
      this.notify(new Error('Zu dieser Stelle im PDF gibt es keine Quelltextzeile.'));
      return;
    }
    if (target.line) {
      this.jump({ file: target.file ?? d.name, line: target.line, message: '', severity: 'warning' });
    } else {
      this.state.pdfTarget = target;
      this.emit();
    }
  }
}
export const app = new AppController();
