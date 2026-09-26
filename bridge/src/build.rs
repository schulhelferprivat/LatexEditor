use crate::{model::*, process, security};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;

pub struct Job {
    pub result: Mutex<BuildResult>,
    pub cancel: Arc<AtomicBool>,
    pub root: PathBuf,
    pub request: BuildRequest,
    pub owner: String,
    pub shared: Arc<Shared>,
}
pub struct Shared {
    pub dir: PathBuf,
    fonts: Mutex<()>,
    rejected_formats: Mutex<HashSet<String>>,
}
impl Shared {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            fonts: Mutex::new(()),
            rejected_formats: Mutex::new(HashSet::new()),
        }
    }
    pub fn texmf_var(&self) -> PathBuf {
        self.dir.join("texmf-var")
    }
    fn font_marker(&self) -> PathBuf {
        self.texmf_var().join("latexhelper-fonts-ready")
    }
    pub fn fonts_ready(&self, engine: &Path) -> bool {
        std::fs::read_to_string(self.font_marker()).ok().as_deref()
            == Some(engine.to_string_lossy().as_ref())
    }
}
#[derive(Clone)]
struct Format {
    key: String,
    path: PathBuf,
    built: Option<Duration>,
}
const FORMAT_VERSION: u32 = 1;
const FORMAT_JOB: &str = "latexhelper-preamble";
fn seconds(duration: Duration) -> String {
    format!("{:.2} s", duration.as_secs_f64()).replace('.', ",")
}
fn append_note(log: &mut String, note: &str) {
    if !log.is_empty() {
        if !log.ends_with('\n') {
            log.push('\n');
        }
        log.push('\n');
    }
    log.push_str(&format!("LatexHelper: {note}\n"));
}
async fn report_progress(job: &Job, stages: &Mutex<Vec<String>>, index: usize, stage: String) {
    let line = {
        let mut stages = stages.lock().await;
        stages[index] = stage;
        stages
            .iter()
            .filter(|stage| !stage.is_empty())
            .cloned()
            .collect::<Vec<_>>()
            .join(" · ")
    };
    job.result.lock().await.progress = line;
}
pub fn diagnostics(log: &str, main: &str) -> Vec<Diagnostic> {
    let pattern = regex::Regex::new(r"^(.+?\.(?:tex|sty|cls|bib)):(\d+):[ \t]*(.*)$").unwrap();
    let source_line = regex::Regex::new(r"^l\.(\d+)\b").unwrap();
    let lines: Vec<_> = log.lines().collect();
    let starts_diagnostic = |line: &str| {
        pattern.is_match(line)
            || line.starts_with('!')
            || line.contains("Warning:")
            || line.starts_with("Overfull ")
            || line.starts_with("Underfull ")
    };
    let mut items = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index];
        if !starts_diagnostic(line) {
            index += 1;
            continue;
        }
        let (file, mut position, first) = if let Some(cap) = pattern.captures(line) {
            let file = cap[1].trim().trim_start_matches("./").to_string();
            let file = if file.replace('\\', "/").rsplit('/').next() == Some(main) {
                main.into()
            } else {
                file
            };
            (file, cap[2].parse().ok(), cap[3].to_string())
        } else {
            (main.into(), None, line.trim_start_matches("! ").to_string())
        };
        let warning = first.contains("Warning")
            || first.starts_with("Overfull ")
            || first.starts_with("Underfull ");
        let mut message = first;
        index += 1;
        while index < lines.len() {
            let next = lines[index];
            if next.trim().is_empty()
                || starts_diagnostic(next)
                || source_line.is_match(next)
                || next.starts_with('<')
                || next.starts_with("See ")
                || next.starts_with("Type ")
                || next.starts_with("For immediate help")
                || next.starts_with("Transcript written")
                || next.starts_with("Output written")
                || next.starts_with("(./")
                || next.starts_with("[{")
                || next.starts_with("Here is how much")
            {
                break;
            }
            message.push('\n');
            message.push_str(next);
            index += 1;
        }
        if position.is_none() && !warning {
            for next in &lines[index..] {
                if starts_diagnostic(next) {
                    break;
                }
                if let Some(cap) = source_line.captures(next) {
                    position = cap[1].parse().ok();
                    break;
                }
            }
        }
        items.push(Diagnostic {
            severity: if warning { "warning" } else { "error" }.into(),
            message,
            file,
            line: position,
            column: None,
        });
    }
    items
}
pub const PRESERVED_CACHES: [&str; 2] = ["texmf", "config"];
fn is_unchanged(source: &std::fs::Metadata, dest: &Path) -> bool {
    let Ok(existing) = dest.metadata() else {
        return false;
    };
    if !existing.is_file() || existing.len() != source.len() {
        return false;
    }
    match (source.modified(), existing.modified()) {
        (Ok(from), Ok(to)) => from == to,
        _ => false,
    }
}
pub fn copy_tree(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(from).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        security::reject_link(&entry.path())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() {
            return Err("Symlinks sind nicht erlaubt".into());
        }
        let dest = to.join(entry.file_name());
        if kind.is_dir() {
            copy_tree(&entry.path(), &dest)?;
        } else if kind.is_file() {
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            if is_unchanged(&metadata, &dest) {
                continue;
            }
            std::fs::copy(entry.path(), &dest).map_err(|e| e.to_string())?;
            let modified = metadata.modified().map_err(|e| e.to_string())?;
            std::fs::File::options()
                .write(true)
                .open(&dest)
                .and_then(|file| file.set_modified(modified))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
fn clear_except_caches(dir: &Path) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        security::reject_link(&entry.path())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_dir()
            && PRESERVED_CACHES
                .iter()
                .any(|name| entry.file_name() == *name)
        {
            continue;
        }
        if kind.is_dir() {
            std::fs::remove_dir_all(entry.path()).map_err(|e| e.to_string())?;
        } else {
            std::fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
fn validate_bibliography(root: &Path, aux: &str, bcf: &[u8]) -> Result<(), String> {
    let mut sources = Vec::new();
    if !bcf.is_empty() {
        let xml = std::str::from_utf8(bcf).map_err(|e| e.to_string())?;
        let document = roxmltree::Document::parse(xml).map_err(|e| e.to_string())?;
        for node in document
            .descendants()
            .filter(|node| node.is_element() && node.tag_name().name() == "datasource")
        {
            if node.attribute("type").is_some_and(|kind| kind != "file") {
                return Err("Nur lokale Literaturquellen sind erlaubt".into());
            }
            sources.push(node.text().unwrap_or("").to_owned());
        }
    } else {
        let pattern = regex::Regex::new(r"\\bibdata\{([^}]+)\}").unwrap();
        for captures in pattern.captures_iter(aux) {
            for source in captures[1].split(',') {
                sources.push(format!("{source}.bib"));
            }
        }
        let styles = regex::Regex::new(r"\\bibstyle\{([^}]+)\}").unwrap();
        for captures in styles.captures_iter(aux) {
            security::relative_path(&captures[1])?;
        }
    }
    for source in sources {
        security::relative_path(&source)?;
        let path = root
            .join(&source)
            .canonicalize()
            .map_err(|_| format!("Literaturquelle fehlt: {source}"))?;
        if !path.starts_with(root.canonicalize().map_err(|e| e.to_string())?) {
            return Err("Literaturquelle außerhalb des Arbeitsbereichs".into());
        }
    }
    Ok(())
}
fn explain_plot_errors(diagnostics: &mut [Diagnostic], shell_escape: bool, has_gnuplot: bool) {
    for diagnostic in diagnostics {
        let message = diagnostic.message.replace('\n', "");
        if (message.contains("tkzfonct.table") || message.contains("tkzfct.table"))
            && message.contains("Plot data file")
            && message.contains("not found")
        {
            if !shell_escape {
                diagnostic.message.push_str("\nShell Escape ist für dieses Dokument deaktiviert. Aktiviere es in den Einstellungen für \\tkzFct.");
            }
            if !has_gnuplot {
                diagnostic.message.push_str("\nGnuplot wurde nicht erkannt. Prüfe den Gnuplot-Installationspfad in den Einstellungen und wähle Erneut prüfen.");
            }
            if shell_escape && has_gnuplot {
                diagnostic.message.push_str("\nShell Escape ist aktiviert und Gnuplot wurde erkannt. Prüfe den Gnuplot-Aufruf und dessen Fehlermeldung im Build-Log.");
            }
        }
    }
}
fn explain_engine_errors(diagnostics: &mut [Diagnostic], engine: &str) {
    for diagnostic in diagnostics {
        if engine == "pdflatex"
            && diagnostic
                .message
                .replace('\n', "")
                .contains("requires either XeTeX or")
        {
            diagnostic.message.push_str("\nfontspec benötigt LuaLaTeX oder XeLaTeX. Unter „Präambel“ die Vorlage wiederherstellen oder in den Einstellungen LuaLaTeX als PDF-Builder wählen.");
        }
    }
}
fn explain_lua_font_failure(diagnostics: &mut Vec<Diagnostic>, request: &BuildRequest, log: &str) {
    if request.engine == "lualatex"
        && !request.shell_escape
        && log.contains("luaotfload")
        && log.contains("FATAL ERROR")
    {
        diagnostics.insert(
            0,
            Diagnostic {
                severity: "error".into(),
                message: "LuaLaTeX kann ohne Shell Escape keine Schriften laden, weil die Bridge Lesezugriffe auf den Dokumentordner beschränkt. In den Einstellungen Shell Escape für dieses Dokument aktivieren oder pdfLaTeX als PDF-Builder wählen.".into(),
                file: request.main.clone(),
                line: None,
                column: None,
            },
        );
    }
}
fn is_format_failure(log: &str) -> bool {
    let lowercase = log.to_lowercase();
    !log.contains("latexhelper-wrapper-")
        || ["format file", "memory dump", "stymied", "referenced object"]
            .iter()
            .any(|signal| lowercase.contains(signal))
}
fn link_or_copy(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        std::fs::remove_file(to).map_err(|e| e.to_string())?;
    }
    if std::fs::hard_link(from, to).is_ok() {
        return Ok(());
    }
    std::fs::copy(from, to)
        .map(|_| ())
        .map_err(|e| e.to_string())
}
pub async fn prepare_fonts(shared: &Shared, engine: &Path, cancel: Arc<AtomicBool>) {
    let _guard = shared.fonts.lock().await;
    if shared.fonts_ready(engine) || std::fs::create_dir_all(&shared.dir).is_err() {
        return;
    }
    let Ok(temp) = tempfile::Builder::new()
        .prefix("fonts-")
        .tempdir_in(&shared.dir)
    else {
        return;
    };
    if std::fs::write(
        temp.path().join("fonts.tex"),
        "\\documentclass{article}\\begin{document}x\\textsf{x}\\textbf{x}\\end{document}\n",
    )
    .is_err()
    {
        return;
    }
    let args = [
        "-interaction=nonstopmode".into(),
        "-halt-on-error".into(),
        "-shell-escape".into(),
        "--nosocket".into(),
        "fonts.tex".into(),
    ];
    let texmf_var = shared.texmf_var();
    if let Ok((true, _)) =
        process::run(engine, &args, temp.path(), cancel, true, None, &texmf_var).await
    {
        let _ = std::fs::create_dir_all(&texmf_var);
        let _ = std::fs::write(shared.font_marker(), engine.to_string_lossy().as_bytes());
    }
}
fn format_key(request: &BuildRequest, engine: &Path) -> Option<String> {
    let binary = std::fs::metadata(engine).ok()?;
    let modified = binary
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs();
    let day = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs() / 86_400;
    let identity = serde_json::to_vec(&(
        FORMAT_VERSION,
        &request.preamble,
        &request.engine,
        engine.to_string_lossy(),
        binary.len(),
        modified,
        request.shell_escape,
        day,
    ))
    .ok()?;
    Some(format!("{:x}", Sha256::digest(identity)))
}
fn prune_formats(formats: &Path, keep: &str) {
    let Ok(entries) = std::fs::read_dir(formats) else {
        return;
    };
    let mut others: Vec<_> = entries
        .flatten()
        .filter(|entry| entry.file_name() != keep)
        .filter(|entry| security::reject_link(&entry.path()).is_ok())
        .filter_map(|entry| {
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, entry.path()))
        })
        .collect();
    others.sort();
    others.reverse();
    for (_, path) in others.into_iter().skip(2) {
        let _ = std::fs::remove_dir_all(path);
    }
}
async fn ensure_format(job: &Job, engine: &Path) -> Option<Format> {
    let preamble = job.request.preamble.as_ref()?;
    if job.request.engine != "pdflatex"
        || job
            .request
            .variants
            .iter()
            .any(|variant| !variant.defines.is_empty())
    {
        return None;
    }
    let key = format_key(&job.request, engine)?;
    if job.shared.rejected_formats.lock().await.contains(&key) {
        return None;
    }
    let formats = job.shared.dir.join("formats");
    let dir = formats.join(&key);
    let path = dir.join(format!("{FORMAT_JOB}.fmt"));
    if path.is_file() {
        return Some(Format {
            key,
            path,
            built: None,
        });
    }
    job.result.lock().await.progress = "Präambel vorbereiten".into();
    let started = Instant::now();
    if dir.exists() {
        std::fs::remove_dir_all(&dir).ok()?;
    }
    std::fs::create_dir_all(&dir).ok()?;
    std::fs::write(dir.join(format!("{FORMAT_JOB}.tex")), preamble).ok()?;
    std::fs::write(
        dir.join("source.tex"),
        format!(
            "\\input{{{FORMAT_JOB}.tex}}\n\\endofdump\n\\begin{{document}}\n\\end{{document}}\n"
        ),
    )
    .ok()?;
    let args = [
        "-ini".into(),
        "-interaction=nonstopmode".into(),
        "-halt-on-error".into(),
        if job.request.shell_escape {
            "-shell-escape"
        } else {
            "-no-shell-escape"
        }
        .into(),
        format!("-jobname={FORMAT_JOB}"),
        "&pdflatex".into(),
        "mylatexformat.ltx".into(),
        "source.tex".into(),
    ];
    let outcome = process::run(
        engine,
        &args,
        &dir,
        job.cancel.clone(),
        job.request.shell_escape,
        None,
        &job.shared.texmf_var(),
    )
    .await;
    if !matches!(outcome, Ok((true, _))) || !path.is_file() {
        let _ = std::fs::remove_dir_all(&dir);
        if outcome.is_ok() {
            job.shared.rejected_formats.lock().await.insert(key);
        }
        return None;
    }
    prune_formats(&formats, &key);
    Some(Format {
        key,
        path,
        built: Some(started.elapsed()),
    })
}
fn fingerprint(root: &Path) -> Vec<u8> {
    let mut hash = Sha256::new();
    for ext in ["aux", "toc", "out", "bcf", "bbl"] {
        hash.update(std::fs::read(root.join(format!("out/result.{ext}"))).unwrap_or_default());
    }
    hash.finalize().to_vec()
}
async fn compile(
    job: &Job,
    variant: &Variant,
    tools: &HashMap<String, PathBuf>,
    stages: &Mutex<Vec<String>>,
    index: usize,
    format: Option<&Format>,
) -> Result<VariantResult, String> {
    let dir = job.root.join("runs").join(&variant.id);
    let cache_key = format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&(
                &job.request.main,
                &job.request.engine,
                &job.request.preamble,
                &job.request.solution,
                &job.request.shell_escape,
                &variant.defines,
                &variant.solution,
            ))
            .map_err(|e| e.to_string())?
        )
    );
    let cached = std::fs::read_to_string(dir.join("cache-key"))
        .ok()
        .as_deref()
        == Some(&cache_key);
    if dir.exists() && !cached {
        clear_except_caches(&dir)?;
    }
    copy_tree(&job.root.join("input"), &dir)?;
    std::fs::create_dir_all(dir.join("out")).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("cache-key"), &cache_key).map_err(|e| e.to_string())?;
    let file_key = &cache_key[..16];
    let wrapper_name = format!("latexhelper-wrapper-{file_key}.tex");
    let preamble_name = job
        .request
        .preamble
        .as_ref()
        .map(|_| format!("latexhelper-preamble-{file_key}.tex"));
    let format_name = format.map(|_| format!("latexhelper-format-{file_key}"));
    if job.root.join("input").join(&wrapper_name).exists()
        || preamble_name
            .as_ref()
            .is_some_and(|name| job.root.join("input").join(name).exists())
        || format_name
            .as_ref()
            .is_some_and(|name| job.root.join("input").join(format!("{name}.fmt")).exists())
    {
        return Err("Reservierter Dateiname im Projekt".into());
    }
    if let (Some(format), Some(name)) = (format, &format_name) {
        link_or_copy(&format.path, &dir.join(format!("{name}.fmt")))?;
    }
    if dir.join("out/result.pdf").exists() {
        std::fs::remove_file(dir.join("out/result.pdf")).map_err(|e| e.to_string())?;
    }
    if let (Some(name), Some(text)) = (&preamble_name, &job.request.preamble) {
        std::fs::write(dir.join(name), text).map_err(|e| e.to_string())?;
    }
    let wraps_document = preamble_name.is_some()
        && !security::has_document_environment(
            &std::fs::read_to_string(dir.join(&job.request.main)).map_err(|e| e.to_string())?,
        );
    std::fs::write(
        dir.join(&wrapper_name),
        security::wrapper(
            &job.request,
            variant,
            preamble_name.as_deref(),
            wraps_document,
            format_name.is_some(),
        ),
    )
    .map_err(|e| e.to_string())?;
    let engine = tools
        .get(&job.request.engine)
        .ok_or("TeX-Engine nicht installiert")?;
    let mut args = vec![
        "-interaction=nonstopmode".into(),
        "-halt-on-error".into(),
        "-file-line-error".into(),
        if job.request.shell_escape {
            "-shell-escape"
        } else {
            "-no-shell-escape"
        }
        .into(),
        "-synctex=1".into(),
        "-recorder".into(),
        "-output-directory=out".into(),
        "-jobname=result".into(),
    ];
    if job.request.engine == "lualatex" {
        args.push("--nosocket".into());
    }
    if let Some(name) = &format_name {
        args.push(format!("-fmt={name}"));
    }
    args.push(wrapper_name);
    let texmf_var = job.shared.texmf_var();
    let mut log = String::new();
    let mut last_engine_output = String::new();
    let mut success = true;
    let mut previous = if cached {
        fingerprint(&dir)
    } else {
        Vec::new()
    };
    let mut bibliography = Vec::new();
    let mut converged = false;
    for pass in 1..=5 {
        report_progress(
            job,
            stages,
            index,
            format!("{} · Durchlauf {pass}", variant.name),
        )
        .await;
        let gnuplot_dir = tools.get("gnuplot").and_then(|tool| tool.parent());
        let started = Instant::now();
        let (ok, output) = process::run(
            engine,
            &args,
            &dir,
            job.cancel.clone(),
            job.request.shell_escape,
            gnuplot_dir,
            &texmf_var,
        )
        .await?;
        log.push_str(&output);
        append_note(
            &mut log,
            &format!("Durchlauf {pass} · {}", seconds(started.elapsed())),
        );
        last_engine_output = output.clone();
        if !ok {
            success = false;
            break;
        }
        let aux = std::fs::read_to_string(dir.join("out/result.aux")).unwrap_or_default();
        let bcf = std::fs::read(dir.join("out/result.bcf")).unwrap_or_default();
        let bib_key = if !bcf.is_empty() {
            bcf.clone()
        } else {
            aux.lines()
                .filter(|line| {
                    line.starts_with("\\citation")
                        || line.starts_with("\\bibdata")
                        || line.starts_with("\\bibstyle")
                })
                .collect::<Vec<_>>()
                .join("\n")
                .into_bytes()
        };
        if !bib_key.is_empty()
            && bib_key != bibliography
            && (!bcf.is_empty() || aux.contains("\\bibdata"))
        {
            validate_bibliography(&dir, &aux, &bcf)?;
            let (tool, bib_args) = if !bcf.is_empty() {
                (
                    "biber",
                    vec![
                        "--noconf".into(),
                        "--input-directory=out".into(),
                        "--output-directory=out".into(),
                        "result".into(),
                    ],
                )
            } else {
                ("bibtex", vec!["out/result".into()])
            };
            let executable = tools
                .get(tool)
                .ok_or_else(|| format!("{tool} wird benötigt, ist aber nicht installiert"))?;
            let started = Instant::now();
            let (ok, output) = process::run(
                executable,
                &bib_args,
                &dir,
                job.cancel.clone(),
                false,
                None,
                &texmf_var,
            )
            .await?;
            log.push_str(&output);
            append_note(
                &mut log,
                &format!("{tool} · {}", seconds(started.elapsed())),
            );
            bibliography = bib_key;
            if !ok {
                success = false;
                break;
            }
        }
        let fingerprint = fingerprint(&dir);
        if (cached || pass >= 2)
            && previous == fingerprint
            && !output.contains("Rerun to get")
            && !output.contains("Please rerun")
            && !output.contains("Label(s) may have changed")
        {
            converged = true;
            break;
        }
        previous = fingerprint;
    }
    let diagnostic_log = if converged { &last_engine_output } else { &log };
    let mut diagnostics = diagnostics(diagnostic_log, &job.request.main);
    explain_plot_errors(
        &mut diagnostics,
        job.request.shell_escape,
        tools.contains_key("gnuplot"),
    );
    explain_engine_errors(&mut diagnostics, &job.request.engine);
    explain_lua_font_failure(&mut diagnostics, &job.request, &log);
    if let Some(name) = &preamble_name {
        for diagnostic in &mut diagnostics {
            if diagnostic.file.replace('\\', "/").rsplit('/').next() == Some(name.as_str()) {
                diagnostic.file = "Präambel".into();
            }
        }
    }
    if success && !converged {
        diagnostics.push(Diagnostic {
            severity: "warning".into(),
            message: "Nach fünf TeX-Durchläufen noch nicht stabil; Referenzen prüfen.".into(),
            file: job.request.main.clone(),
            line: None,
            column: None,
        });
    }
    success &= dir.join("out/result.pdf").is_file();
    if !success && !diagnostics.iter().any(|d| d.severity == "error") {
        diagnostics.push(Diagnostic {
            severity: "error".into(),
            message: "Kompilierung fehlgeschlagen. Details im Log.".into(),
            file: job.request.main.clone(),
            line: None,
            column: None,
        });
    }
    if log.len() > 8 * 1024 * 1024 {
        log = log.chars().take(8 * 1024 * 1024).collect();
    }
    Ok(VariantResult {
        variant: variant.id.clone(),
        ok: success,
        artifact: success.then(|| variant.id.clone()),
        diagnostics,
        log,
    })
}
pub async fn execute(job: Arc<Job>, tools: Arc<HashMap<String, PathBuf>>) {
    job.result.lock().await.state = "running".into();
    let count = job.request.variants.len();
    let stages = Arc::new(Mutex::new(vec![String::new(); count]));
    let permits = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(1)
        .min(count.max(1));
    let limit = Arc::new(tokio::sync::Semaphore::new(permits));
    let engine = tools.get(&job.request.engine).cloned();
    if let Some(engine) = engine
        .as_ref()
        .filter(|engine| job.request.engine == "lualatex" && !job.shared.fonts_ready(engine))
    {
        job.result.lock().await.progress = "Schriftcache vorbereiten".into();
        prepare_fonts(&job.shared, engine, job.cancel.clone()).await;
    }
    let format = match &engine {
        Some(engine) => ensure_format(&job, engine).await,
        None => None,
    };
    let mut tasks = tokio::task::JoinSet::new();
    for index in 0..count {
        let job = job.clone();
        let tools = tools.clone();
        let stages = stages.clone();
        let limit = limit.clone();
        let format = format.clone();
        tasks.spawn(async move {
            if job.cancel.load(Ordering::SeqCst) {
                return (index, None);
            }
            let Ok(_permit) = limit.acquire().await else {
                return (index, None);
            };
            if job.cancel.load(Ordering::SeqCst) {
                return (index, None);
            }
            let variant = &job.request.variants[index];
            let mut note = String::new();
            let mut outcome = compile(&job, variant, &tools, &stages, index, format.as_ref()).await;
            if let Some(format) = &format {
                match &outcome {
                    Ok(result) if !result.ok && is_format_failure(&result.log) => {
                        job.shared
                            .rejected_formats
                            .lock()
                            .await
                            .insert(format.key.clone());
                        append_note(
                            &mut note,
                            "Vorkompilierte Präambel unbrauchbar, Build ohne Format wiederholt",
                        );
                        outcome = compile(&job, variant, &tools, &stages, index, None).await;
                    }
                    _ => append_note(
                        &mut note,
                        &match format.built {
                            Some(duration) => {
                                format!("Präambel vorkompiliert · {}", seconds(duration))
                            }
                            None => "Vorkompilierte Präambel verwendet".into(),
                        },
                    ),
                }
            }
            let result = match outcome {
                Ok(mut result) => {
                    result.log.insert_str(0, &note);
                    result
                }
                Err(message) => VariantResult {
                    variant: variant.id.clone(),
                    ok: false,
                    artifact: None,
                    diagnostics: vec![Diagnostic {
                        severity: "error".into(),
                        message: message
                            .lines()
                            .next()
                            .unwrap_or("Build fehlgeschlagen")
                            .into(),
                        file: job.request.main.clone(),
                        line: None,
                        column: None,
                    }],
                    log: message,
                },
            };
            report_progress(&job, &stages, index, String::new()).await;
            (index, Some(result))
        });
    }
    let mut completed: Vec<Option<VariantResult>> = (0..count).map(|_| None).collect();
    while let Some(finished) = tasks.join_next().await {
        if let Ok((index, result)) = finished {
            completed[index] = result;
        }
    }
    job.result.lock().await.results = completed.into_iter().flatten().collect();
    let mut result = job.result.lock().await;
    result.state = if job.cancel.load(Ordering::SeqCst) {
        "cancelled"
    } else {
        "done"
    }
    .into();
    result.progress = if result.state == "cancelled" {
        "Abgebrochen"
    } else if result.results.iter().all(|r| r.ok) {
        "Fertig"
    } else {
        "Fehlgeschlagen"
    }
    .into();
}
pub fn checked_artifact(job: &Job, variant: &str, ext: &str) -> Result<PathBuf, String> {
    if !job.request.variants.iter().any(|v| v.id == variant) {
        return Err("Unbekannte Variante".into());
    }
    security::checked_file(&job.root, &format!("runs/{variant}/out/result.{ext}"))
}
pub async fn sync(
    job: &Job,
    variant: &str,
    location: SyncLocation,
    tools: &HashMap<String, PathBuf>,
) -> Result<Vec<SyncLocation>, String> {
    let tool = tools
        .get("synctex")
        .ok_or("SyncTeX ist nicht installiert")?;
    let pdf = checked_artifact(job, variant, "pdf")?;
    checked_artifact(job, variant, "synctex.gz")?;
    let root = job.root.join("runs").join(variant);
    let args = if let Some(line) = location.line {
        if line == 0 || line > 10_000_000 {
            return Err("Ungültige Zeile".into());
        }
        vec![
            "view".into(),
            "-i".into(),
            format!(
                "{}:{}:{}",
                line,
                location.column.unwrap_or(0),
                root.join(&job.request.main).display()
            ),
            "-o".into(),
            pdf.to_string_lossy().into_owned(),
        ]
    } else {
        let page = location.page.ok_or("Seite fehlt")?;
        let x = location.x.ok_or("x fehlt")?;
        let y = location.y.ok_or("y fehlt")?;
        if page == 0
            || page > 100000
            || !x.is_finite()
            || !y.is_finite()
            || x < 0.0
            || y < 0.0
            || x > 100000.0
            || y > 100000.0
        {
            return Err("Ungültige PDF-Position".into());
        }
        vec![
            "edit".into(),
            "-o".into(),
            format!("{page}:{x}:{y}:{}", pdf.display()),
        ]
    };
    let (ok, output) = process::run(
        tool,
        &args,
        &root,
        Arc::new(AtomicBool::new(false)),
        false,
        None,
        &job.shared.texmf_var(),
    )
    .await?;
    if !ok {
        return Err(output);
    }
    let mut results = Vec::new();
    let mut current = SyncLocation::default();
    for line in output.lines() {
        if let Some((key, value)) = line.split_once(':') {
            match key {
                "Page" => {
                    if current.page.is_some() {
                        results.push(current);
                        current = SyncLocation::default();
                    }
                    current.page = value.parse().ok();
                }
                "x" => current.x = value.parse().ok(),
                "y" => current.y = value.parse().ok(),
                "h" if current.x.is_none() => current.x = value.parse().ok(),
                "v" if current.y.is_none() => current.y = value.parse().ok(),
                "W" => current.width = value.parse().ok(),
                "H" => current.height = value.parse().ok(),
                "Input" => {
                    if current.file.is_some() {
                        results.push(current);
                        current = SyncLocation::default();
                    }
                    let input = Path::new(value);
                    let input = if input.is_absolute() {
                        input.to_owned()
                    } else {
                        root.join(input)
                    };
                    if input.canonicalize().ok() == root.join(&job.request.main).canonicalize().ok()
                    {
                        current.file = Some(job.request.main.clone());
                    }
                }
                "Line" => current.line = value.parse().ok(),
                "Column" => current.column = value.parse().ok(),
                _ => {}
            }
        }
    }
    results.push(current);
    results.retain(|r| r.page.is_some() || (r.file.is_some() && r.line.is_some()));
    Ok(results)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_wrapped_windows_errors_and_separate_diagnostics() {
        let path = "C:/Users/Name/AppData/Local/Programs/MiKTeX/tex/latex/base/fontenc.sty";
        let log = format!("{path}:116: Fo\nnt encoding `example' is unknown.\n\nSee the manual for explanation.\nl.116 example\nLaTeX Warning: Reference `x' on page 1\n undefined on input line 12.\n\n./main.tex:20: Another error.\n");
        let result = diagnostics(&log, "main.tex");
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].message, "Fo\nnt encoding `example' is unknown.");
        assert_eq!(result[0].file, path);
        assert_eq!(result[0].line, Some(116));
        assert_eq!(result[1].severity, "warning");
        assert!(result[1].message.contains("undefined on input line 12."));
        assert_eq!(result[2].line, Some(20));
    }
    #[test]
    fn preserves_multiline_package_errors_without_file_prefix() {
        let result = diagnostics("! Package fontspec Error: The font\n(fontspec)                could not be found.\n\nFor immediate help type H <return>.\nl.42 \\setsansfont{Missing}\n! Second error.\nl.43 text\n", "main.tex");
        assert_eq!(result.len(), 2);
        assert_eq!(
            result[0].message,
            "Package fontspec Error: The font\n(fontspec)                could not be found."
        );
        assert_eq!(result[0].line, Some(42));
        assert_eq!(result[1].line, Some(43));
    }
    #[test]
    fn extracts_primary_error() {
        let d = diagnostics(
            "./main.tex:12: Undefined control sequence.\nLaTeX Warning: Reference x undefined.\n",
            "main.tex",
        );
        assert_eq!(d[0].line, Some(12));
        assert_eq!(d[0].file, "main.tex");
        assert_eq!(d[0].severity, "error");
        assert_eq!(d[1].severity, "warning");
    }
    #[test]
    fn explains_fontspec_under_pdflatex_and_detects_format_failures() {
        let log = "./latexhelper-preamble-x.tex:2: Package fontspec Error: The fontspec package requires either XeTeX or\n(fontspec)                      LuaTeX.\n\nl.2 \\usepackage{fontspec}\n";
        let mut result = diagnostics(log, "main.tex");
        explain_engine_errors(&mut result, "lualatex");
        assert!(!result[0].message.contains("Vorlage"));
        explain_engine_errors(&mut result, "pdflatex");
        assert!(result[0].message.contains("Vorlage wiederherstellen"));
        assert!(is_format_failure(
            "---! ./x.fmt was written by tex\n(Fatal format file error; I'm stymied)"
        ));
        let crash = "luaotfload | load : FATAL ERROR\nluaotfload | load :   × Failed to load \"luaotfload\" module \"multiscript\".\n";
        let mut request: BuildRequest = serde_json::from_value(serde_json::json!({"workspace":"x","main":"main.tex","engine":"lualatex","variants":[{"id":"a","name":"A","suffix":"a","defines":{}}]})).unwrap();
        let mut result = diagnostics(crash, "main.tex");
        explain_lua_font_failure(&mut result, &request, crash);
        assert_eq!(result.len(), 1);
        assert!(result[0].message.contains("Shell Escape"));
        assert_eq!(result[0].severity, "error");
        request.shell_escape = true;
        let mut result = diagnostics(crash, "main.tex");
        explain_lua_font_failure(&mut result, &request, crash);
        assert!(result.is_empty());
        assert!(is_format_failure("Sorry, but pdflatex did not succeed."));
        assert!(is_format_failure(
            "(./latexhelper-wrapper-a.tex\n!pdfTeX error (ext1): cannot find referenced object."
        ));
        assert!(!is_format_failure(
            "(./latexhelper-wrapper-a.tex\n./main.tex:3: Undefined control sequence."
        ));
    }
    #[test]
    fn explains_missing_tkz_fct_plot_data() {
        for file in ["tkzfonct", "tkzfct"] {
            let log = format!("./Umkehrfunktion.tex:26: Package pgf Error: Plot data file `result.{file}.tab\nle' not found.\n");
            let mut result = diagnostics(&log, "Umkehrfunktion.tex");
            explain_plot_errors(&mut result, false, false);
            assert_eq!(result[0].line, Some(26));
            assert!(result[0].message.contains("Shell Escape"));
            assert!(result[0].message.contains("Gnuplot"));
            for (shell_escape, has_gnuplot) in [(true, true), (false, true), (true, false)] {
                let mut result = diagnostics(&log, "Umkehrfunktion.tex");
                explain_plot_errors(&mut result, shell_escape, has_gnuplot);
                assert_eq!(result[0].message.contains("deaktiviert"), !shell_escape);
                assert_eq!(result[0].message.contains("nicht erkannt"), !has_gnuplot);
                assert_eq!(
                    result[0].message.contains("Build-Log"),
                    shell_escape && has_gnuplot
                );
            }
        }
    }
}

