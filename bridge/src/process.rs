use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{io::AsyncReadExt, process::Command};

pub const TOOLS: [&str; 7] = [
    "lualatex", "pdflatex", "xelatex", "bibtex", "biber", "synctex", "gnuplot",
];

fn configured_dirs() -> Vec<PathBuf> {
    let Some(value) = std::env::var_os("LATEXHELPER_TEX_DIR") else {
        return Vec::new();
    };
    std::env::split_paths(&value)
        .filter(|p| !p.as_os_str().is_empty())
        .collect()
}

fn default_dirs() -> Vec<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        vec![PathBuf::from("/Library/TeX/texbin")]
    }
    #[cfg(windows)]
    {
        let mut dirs = Vec::new();
        for (var, suffix) in [
            ("LOCALAPPDATA", "Programs/MiKTeX/miktex/bin/x64"),
            ("LOCALAPPDATA", "Programs/MiKTeX/miktex/bin"),
            ("ProgramFiles", "MiKTeX/miktex/bin/x64"),
            ("ProgramFiles(x86)", "MiKTeX/miktex/bin"),
        ] {
            if let Some(base) = std::env::var_os(var) {
                dirs.push(PathBuf::from(base).join(suffix));
            }
        }
        dirs
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        Vec::new()
    }
}

pub fn in_dir(dir: &Path, name: &str) -> Option<PathBuf> {
    for candidate in [dir.to_path_buf(), dir.join("bin"), dir.join("bin/x64")] {
        for file in [name.to_string(), format!("{name}.exe")] {
            let path = candidate.join(file);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

pub fn discover() -> HashMap<String, PathBuf> {
    let gnuplot_dir = std::env::var_os("LATEXHELPER_GNUPLOT_DIR")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    discover_in(&configured_dirs(), gnuplot_dir.as_deref())
}

fn gnuplot_default_dirs() -> Vec<PathBuf> {
    if cfg!(windows) {
        [
            ("ProgramFiles", "gnuplot"),
            ("ProgramFiles(x86)", "gnuplot"),
            ("LOCALAPPDATA", "Programs/gnuplot"),
        ]
        .into_iter()
        .filter_map(|(key, suffix)| {
            std::env::var_os(key).map(|base| PathBuf::from(base).join(suffix))
        })
        .collect()
    } else {
        Vec::new()
    }
}

pub fn discover_in(preferred: &[PathBuf], gnuplot_dir: Option<&Path>) -> HashMap<String, PathBuf> {
    let defaults = default_dirs();
    let mut result = HashMap::new();
    for name in TOOLS {
        let path = (if name == "gnuplot" {
            gnuplot_dir.and_then(|dir| in_dir(dir, name))
        } else {
            None
        })
        .or_else(|| preferred.iter().find_map(|dir| in_dir(dir, name)))
        .or_else(|| which::which(name).ok())
        .or_else(|| defaults.iter().find_map(|dir| in_dir(dir, name)))
        .or_else(|| {
            (name == "gnuplot")
                .then(|| {
                    gnuplot_default_dirs()
                        .iter()
                        .find_map(|dir| in_dir(dir, name))
                })
                .flatten()
        });
        if let Some(path) = path {
            result.insert(name.into(), path);
        }
    }
    result
}
#[cfg(windows)]
struct Job(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
unsafe impl Send for Job {}
#[cfg(windows)]
impl Drop for Job {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
#[cfg(windows)]
fn job(child: &tokio::process::Child) -> Result<Job, String> {
    use windows_sys::Win32::{
        Foundation::*,
        System::{JobObjects::*, Threading::*},
    };
    unsafe {
        let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if handle.is_null() {
            return Err("JobObject konnte nicht erstellt werden".into());
        }
        let job = Job(handle);
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            | JOB_OBJECT_LIMIT_PROCESS_MEMORY
            | JOB_OBJECT_LIMIT_JOB_MEMORY;
        info.ProcessMemoryLimit = 2 * 1024 * 1024 * 1024;
        info.JobMemoryLimit = 3 * 1024 * 1024 * 1024;
        if SetInformationJobObject(
            handle,
            JobObjectExtendedLimitInformation,
            &info as *const _ as _,
            std::mem::size_of_val(&info) as u32,
        ) == 0
        {
            return Err("JobObject-Limit fehlgeschlagen".into());
        }
        let process = OpenProcess(
            PROCESS_SET_QUOTA | PROCESS_TERMINATE,
            false as i32,
            child.id().ok_or("Prozess fehlt")?,
        );
        if process.is_null() {
            return Err("Prozesszugriff fehlgeschlagen".into());
        }
        let assigned = AssignProcessToJobObject(handle, process);
        CloseHandle(process);
        if assigned == 0 {
            return Err("Prozess konnte nicht isoliert werden".into());
        }
        Ok(job)
    }
}
fn check_output_budget(root: &Path) -> Result<(), String> {
    fn count(path: &Path, depth: usize, bytes: &mut u64, files: &mut u64) -> Result<(), String> {
        if depth > 30 {
            return Err("Ausgabe-Verzeichnis zu tief".into());
        }
        for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            crate::security::reject_link(&entry.path())?;
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            *files += 1;
            *bytes += metadata.len();
            if *files > 6000 || *bytes > 512 * 1024 * 1024 {
                return Err("Build überschreitet 512 MB oder 6000 Ausgabedateien".into());
            }
            if metadata.is_dir() {
                count(&entry.path(), depth + 1, bytes, files)?;
            }
        }
        Ok(())
    }
    count(root, 0, &mut 0, &mut 0)
}
async fn limited_read<T: tokio::io::AsyncRead + Unpin>(stream: T) -> Result<Vec<u8>, String> {
    let mut result = Vec::new();
    stream
        .take(4 * 1024 * 1024)
        .read_to_end(&mut result)
        .await
        .map_err(|e| e.to_string())?;
    Ok(result)
}
pub async fn run(
    program: &Path,
    args: &[String],
    cwd: &Path,
    cancel: Arc<AtomicBool>,
    shell_escape: bool,
    extra_tool_dir: Option<&Path>,
) -> Result<(bool, String), String> {
    if cancel.load(Ordering::SeqCst) {
        return Err("Abgebrochen".into());
    }
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(cwd)
        .env_clear()
        .kill_on_drop(true)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    for key in [
        "PATH",
        "SystemRoot",
        "WINDIR",
        "LANG",
        "LC_ALL",
        "HOME",
        "USERPROFILE",
        "TEMP",
        "TMP",
    ] {
        if let Ok(value) = std::env::var(key) {
            command.env(key, value);
        }
    }
    let executable_directory = program.parent().ok_or("Programmverzeichnis fehlt")?;
    let existing_path = std::env::var_os("PATH").unwrap_or_default();
    let search_path = extra_tool_dir
        .map(Path::to_path_buf)
        .into_iter()
        .chain(std::iter::once(executable_directory.to_path_buf()))
        .chain(std::env::split_paths(&existing_path).filter(|path| path.is_absolute()));
    command.env(
        "PATH",
        std::env::join_paths(search_path).map_err(|e| e.to_string())?,
    );
    command
        .env("openin_any", "p")
        .env("openout_any", "p")
        .env("shell_escape", if shell_escape { "t" } else { "f" })
        .env("GNUPLOT_LIB", cwd.join("out"))
        .env("TEXMFOUTPUT", cwd.join("out"))
        .env("TEXMFVAR", cwd.join("cache"))
        .env("TEXMFCONFIG", cwd.join("config"))
        .env("TEXMFHOME", cwd.join("texmf"))
        .env(
            "TEXINPUTS",
            format!(".{}", if cfg!(windows) { ";" } else { ":" }),
        )
        .env(
            "BIBINPUTS",
            format!(".{}", if cfg!(windows) { ";" } else { ":" }),
        );
    #[cfg(unix)]
    {
        command.process_group(0);
        unsafe {
            command.pre_exec(|| {
                let file = libc::rlimit {
                    rlim_cur: 128 * 1024 * 1024,
                    rlim_max: 128 * 1024 * 1024,
                };
                if libc::setrlimit(libc::RLIMIT_FSIZE, &file) != 0 {
                    return Err(std::io::Error::last_os_error());
                }
                let cpu = libc::rlimit {
                    rlim_cur: 120,
                    rlim_max: 121,
                };
                if libc::setrlimit(libc::RLIMIT_CPU, &cpu) != 0 {
                    return Err(std::io::Error::last_os_error());
                }
                let descriptors = libc::rlimit {
                    rlim_cur: 256,
                    rlim_max: 256,
                };
                if libc::setrlimit(libc::RLIMIT_NOFILE, &descriptors) != 0 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
    #[cfg(windows)]
    {
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("{}: {e}", program.display()))?;
    #[cfg(windows)]
    let _job = job(&child)?;
    #[cfg(unix)]
    let pid = child.id();
    let stdout = tokio::spawn(limited_read(child.stdout.take().ok_or("stdout fehlt")?));
    let stderr = tokio::spawn(limited_read(child.stderr.take().ok_or("stderr fehlt")?));
    let cancelled = async {
        loop {
            if cancel.load(Ordering::SeqCst) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    };
    let budget = async {
        loop {
            tokio::time::sleep(Duration::from_millis(500)).await;
            if let Err(error) = check_output_budget(cwd) {
                break error;
            }
        }
    };
    let outcome = tokio::select! {result=child.wait()=>result.map(|s|s.success()).map_err(|e|e.to_string()),_=cancelled=>Err("Abgebrochen".into()),error=budget=>Err(error),_=tokio::time::sleep(Duration::from_secs(120))=>Err("Zeitlimit von 120 Sekunden überschritten".into())};
    #[cfg(unix)]
    if let Some(pid) = pid {
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
    #[cfg(windows)]
    drop(_job);
    if outcome.is_err() {
        let _ = child.kill().await;
    }
    let out = stdout.await.map_err(|e| e.to_string())??;
    let err = stderr.await.map_err(|e| e.to_string())??;
    let log = format!(
        "{}{}",
        String::from_utf8_lossy(&out),
        String::from_utf8_lossy(&err)
    );
    match outcome {
        Ok(ok) => Ok((ok, log)),
        Err(error) => Err(format!("{error}\n{log}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_gnuplot_directory_takes_priority_and_supports_spaces() {
        let temp = tempfile::tempdir().unwrap();
        let preferred = temp.path().join("TeX tools");
        let gnuplot = temp.path().join("Program Files/gnuplot");
        std::fs::create_dir_all(&preferred).unwrap();
        std::fs::create_dir_all(gnuplot.join("bin")).unwrap();
        std::fs::write(preferred.join("gnuplot.exe"), "").unwrap();
        std::fs::write(gnuplot.join("bin/gnuplot.exe"), "").unwrap();
        assert_eq!(
            discover_in(&[preferred.clone()], Some(&gnuplot))["gnuplot"],
            gnuplot.join("bin/gnuplot.exe")
        );
        assert_eq!(
            discover_in(&[preferred.clone()], None)["gnuplot"],
            preferred.join("gnuplot.exe")
        );
        assert!(in_dir(&temp.path().join("missing"), "gnuplot").is_none());
    }
    #[cfg(windows)]
    #[test]
    fn gnuplot_defaults_include_standard_installation_roots() {
        let dirs = gnuplot_default_dirs();
        for (key, suffix) in [
            ("ProgramFiles", "gnuplot"),
            ("ProgramFiles(x86)", "gnuplot"),
            ("LOCALAPPDATA", "Programs/gnuplot"),
        ] {
            if let Some(root) = std::env::var_os(key) {
                assert!(dirs.contains(&PathBuf::from(root).join(suffix)));
            }
        }
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn configured_gnuplot_wins_over_engine_directory_and_receives_output_search_path() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let engine = temp.path().join("engine");
        let gnuplot = temp.path().join("custom gnuplot");
        std::fs::create_dir_all(&engine).unwrap();
        std::fs::create_dir_all(&gnuplot).unwrap();
        std::fs::copy("/bin/sh", engine.join("engine")).unwrap();
        for (dir, script) in [
            (&engine, "#!/bin/sh\nexit 1\n"),
            (&gnuplot, "#!/bin/sh\nprintf '%s' \"$GNUPLOT_LIB\"\n"),
        ] {
            let path = dir.join("gnuplot");
            std::fs::write(&path, script).unwrap();
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        let (ok, output) = run(
            &engine.join("engine"),
            &["-c".into(), "gnuplot".into()],
            temp.path(),
            Arc::new(AtomicBool::new(false)),
            true,
            Some(&gnuplot),
        )
        .await
        .unwrap();
        assert!(ok, "{output}");
        assert_eq!(output, temp.path().join("out").to_string_lossy());
    }
    #[tokio::test]
    async fn cancelled_command_never_starts() {
        let temp = tempfile::tempdir().unwrap();
        let result = run(
            Path::new("does-not-exist"),
            &[],
            temp.path(),
            Arc::new(AtomicBool::new(true)),
            false,
            None,
        )
        .await;
        assert_eq!(result.unwrap_err(), "Abgebrochen");
    }
    #[test]
    fn rejects_output_directory_escape() {
        let temp = tempfile::tempdir().unwrap();
        let deep = temp
            .path()
            .join((0..32).map(|_| "nested").collect::<Vec<_>>().join("/"));
        std::fs::create_dir_all(deep).unwrap();
        assert!(check_output_budget(temp.path()).is_err());
    }
    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn cancellation_terminates_descendants() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().to_owned();
        let cancelled = Arc::new(AtomicBool::new(false));
        let flag = cancelled.clone();
        let task = tokio::spawn(async move {
            run(
                Path::new("/bin/sh"),
                &["-c".into(), "sleep 60 & echo $! > child.pid; wait".into()],
                &root,
                flag,
                false,
                None,
            )
            .await
        });
        for _ in 0..100 {
            if temp.path().join("child.pid").exists() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let pid = std::fs::read_to_string(temp.path().join("child.pid")).unwrap();
        cancelled.store(true, Ordering::SeqCst);
        assert!(task.await.unwrap().unwrap_err().contains("Abgebrochen"));
        if let Ok(stat) = std::fs::read_to_string(format!("/proc/{}/stat", pid.trim())) {
            assert_eq!(stat.split_whitespace().nth(2), Some("Z"));
        }
    }
}