#[cfg(test)]
mod engine_tests {
    use super::*;
    async fn compile_once(
        job: &Job,
        variant: &Variant,
        tools: &HashMap<String, PathBuf>,
    ) -> Result<VariantResult, String> {
        let stages = Mutex::new(vec![String::new()]);
        compile(job, variant, tools, &stages, 0, None).await
    }
    #[tokio::test]
    #[ignore = "Requires pdfLaTeX"]
    async fn parallel_variants_keep_request_order_and_separate_output() {
        let temp = tempfile::tempdir().unwrap();
        let tools = Arc::new(process::discover());
        let mut job = job(temp.path(), "pdflatex", "parallel.tex", variants());
        Arc::get_mut(&mut job).unwrap().request.preamble = Some("\\documentclass{article}".into());
        std::fs::write(
            job.root.join("input/parallel.tex"),
            "\\ifSolutions Loesung\\else Aufgabe\\fi",
        )
        .unwrap();
        execute(job.clone(), tools).await;
        let result = job.result.lock().await.clone();
        assert_eq!(result.state, "done");
        assert_eq!(result.progress, "Fertig");
        assert_eq!(result.results.len(), 2);
        for (index, variant) in job.request.variants.iter().enumerate() {
            assert_eq!(result.results[index].variant, variant.id);
            assert!(result.results[index].ok, "{}", result.results[index].log);
        }
        let student = std::fs::read(checked_artifact(&job, "student", "pdf").unwrap()).unwrap();
        let teacher = std::fs::read(checked_artifact(&job, "teacher", "pdf").unwrap()).unwrap();
        assert_ne!(student, teacher);
    }
    #[tokio::test]
    #[ignore = "Requires pdfLaTeX"]
    async fn preamble_change_preserves_tool_caches() {
        let temp = tempfile::tempdir().unwrap();
        let tools = process::discover();
        let mut job = job(
            temp.path(),
            "pdflatex",
            "cache.tex",
            variants().into_iter().take(1).collect(),
        );
        Arc::get_mut(&mut job).unwrap().request.preamble = Some("\\documentclass{article}".into());
        std::fs::write(job.root.join("input/cache.tex"), "Text.").unwrap();
        let variant = job.request.variants[0].clone();
        assert!(compile_once(&job, &variant, &tools).await.unwrap().ok);
        let run = job.root.join("runs/student");
        std::fs::create_dir_all(run.join("config")).unwrap();
        std::fs::write(run.join("config/tool.cfg"), "tool cache").unwrap();
        std::fs::write(run.join("out/stale.aux"), "veraltet").unwrap();
        Arc::get_mut(&mut job).unwrap().request.preamble =
            Some("\\documentclass[12pt]{article}".into());
        assert!(compile_once(&job, &variant, &tools).await.unwrap().ok);
        assert_eq!(
            std::fs::read_to_string(run.join("config/tool.cfg")).unwrap(),
            "tool cache"
        );
        assert!(!run.join("cache").exists());
        assert!(!run.join("out/stale.aux").exists());
    }
    #[tokio::test]
    #[ignore = "Requires LuaLaTeX"]
    async fn lualatex_warms_one_shared_font_cache() {
        let temp = tempfile::tempdir().unwrap();
        let tools = Arc::new(process::discover());
        let mut job = job(
            temp.path(),
            "lualatex",
            "fonts.tex",
            variants().into_iter().take(1).collect(),
        );
        Arc::get_mut(&mut job).unwrap().request.shell_escape = true;
        std::fs::write(
            job.root.join("input/fonts.tex"),
            "\\documentclass{article}\\begin{document}Text\\end{document}",
        )
        .unwrap();
        let engine = tools["lualatex"].clone();
        assert!(!job.shared.fonts_ready(&engine));
        execute(job.clone(), tools).await;
        let result = job.result.lock().await.clone();
        assert!(result.results[0].ok, "{}", result.results[0].log);
        assert!(job.shared.fonts_ready(&engine));
        assert!(job.shared.texmf_var().join("luatex-cache").is_dir());
        assert!(!job.root.join("runs/student/cache").exists());
    }
    #[tokio::test]
    #[ignore = "Requires pdfLaTeX and mylatexformat"]
    async fn pdflatex_reuses_precompiled_preamble_and_recovers_from_broken_format() {
        let temp = tempfile::tempdir().unwrap();
        let tools = Arc::new(process::discover());
        let mut job = job(
            temp.path(),
            "pdflatex",
            "format.tex",
            serde_json::from_value(serde_json::json!([
                {"id":"arbeitsblatt","name":"Arbeitsblatt","suffix":"arbeitsblatt","defines":{},"solution":false},
                {"id":"loesung","name":"Lösung","suffix":"loesung","defines":{},"solution":true}
            ]))
            .unwrap(),
        );
        Arc::get_mut(&mut job).unwrap().request.preamble = Some(
            "\\documentclass{article}\n\\usepackage{ifthen}\n\\newboolean{loesung}\n\\newcommand{\\marker}{Vorkompiliert}\n".into(),
        );
        std::fs::write(
            job.root.join("input/format.tex"),
            "\\marker\\ifthenelse{\\boolean{loesung}}{ Loesung}{ Aufgabe}\n",
        )
        .unwrap();
        let logs = |result: &BuildResult| {
            assert_eq!(result.results.len(), 2);
            for variant in &result.results {
                assert!(variant.ok, "{}", variant.log);
            }
            result.results[0].log.clone()
        };
        execute(job.clone(), tools.clone()).await;
        assert!(logs(&job.result.lock().await.clone())
            .starts_with("LatexHelper: Präambel vorkompiliert"));
        let formats: Vec<_> = std::fs::read_dir(job.shared.dir.join("formats"))
            .unwrap()
            .flatten()
            .collect();
        assert_eq!(formats.len(), 1);
        let format = formats[0].path().join(format!("{FORMAT_JOB}.fmt"));
        assert!(format.is_file());
        assert_ne!(
            std::fs::read(checked_artifact(&job, "arbeitsblatt", "pdf").unwrap()).unwrap(),
            std::fs::read(checked_artifact(&job, "loesung", "pdf").unwrap()).unwrap()
        );
        execute(job.clone(), tools.clone()).await;
        assert!(logs(&job.result.lock().await.clone())
            .starts_with("LatexHelper: Vorkompilierte Präambel verwendet"));
        std::fs::write(&format, "kein Format").unwrap();
        execute(job.clone(), tools.clone()).await;
        assert!(logs(&job.result.lock().await.clone())
            .starts_with("LatexHelper: Vorkompilierte Präambel unbrauchbar"));
        execute(job.clone(), tools).await;
        assert!(!logs(&job.result.lock().await.clone()).contains("Vorkompilierte Präambel"));
    }
    #[tokio::test]
    #[ignore = "Requires pdfLaTeX"]
    async fn shell_escape_is_enabled_only_for_opted_in_documents() {
        let temp = tempfile::tempdir().unwrap();
        let tools = process::discover();
        let mut job = job(
            temp.path(),
            "pdflatex",
            "shell.tex",
            variants().into_iter().take(1).collect(),
        );
        std::fs::write(
            job.root.join("input/shell.tex"),
            "\\documentclass{article}\\begin{document}Test\\immediate\\write18{echo enabled > shell-marker.txt}\\end{document}",
        ).unwrap();
        let variant = job.request.variants[0].clone();
        let result = compile_once(&job, &variant, &tools).await.unwrap();
        assert!(result.ok, "{}", result.log);
        assert!(!job.root.join("runs/student/shell-marker.txt").exists());
        Arc::get_mut(&mut job).unwrap().request.shell_escape = true;
        let result = compile_once(&job, &variant, &tools).await.unwrap();
        assert!(result.ok, "{}", result.log);
        assert_eq!(
            std::fs::read_to_string(job.root.join("runs/student/shell-marker.txt"))
                .unwrap()
                .trim(),
            "enabled"
        );
    }
    #[tokio::test]
    #[ignore = "Requires native TeX, tkz-fct and Gnuplot"]
    async fn tkz_fct_generates_plot_data_with_output_directory() {
        let temp = tempfile::Builder::new()
            .prefix("latexhelper plot ")
            .tempdir()
            .unwrap();
        let tools = process::discover();
        assert!(tools.contains_key("gnuplot"), "Gnuplot fehlt");
        for engine in ["pdflatex", "lualatex", "xelatex"] {
            assert!(tools.contains_key(engine), "{engine} fehlt");
            let root = temp.path().join(engine);
            let mut job = job(
                &root,
                engine,
                "plot.tex",
                variants().into_iter().take(1).collect(),
            );
            Arc::get_mut(&mut job).unwrap().request.shell_escape = true;
            std::fs::write(
                job.root.join("input/plot.tex"),
                include_str!("../../fixtures/gnuplot.tex"),
            )
            .unwrap();
            let variant = &job.request.variants[0];
            let result = compile_once(&job, variant, &tools).await.unwrap();
            assert!(result.ok, "{engine}: {}", result.log);
            let run = job.root.join("runs").join(&variant.id);
            assert!(run.join("out/result.pdf").is_file());
            assert!(run.join("out/result.tkzfonct.gnuplot").is_file());
            let table = [
                run.join("result.tkzfonct.table"),
                run.join("out/result.tkzfonct.table"),
            ]
            .into_iter()
            .find(|path| path.is_file())
            .expect("Plot-Tabelle fehlt");
            assert!(std::fs::metadata(table).unwrap().len() > 0);
        }
    }
    fn job(root: &Path, engine: &str, main: &str, variants: Vec<Variant>) -> Arc<Job> {
        std::fs::create_dir_all(root.join("input")).unwrap();
        let fixtures = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("fixtures");
        copy_tree(&fixtures, &root.join("input")).unwrap();
        Arc::new(Job {
            result: Mutex::new(BuildResult {
                id: "test".into(),
                state: "queued".into(),
                progress: String::new(),
                results: Vec::new(),
            }),
            cancel: Arc::new(AtomicBool::new(false)),
            root: root.to_owned(),
            request: BuildRequest {
                preamble: None,
                solution: None,
                shell_escape: false,
                workspace: "workspace".into(),
                main: main.into(),
                engine: engine.into(),
                variants,
            },
            owner: "test".into(),
            shared: Arc::new(Shared::new(root.join("shared"))),
        })
    }
    fn variants() -> Vec<Variant> {
        serde_json::from_value(serde_json::json!([
        {"id":"student","name":"Aufgabe","suffix":"aufgabe","defines":{"Solutions":false,"VariantTitle":"Aufgabe & Text"}},
        {"id":"teacher","name":"Loesung","suffix":"loesung","defines":{"Solutions":true,"VariantTitle":"Loesung & Text"}}
    ])).unwrap()
    }
    #[tokio::test]
    #[ignore = "Requires pdfLaTeX"]
    async fn reuses_auxiliary_files_and_invalidates_changed_preamble() {
        let temp = tempfile::tempdir().unwrap();
        let tools = Arc::new(process::discover());
        let mut job = job(
            temp.path(),
            "pdflatex",
            "cached.tex",
            variants().into_iter().take(1).collect(),
        );
        Arc::get_mut(&mut job).unwrap().request.preamble = Some("\\documentclass{article}".into());
        std::fs::write(
            job.root.join("input/cached.tex"),
            "\\section{Test}\\label{test}See \\ref{test}.",
        )
        .unwrap();
        execute(job.clone(), tools.clone()).await;
        assert!(job.result.lock().await.results[0].ok);
        let variant = job.request.variants[0].clone();
        let result = compile_once(&job, &variant, &tools).await.unwrap();
        assert!(result.ok, "{}", result.log);
        assert!(job.result.lock().await.progress.ends_with("Durchlauf 1"));
        assert!(!result
            .diagnostics
            .iter()
            .any(|d| d.message.contains("Rerun")));
        Arc::get_mut(&mut job).unwrap().request.preamble =
            Some("\\documentclass[12pt]{article}".into());
        let result = compile_once(&job, &variant, &tools).await.unwrap();
        assert!(result.ok, "{}", result.log);
        assert!(!job.result.lock().await.progress.ends_with("Durchlauf 1"));
    }
    #[tokio::test]
    #[ignore = "Requires pdfLaTeX and SyncTeX"]
    async fn real_preamble_content_boundaries_errors_and_synctex() {
        let tools = Arc::new(process::discover());
        for (body, preamble, expected_error) in [
            ("First line.\n\\par Second line.\n", "\\documentclass{article}\n", None),
            ("\\newcommand{\\localtext}{Local text}\n\\begin{document}\n\\localtext\n\\end{document}\n", "\\documentclass{article}\n", None),
            ("Text.\n", "\\documentclass{article}\n\\undefinedpreamblecommand\n", Some(("Präambel", 2))),
            ("Text.\n\\undefinedbodycommand\n", "\\documentclass{article}\n", Some(("body.tex", 2))),
        ] {
            let temp = tempfile::tempdir().unwrap();
            let mut job = job(temp.path(), "pdflatex", "body.tex", variants());
            Arc::get_mut(&mut job).unwrap().request.preamble = Some(preamble.into());
            std::fs::write(job.root.join("input/body.tex"), body).unwrap();
            execute(job.clone(), tools.clone()).await;
            let result = job.result.lock().await.clone();
            for variant in &result.results {
                if let Some((file, line)) = expected_error {
                    assert!(!variant.ok);
                    assert!(variant.diagnostics.iter().any(|item| item.file == file && item.line == Some(line)), "{}", variant.log);
                } else {
                    assert!(variant.ok, "{}", variant.log);
                }
            }
            assert_eq!(std::fs::read_to_string(job.root.join("input/body.tex")).unwrap(), body);
            if expected_error.is_none() {
                let line = if body.contains("localtext") { 3 } else { 1 };
                let forward = sync(&job, "student", SyncLocation { line: Some(line), column: Some(1), ..Default::default() }, &tools).await.unwrap();
                assert!(!forward.is_empty());
                let point = &forward[0];
                let inverse = sync(&job, "student", SyncLocation { page: point.page, x: point.x, y: point.y, ..Default::default() }, &tools).await.unwrap();
                assert!(inverse.iter().any(|location| location.file.as_deref() == Some("body.tex")));
            }
        }
    }
    #[tokio::test]
    #[ignore = "Requires LuaLaTeX, pdfLaTeX, XeLaTeX and SyncTeX on PATH"]
    async fn real_engines_assets_variants_and_bidirectional_synctex() {
        let tools = Arc::new(process::discover());
        for engine in ["lualatex", "pdflatex", "xelatex"] {
            assert!(tools.contains_key(engine), "{engine} fehlt");
            assert!(tools.contains_key("synctex"), "synctex fehlt");
            let temp = tempfile::tempdir().unwrap();
            let job = job(temp.path(), engine, "Varianten.tex", variants());
            let original = std::fs::read(job.root.join("input/Varianten.tex")).unwrap();
            execute(job.clone(), tools.clone()).await;
            let result = job.result.lock().await.clone();
            assert_eq!(result.results.len(), 2);
            for variant in &result.results {
                assert!(variant.ok, "{engine}: {}", variant.log);
            }
            let first = std::fs::read(checked_artifact(&job, "student", "pdf").unwrap()).unwrap();
            let second = std::fs::read(checked_artifact(&job, "teacher", "pdf").unwrap()).unwrap();
            assert_ne!(first, second);
            assert_eq!(
                std::fs::read(job.root.join("input/Varianten.tex")).unwrap(),
                original
            );
            let forward = sync(
                &job,
                "student",
                SyncLocation {
                    line: Some(5),
                    column: Some(1),
                    ..Default::default()
                },
                &tools,
            )
            .await
            .unwrap();
            assert!(
                !forward.is_empty(),
                "{engine}: forward SyncTeX returned no location"
            );
            let point = &forward[0];
            let inverse = sync(
                &job,
                "student",
                SyncLocation {
                    page: point.page,
                    x: point.x,
                    y: point.y,
                    ..Default::default()
                },
                &tools,
            )
            .await
            .unwrap();
            assert!(
                !inverse.is_empty(),
                "{engine}: inverse SyncTeX returned no location"
            );
            assert_eq!(inverse[0].file.as_deref(), Some("Varianten.tex"));
            assert!(inverse[0].line.is_some());
        }
    }
    #[tokio::test]
    #[ignore = "Requires LuaLaTeX from TeX Live"]
    async fn lualatex_without_shell_escape_explains_blocked_font_loading() {
        let temp = tempfile::tempdir().unwrap();
        let tools = Arc::new(process::discover());
        let job = job(
            temp.path(),
            "lualatex",
            "fonts.tex",
            variants().into_iter().take(1).collect(),
        );
        std::fs::write(
            job.root.join("input/fonts.tex"),
            "\\documentclass{article}\\begin{document}Text\\end{document}",
        )
        .unwrap();
        execute(job.clone(), tools).await;
        let result = job.result.lock().await.clone();
        let variant = &result.results[0];
        if variant.ok {
            return;
        }
        assert!(
            variant.diagnostics[0]
                .message
                .starts_with("LuaLaTeX kann ohne Shell Escape"),
            "{}",
            variant.log
        );
        assert!(!variant
            .diagnostics
            .iter()
            .any(|d| d.message.contains("Details im Log")));
    }
    #[tokio::test]
    #[ignore = "Requires LuaLaTeX, BibTeX, Biber and biblatex on PATH"]
    async fn real_bibliography_and_error_positions() {
        let tools = Arc::new(process::discover());
        assert!(tools.contains_key("biber"));
        assert!(tools.contains_key("bibtex"));
        for main in ["bibtex.tex", "biber.tex"] {
            let temp = tempfile::tempdir().unwrap();
            let mut job = job(
                temp.path(),
                "lualatex",
                main,
                variants().into_iter().take(1).collect(),
            );
            Arc::get_mut(&mut job).unwrap().request.shell_escape = true;
            execute(job.clone(), tools.clone()).await;
            let result = job.result.lock().await.clone();
            assert!(result.results[0].ok, "{}", result.results[0].log);
            let bbl =
                std::fs::read_to_string(job.root.join("runs/student/out/result.bbl")).unwrap();
            assert!(bbl.contains("Knuth"));
        }
        let temp = tempfile::tempdir().unwrap();
        let mut job = job(
            temp.path(),
            "lualatex",
            "error.tex",
            variants().into_iter().take(1).collect(),
        );
        Arc::get_mut(&mut job).unwrap().request.shell_escape = true;
        execute(job.clone(), tools).await;
        let result = job.result.lock().await.clone();
        assert!(!result.results[0].ok);
        assert!(
            result.results[0]
                .diagnostics
                .iter()
                .any(|d| d.file == "error.tex" && d.line == Some(4)),
            "{}",
            result.results[0].log
        );
    }
}
