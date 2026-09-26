#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]
mod build;
mod model;
mod process;
mod security;

use axum::{
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Path, Query, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post, put},
    Json, Router,
};
use model::*;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tokio::sync::Mutex;

struct Workspace {
    dir: tempfile::TempDir,
    owner: String,
    bytes: usize,
    files: HashSet<String>,
    sealed: bool,
}
#[derive(Clone)]
struct App {
    sessions: Arc<Mutex<HashMap<String, std::time::Instant>>>,
    workspaces: Arc<Mutex<HashMap<String, Workspace>>>,
    jobs: Arc<Mutex<HashMap<String, Arc<build::Job>>>>,
    tools: Arc<Mutex<Arc<HashMap<String, PathBuf>>>>,
    tex_dir: Arc<Mutex<Option<String>>>,
    gnuplot_dir: Arc<Mutex<Option<String>>>,
    tool_update: Arc<Mutex<()>>,
    root: PathBuf,
    shared: Arc<build::Shared>,
    dev: bool,
}
const APP_ORIGIN: &str = "https://schulhelferprivat.github.io";
type ApiResult<T> = Result<T, ApiError>;
struct ApiError(StatusCode, String);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, self.1).into_response()
    }
}
impl From<String> for ApiError {
    fn from(message: String) -> Self {
        Self(StatusCode::BAD_REQUEST, message)
    }
}
impl From<std::io::Error> for ApiError {
    fn from(error: std::io::Error) -> Self {
        Self(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
    }
}
fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}
fn owner(headers: &HeaderMap) -> String {
    bearer(headers).unwrap_or("").to_string()
}
fn forbidden() -> ApiError {
    ApiError(StatusCode::FORBIDDEN, "Zugriff verweigert".into())
}
async fn capabilities(app: &App) -> serde_json::Value {
    let tools = app.tools.lock().await.clone();
    let tex_dir = app.tex_dir.lock().await.clone();
    let gnuplot_dir = app.gnuplot_dir.lock().await.clone();
    serde_json::json!({"version":"1","preamble":true,"engines":(["lualatex","pdflatex","xelatex"].into_iter().filter(|name|tools.contains_key(*name)).collect::<Vec<_>>()),"tools":tools.keys().collect::<Vec<_>>(),"texDir":tex_dir,"gnuplotDir":gnuplot_dir,"gnuplotPath":tools.get("gnuplot")})
}
async fn guard(State(app): State<App>, request: Request, next: Next) -> Response {
    let host = request
        .headers()
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    if host != "localhost:38471"
        && !(app.dev && matches!(host, "localhost:5173" | "localhost:5500" | "127.0.0.1:5500"))
    {
        return forbidden().into_response();
    }
    let origin = request
        .headers()
        .get("origin")
        .map(|origin| origin.to_str().unwrap_or("").to_string());
    if let Some(origin) = origin.as_deref() {
        if origin != "http://localhost:38471"
            && origin != APP_ORIGIN
            && !(app.dev
                && matches!(
                    origin,
                    "http://localhost:5173" | "http://localhost:5500" | "http://127.0.0.1:5500"
                ))
        {
            return forbidden().into_response();
        }
    }
    let cross_origin = origin.as_deref() == Some(APP_ORIGIN);
    if cross_origin
        && request.method() == axum::http::Method::OPTIONS
        && request.uri().path().starts_with("/api/")
    {
        return preflight();
    }
    if request.uri().path().starts_with("/api/") {
        if request.uri().path() == "/api/v1/session" {
            if request.method() != axum::http::Method::POST
                || request
                    .headers()
                    .get("x-latexhelper-client")
                    .and_then(|v| v.to_str().ok())
                    != Some("1")
                || request.headers().get("origin").is_none()
            {
                return forbidden().into_response();
            }
        } else {
            let valid = if let Some(token) = bearer(request.headers()) {
                {
                    let mut sessions = app.sessions.lock().await;
                    if let Some(time) = sessions.get_mut(token) {
                        *time = std::time::Instant::now();
                        true
                    } else {
                        false
                    }
                }
            } else {
                false
            };
            if !valid {
                return forbidden().into_response();
            }
        }
    }
    let api = request.uri().path().starts_with("/api/");
    let mut response = next.run(request).await;
    let h = response.headers_mut();
    h.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    h.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    h.insert(
        "cross-origin-resource-policy",
        HeaderValue::from_static("same-origin"),
    );
    h.insert("content-security-policy",HeaderValue::from_static("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' blob:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"));
    h.insert(
        "cache-control",
        HeaderValue::from_static(if api { "no-store" } else { "no-cache" }),
    );
    if cross_origin {
        h.insert(
            "access-control-allow-origin",
            HeaderValue::from_static(APP_ORIGIN),
        );
        h.insert("vary", HeaderValue::from_static("origin"));
    }
    response
}
fn preflight() -> Response {
    let mut response = StatusCode::NO_CONTENT.into_response();
    let h = response.headers_mut();
    h.insert(
        "access-control-allow-origin",
        HeaderValue::from_static(APP_ORIGIN),
    );
    h.insert(
        "access-control-allow-methods",
        HeaderValue::from_static("GET, POST, PUT, DELETE"),
    );
    h.insert(
        "access-control-allow-headers",
        HeaderValue::from_static("authorization, content-type, x-latexhelper-client"),
    );
    h.insert(
        "access-control-allow-private-network",
        HeaderValue::from_static("true"),
    );
    h.insert("access-control-max-age", HeaderValue::from_static("600"));
    h.insert("vary", HeaderValue::from_static("origin"));
    response
}
async fn session(State(app): State<App>, headers: HeaderMap) -> ApiResult<Json<serde_json::Value>> {
    let mut sessions = app.sessions.lock().await;
    let token = if let Some(token) = bearer(&headers).filter(|t| sessions.contains_key(*t)) {
        token.to_string()
    } else {
        if sessions.len() >= 128 {
            return Err(ApiError(
                StatusCode::TOO_MANY_REQUESTS,
                "Zu viele Sitzungen. Bridge neu starten.".into(),
            ));
        }
        let token = format!("{}{}", uuid::Uuid::new_v4(), uuid::Uuid::new_v4());
        sessions.insert(token.clone(), std::time::Instant::now());
        token
    };
    sessions.insert(token.clone(), std::time::Instant::now());
    Ok(Json(
        serde_json::json!({"token":token,"capabilities":capabilities(&app).await}),
    ))
}
#[derive(serde::Deserialize)]
struct TexDirRequest {
    dir: Option<String>,
}
async fn set_tex_dir(
    State(app): State<App>,
    Json(request): Json<TexDirRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    let _update = app.tool_update.lock().await;
    let dir = request
        .dir
        .map(|d| d.trim().to_string())
        .filter(|d| !d.is_empty());
    let dirs: Vec<PathBuf> = match dir.as_deref() {
        Some(value) => {
            let dirs: Vec<PathBuf> = std::env::split_paths(value)
                .filter(|p| !p.as_os_str().is_empty())
                .collect();
            for candidate in &dirs {
                if !candidate.is_dir() {
                    return Err(
                        format!("Verzeichnis nicht gefunden: {}", candidate.display()).into(),
                    );
                }
            }
            dirs
        }
        None => Vec::new(),
    };
    let gnuplot_dir = app.gnuplot_dir.lock().await.clone();
    let found = process::discover_in(&dirs, gnuplot_dir.as_deref().map(std::path::Path::new));
    if dir.is_some()
        && !["lualatex", "pdflatex", "xelatex"]
            .iter()
            .any(|e| found.contains_key(*e))
    {
        return Err("Dort wurde keine TeX-Engine gefunden. Bitte das bin-Verzeichnis der Installation angeben.".to_string().into());
    }
    *app.tools.lock().await = Arc::new(found);
    *app.tex_dir.lock().await = dir;
    Ok(Json(capabilities(&app).await))
}
async fn refresh_tools(app: &App) {
    let tex_dir = app.tex_dir.lock().await.clone();
    let gnuplot_dir = app.gnuplot_dir.lock().await.clone();
    let dirs = tex_dir
        .as_deref()
        .map(|value| std::env::split_paths(value).collect::<Vec<_>>())
        .unwrap_or_default();
    *app.tools.lock().await = Arc::new(process::discover_in(
        &dirs,
        gnuplot_dir.as_deref().map(std::path::Path::new),
    ));
}
async fn refresh_capabilities(State(app): State<App>) -> Json<serde_json::Value> {
    let _update = app.tool_update.lock().await;
    refresh_tools(&app).await;
    Json(capabilities(&app).await)
}
async fn set_gnuplot_dir(
    State(app): State<App>,
    Json(request): Json<TexDirRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    let _update = app.tool_update.lock().await;
    let dir = request
        .dir
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(value) = &dir {
        let path = std::path::Path::new(value);
        if !path.is_absolute() || process::in_dir(path, "gnuplot").is_none() {
            return Err("Gnuplot nicht gefunden. Bitte den absoluten Installationspfad oder dessen bin-Verzeichnis angeben.".to_string().into());
        }
    }
    *app.gnuplot_dir.lock().await = dir;
    refresh_tools(&app).await;
    Ok(Json(capabilities(&app).await))
}
#[derive(Deserialize)]
struct WorkspaceQuery {
    previous: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct InputFile {
    path: String,
    size: usize,
    hash: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct InputManifest {
    files: Vec<InputFile>,
}
async fn workspace(
    State(app): State<App>,
    Query(query): Query<WorkspaceQuery>,
    headers: HeaderMap,
    manifest: Option<Json<InputManifest>>,
) -> ApiResult<Json<serde_json::Value>> {
    let mut declared = HashSet::new();
    if let Some(Json(manifest)) = &manifest {
        let mut total = 0usize;
        for file in &manifest.files {
            security::relative_path(&file.path)?;
            if !declared.insert(file.path.to_lowercase())
                || file.hash.len() != 64
                || !file.hash.bytes().all(|byte| byte.is_ascii_hexdigit())
            {
                return Err("Ungültige Dateiliste".to_string().into());
            }
            total = total
                .checked_add(file.size)
                .ok_or_else(|| "Upload-Limit überschritten".to_string())?;
        }
        if declared.len() > 1000 || total > 100 * 1024 * 1024 {
            return Err("Upload-Limit überschritten".to_string().into());
        }
    }
    let jobs = app.jobs.lock().await;
    let mut spaces = app.workspaces.lock().await;
    if spaces.len() >= 32 {
        return Err(ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "Zu viele Arbeitsbereiche. Ungenutzte Tabs schließen.".into(),
        ));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let dir = tempfile::Builder::new()
        .prefix("work-")
        .tempdir_in(&app.root)?;
    std::fs::create_dir(dir.path().join("input"))?;
    let mut reused = HashSet::new();
    let mut reused_bytes = 0;
    if let Some(previous) = query.previous {
        let source = spaces.get(&previous).ok_or_else(forbidden)?;
        if source.owner != owner(&headers) {
            return Err(forbidden());
        }
        for job in jobs
            .values()
            .filter(|job| job.request.workspace == previous)
        {
            if ["running", "queued"].contains(&job.result.lock().await.state.as_str()) {
                return Err(ApiError(
                    StatusCode::CONFLICT,
                    "Arbeitsbereich wird verwendet".into(),
                ));
            }
        }
        if let Some(Json(manifest)) = &manifest {
            for file in &manifest.files {
                if !source.files.contains(&file.path.to_lowercase()) {
                    continue;
                }
                let from = source.dir.path().join("input").join(&file.path);
                if !from.is_file() {
                    continue;
                }
                security::reject_link(&from)?;
                let contents = std::fs::read(&from)?;
                if contents.len() != file.size
                    || format!("{:x}", Sha256::digest(&contents)) != file.hash
                {
                    continue;
                }
                let target = dir.path().join("input").join(&file.path);
                std::fs::create_dir_all(target.parent().ok_or_else(forbidden)?)?;
                std::fs::write(target, contents)?;
                reused.insert(file.path.to_lowercase());
                reused_bytes += file.size;
            }
        }
        let runs = source.dir.path().join("runs");
        let removed_inputs = manifest.is_some() && !source.files.is_subset(&declared);
        if runs.exists() && !removed_inputs {
            for entry in std::fs::read_dir(runs)? {
                let entry = entry?;
                security::reject_link(&entry.path())?;
                let target = dir.path().join("runs").join(entry.file_name());
                std::fs::create_dir_all(&target)?;
                for name in ["out"].into_iter().chain(build::PRESERVED_CACHES) {
                    let from = entry.path().join(name);
                    if from.is_dir() {
                        security::reject_link(&from)?;
                        build::copy_tree(&from, &target.join(name))?;
                    }
                }
                let key = entry.path().join("cache-key");
                if key.is_file() {
                    security::reject_link(&key)?;
                    std::fs::copy(key, target.join("cache-key"))?;
                }
            }
        }
    }
    spaces.insert(
        id.clone(),
        Workspace {
            dir,
            owner: owner(&headers),
            bytes: reused_bytes,
            files: reused.clone(),
            sealed: false,
        },
    );
    let missing = manifest.map(|Json(manifest)| {
        manifest
            .files
            .into_iter()
            .filter(|file| !reused.contains(&file.path.to_lowercase()))
            .map(|file| file.path)
            .collect::<Vec<_>>()
    });
    Ok(Json(serde_json::json!({"id":id,"missing":missing})))
}
#[derive(Deserialize)]
struct FileQuery {
    path: String,
}
async fn upload(
    State(app): State<App>,
    Path(id): Path<String>,
    Query(query): Query<FileQuery>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<serde_json::Value>> {
    security::relative_path(&query.path)?;
    let mut spaces = app.workspaces.lock().await;
    let space = spaces.get_mut(&id).ok_or_else(forbidden)?;
    if space.owner != owner(&headers) || space.sealed {
        return Err(forbidden());
    }
    if space.bytes + body.len() > 100 * 1024 * 1024
        || space.files.len() >= 1000
        || space.files.contains(&query.path.to_lowercase())
    {
        return Err("Upload-Limit oder doppelter Dateiname".to_string().into());
    }
    let path = space.dir.path().join("input").join(&query.path);
    std::fs::create_dir_all(path.parent().ok_or_else(forbidden)?)?;
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(&body)?;
    space.bytes += body.len();
    space.files.insert(query.path.to_lowercase());
    Ok(Json(serde_json::json!({"ok":true})))
}
async fn start(
    State(app): State<App>,
    headers: HeaderMap,
    Json(request): Json<BuildRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    security::validate(&request)?;
    let tools = app.tools.lock().await.clone();
    if !tools.contains_key(&request.engine) {
        return Err("Gewählte TeX-Engine fehlt".to_string().into());
    }
    let mut jobs = app.jobs.lock().await;
    for job in jobs.values() {
        if ["running", "queued"].contains(&job.result.lock().await.state.as_str()) {
            return Err(ApiError(
                StatusCode::CONFLICT,
                "Es läuft bereits ein Build".into(),
            ));
        }
    }
    let mut spaces = app.workspaces.lock().await;
    let space = spaces.get_mut(&request.workspace).ok_or_else(forbidden)?;
    if space.owner != owner(&headers)
        || space.sealed
        || !space.files.contains(&request.main.to_lowercase())
    {
        return Err(forbidden());
    }
    space.sealed = true;
    let id = uuid::Uuid::new_v4().to_string();
    let job = Arc::new(build::Job {
        result: Mutex::new(BuildResult {
            id: id.clone(),
            state: "queued".into(),
            progress: "Bauen".into(),
            results: Vec::new(),
        }),
        cancel: Arc::new(AtomicBool::new(false)),
        root: space.dir.path().to_path_buf(),
        request,
        owner: owner(&headers),
        shared: app.shared.clone(),
    });
    jobs.insert(id.clone(), job.clone());
    tokio::spawn(build::execute(job, tools.clone()));
    Ok(Json(serde_json::json!({"id":id})))
}
async fn get_job(app: &App, id: &str, headers: &HeaderMap) -> ApiResult<Arc<build::Job>> {
    let jobs = app.jobs.lock().await;
    let job = jobs.get(id).ok_or_else(forbidden)?;
    if job.owner != owner(headers) {
        return Err(forbidden());
    }
    Ok(job.clone())
}
async fn status(
    State(app): State<App>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Json<BuildResult>> {
    let job = get_job(&app, &id, &headers).await?;
    let result = job.result.lock().await.clone();
    Ok(Json(result))
}
async fn cancel(
    State(app): State<App>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Json<serde_json::Value>> {
    get_job(&app, &id, &headers)
        .await?
        .cancel
        .store(true, Ordering::SeqCst);
    Ok(Json(serde_json::json!({"ok":true})))
}
async fn release(
    State(app): State<App>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Json<serde_json::Value>> {
    let mut jobs = app.jobs.lock().await;
    let mut spaces = app.workspaces.lock().await;
    if spaces
        .get(&id)
        .is_none_or(|space| space.owner != owner(&headers))
    {
        return Err(forbidden());
    }
    for job in jobs.values() {
        if job.request.workspace == id
            && ["running", "queued"].contains(&job.result.lock().await.state.as_str())
        {
            job.cancel.store(true, Ordering::SeqCst);
            let cleanup_app = app.clone();
            let cleanup_id = id.clone();
            tokio::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    let mut jobs = cleanup_app.jobs.lock().await;
                    let mut running = false;
                    for job in jobs
                        .values()
                        .filter(|job| job.request.workspace == cleanup_id)
                    {
                        running |=
                            ["running", "queued"].contains(&job.result.lock().await.state.as_str());
                    }
                    if !running {
                        jobs.retain(|_, job| job.request.workspace != cleanup_id);
                        cleanup_app.workspaces.lock().await.remove(&cleanup_id);
                        break;
                    }
                }
            });
            return Ok(Json(serde_json::json!({"ok":true})));
        }
    }
    jobs.retain(|_, job| job.request.workspace != id);
    spaces.remove(&id);
    Ok(Json(serde_json::json!({"ok":true})))
}
async fn pdf(
    State(app): State<App>,
    Path((id, variant)): Path<(String, String)>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let job = get_job(&app, &id, &headers).await?;
    if !job
        .result
        .lock()
        .await
        .results
        .iter()
        .any(|r| r.variant == variant && r.ok)
    {
        return Err(forbidden());
    }
    let path = build::checked_artifact(&job, &variant, "pdf")?;
    if std::fs::metadata(&path)?.len() > 100 * 1024 * 1024 {
        return Err("PDF überschreitet 100 MB".to_string().into());
    }
    let bytes = tokio::fs::read(path).await?;
    Ok(([("content-type", "application/pdf")], Body::from(bytes)).into_response())
}
async fn sync(
    State(app): State<App>,
    Path((id, variant)): Path<(String, String)>,
    headers: HeaderMap,
    Json(location): Json<SyncLocation>,
) -> ApiResult<Json<Vec<SyncLocation>>> {
    let job = get_job(&app, &id, &headers).await?;
    Ok(Json(
        build::sync(&job, &variant, location, &app.tools.lock().await.clone()).await?,
    ))
}
async fn expire_sessions(app: App) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        let owners = {
            let mut sessions = app.sessions.lock().await;
            sessions.retain(|_, last| last.elapsed() < std::time::Duration::from_secs(1800));
            sessions.keys().cloned().collect::<HashSet<_>>()
        };
        let mut jobs = app.jobs.lock().await;
        let mut running = HashSet::new();
        for job in jobs.values() {
            if !owners.contains(&job.owner) {
                job.cancel.store(true, Ordering::SeqCst);
                if ["running", "queued"].contains(&job.result.lock().await.state.as_str()) {
                    running.insert(job.request.workspace.clone());
                }
            }
        }
        jobs.retain(|_, job| {
            owners.contains(&job.owner) || running.contains(&job.request.workspace)
        });
        app.workspaces
            .lock()
            .await
            .retain(|id, space| owners.contains(&space.owner) || running.contains(id));
    }
}
fn router(app: App, dist: PathBuf) -> Router {
    Router::new()
        .route("/api/v1/session", post(session))
        .route("/api/v1/tex-dir", post(set_tex_dir))
        .route("/api/v1/gnuplot-dir", post(set_gnuplot_dir))
        .route("/api/v1/capabilities/refresh", post(refresh_capabilities))
        .route("/api/v1/workspaces", post(workspace))
        .route("/api/v1/workspaces/{id}", axum::routing::delete(release))
        .route("/api/v1/workspaces/{id}/file", put(upload))
        .route("/api/v1/builds", post(start))
        .route("/api/v1/builds/{id}", get(status))
        .route("/api/v1/builds/{id}/cancel", post(cancel))
        .route("/api/v1/builds/{id}/pdf/{variant}", get(pdf))
        .route("/api/v1/builds/{id}/sync/{variant}", post(sync))
        .fallback_service(tower_http::services::ServeDir::new(dist))
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024))
        .layer(middleware::from_fn_with_state(app.clone(), guard))
        .with_state(app.clone())
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:38471").await?;
    let base = std::env::var_os("LATEXHELPER_CACHE_DIR")
        .or_else(|| {
            std::env::var_os(if cfg!(windows) {
                "LOCALAPPDATA"
            } else {
                "HOME"
            })
        })
        .map(PathBuf::from)
        .ok_or("Benutzerverzeichnis fehlt")?;
    let root = base.join(if cfg!(windows) {
        "LatexHelper/workspaces"
    } else {
        ".cache/latexhelper/workspaces"
    });
    if root.exists() {
        security::reject_link(&root)?;
        for entry in std::fs::read_dir(&root)? {
            let entry = entry?;
            if entry.file_name().to_string_lossy().starts_with("work-") {
                security::reject_link(&entry.path())?;
                if entry.file_type()?.is_dir() {
                    std::fs::remove_dir_all(entry.path())?;
                }
            }
        }
    }
    std::fs::create_dir_all(&root)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700))?;
    }
    let app = App {
        sessions: Arc::new(Mutex::new(HashMap::new())),
        workspaces: Arc::new(Mutex::new(HashMap::new())),
        jobs: Arc::new(Mutex::new(HashMap::new())),
        tools: Arc::new(Mutex::new(Arc::new(process::discover()))),
        tex_dir: Arc::new(Mutex::new(std::env::var("LATEXHELPER_TEX_DIR").ok())),
        gnuplot_dir: Arc::new(Mutex::new(std::env::var("LATEXHELPER_GNUPLOT_DIR").ok())),
        tool_update: Arc::new(Mutex::new(())),
        shared: Arc::new(build::Shared::new(
            root.parent()
                .ok_or("Cache-Verzeichnis fehlt")?
                .to_path_buf(),
        )),
        root,
        dev: std::env::var("LATEXHELPER_DEV").as_deref() == Ok("1"),
    };
    let dist = std::env::var_os("LATEXHELPER_DIST")
        .map(PathBuf::from)
        .unwrap_or(
            std::env::current_exe()?
                .parent()
                .ok_or("Programmverzeichnis fehlt")?
                .join("dist"),
        );
    if !dist.join("index.html").is_file() && !app.dev {
        return Err(
            "Web-App fehlt. dist neben latexhelper-bridge ablegen oder LATEXHELPER_DIST setzen."
                .into(),
        );
    }
    tokio::spawn(expire_sessions(app.clone()));
    let warmup = app.clone();
    tokio::spawn(async move {
        let tools = warmup.tools.lock().await.clone();
        if let Some(engine) = tools.get("lualatex") {
            build::prepare_fonts(&warmup.shared, engine, Arc::new(AtomicBool::new(false))).await;
        }
    });
    let router = router(app.clone(), dist);
    println!("LatexHelper: http://localhost:38471");
    let shutdown_app = app.clone();
    axum::serve(listener, router)
        .with_graceful_shutdown(async move {
            #[cfg(unix)]
            {
                let mut terminate =
                    tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                        .expect("SIGTERM-Handler konnte nicht eingerichtet werden");
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => {},
                    _ = terminate.recv() => {},
                }
            }
            #[cfg(not(unix))]
            let _ = tokio::signal::ctrl_c().await;
            for job in shutdown_app.jobs.lock().await.values() {
                job.cancel.store(true, Ordering::SeqCst);
            }
        })
        .await?;
    for job in app.jobs.lock().await.values() {
        job.cancel.store(true, Ordering::SeqCst);
    }
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    Ok(())
}

#[cfg(test)]
mod api_tests {
    use super::*;
    use tower::ServiceExt;
    fn state(root: &std::path::Path) -> App {
        App {
            sessions: Arc::new(Mutex::new(HashMap::from([(
                "secret".into(),
                std::time::Instant::now(),
            )]))),
            workspaces: Arc::new(Mutex::new(HashMap::new())),
            jobs: Arc::new(Mutex::new(HashMap::new())),
            tools: Arc::new(Mutex::new(Arc::new(HashMap::new()))),
            tex_dir: Arc::new(Mutex::new(None)),
            gnuplot_dir: Arc::new(Mutex::new(None)),
            tool_update: Arc::new(Mutex::new(())),
            root: root.to_owned(),
            shared: Arc::new(build::Shared::new(root.join("shared"))),
            dev: false,
        }
    }
    fn request(path: &str, method: &str, origin: Option<&str>, token: Option<&str>) -> Request {
        let mut builder = Request::builder()
            .uri(path)
            .method(method)
            .header("host", "localhost:38471");
        if let Some(origin) = origin {
            builder = builder.header("origin", origin);
        }
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        builder.body(Body::empty()).unwrap()
    }
    async fn tool_request(
        app: &App,
        path: &str,
        body: serde_json::Value,
    ) -> (StatusCode, serde_json::Value) {
        let mut req = request(path, "POST", None, Some("secret"));
        req.headers_mut()
            .insert("content-type", HeaderValue::from_static("application/json"));
        *req.body_mut() = Body::from(body.to_string());
        let response = router(app.clone(), app.root.clone())
            .oneshot(req)
            .await
            .unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap();
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null),
        )
    }
    #[tokio::test]
    async fn gnuplot_configuration_refresh_and_validation_preserve_other_tools() {
        let temp = tempfile::tempdir().unwrap();
        let app = state(temp.path());
        let tex = temp.path().join("TeX bin");
        let gnuplot = temp.path().join("Program Files/gnuplot/bin");
        std::fs::create_dir_all(&tex).unwrap();
        std::fs::create_dir_all(&gnuplot).unwrap();
        std::fs::write(tex.join("pdflatex.exe"), "").unwrap();
        std::fs::write(gnuplot.join("gnuplot.exe"), "").unwrap();
        let (status, caps) = tool_request(
            &app,
            "/api/v1/gnuplot-dir",
            serde_json::json!({"dir": gnuplot}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            caps["gnuplotPath"],
            serde_json::json!(gnuplot.join("gnuplot.exe"))
        );
        let (status, caps) =
            tool_request(&app, "/api/v1/tex-dir", serde_json::json!({"dir": tex})).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(caps["gnuplotDir"], serde_json::json!(gnuplot));
        assert!(caps["engines"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("pdflatex")));
        for dir in [temp.path().join("missing"), tex.clone()] {
            let (status, _) =
                tool_request(&app, "/api/v1/gnuplot-dir", serde_json::json!({"dir": dir})).await;
            assert_eq!(status, StatusCode::BAD_REQUEST);
            assert_eq!(
                capabilities(&app).await["gnuplotDir"],
                serde_json::json!(gnuplot)
            );
        }
        std::fs::write(tex.join("xelatex.exe"), "").unwrap();
        assert_ne!(
            app.tools.lock().await.get("xelatex"),
            Some(&tex.join("xelatex.exe"))
        );
        let (status, caps) =
            tool_request(&app, "/api/v1/capabilities/refresh", serde_json::json!({})).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            app.tools.lock().await.get("xelatex"),
            Some(&tex.join("xelatex.exe"))
        );
        assert_eq!(caps["gnuplotDir"], serde_json::json!(gnuplot));
        let (status, caps) = tool_request(
            &app,
            "/api/v1/gnuplot-dir",
            serde_json::json!({"dir": null}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(caps["gnuplotDir"].is_null());
        assert_eq!(caps["texDir"], serde_json::json!(tex));
        for path in ["/api/v1/gnuplot-dir", "/api/v1/capabilities/refresh"] {
            let response = router(app.clone(), app.root.clone())
                .oneshot(request(path, "POST", None, None))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::FORBIDDEN);
        }
    }
    #[tokio::test]
    async fn live_server_sessions_require_development_mode_and_local_origin() {
        let temp = tempfile::tempdir().unwrap();
        for dev in [false, true] {
            let mut app = state(temp.path());
            app.dev = dev;
            let router = router(app, temp.path().into());
            for host in ["localhost:5500", "127.0.0.1:5500"] {
                for origin in [
                    "http://localhost:5500",
                    "http://127.0.0.1:5500",
                    "http://evil.invalid:5500",
                    "http://127.0.0.1:5501",
                ] {
                    let mut req = request("/api/v1/session", "POST", Some(origin), None);
                    req.headers_mut()
                        .insert("host", HeaderValue::from_str(host).unwrap());
                    req.headers_mut()
                        .insert("x-latexhelper-client", HeaderValue::from_static("1"));
                    let response = router.clone().oneshot(req).await.unwrap();
                    let allowed =
                        dev && matches!(origin, "http://localhost:5500" | "http://127.0.0.1:5500");
                    assert_eq!(
                        response.status(),
                        if allowed {
                            StatusCode::OK
                        } else {
                            StatusCode::FORBIDDEN
                        },
                        "dev={dev}, host={host}, origin={origin}"
                    );
                }
            }
        }
    }
    #[tokio::test]
    async fn rejects_foreign_origins_missing_tokens_and_rebinding() {
        let temp = tempfile::tempdir().unwrap();
        let app = state(temp.path());
        let router = router(app, temp.path().into());
        let foreign = router
            .clone()
            .oneshot(request(
                "/api/v1/workspaces",
                "POST",
                Some("https://evil.invalid"),
                Some("secret"),
            ))
            .await
            .unwrap();
        assert_eq!(foreign.status(), StatusCode::FORBIDDEN);
        let unauthenticated = router
            .clone()
            .oneshot(request(
                "/api/v1/workspaces",
                "POST",
                Some("http://localhost:38471"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(unauthenticated.status(), StatusCode::FORBIDDEN);
        let mut rebound = request("/", "GET", None, None);
        rebound
            .headers_mut()
            .insert("host", HeaderValue::from_static("evil.invalid:38471"));
        assert_eq!(
            router.clone().oneshot(rebound).await.unwrap().status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            router
                .oneshot(request("/api/v1/workspaces", "GET", None, Some("secret")))
                .await
                .unwrap()
                .status(),
            StatusCode::METHOD_NOT_ALLOWED
        );
    }
    #[tokio::test]
    async fn published_app_origin_passes_preflight_and_reads_responses() {
        let temp = tempfile::tempdir().unwrap();
        let app = state(temp.path());
        let router = router(app, temp.path().into());
        for path in ["/api/v1/session", "/api/v1/workspaces"] {
            let mut preflight = request(path, "OPTIONS", Some(APP_ORIGIN), None);
            preflight.headers_mut().insert(
                "access-control-request-method",
                HeaderValue::from_static("POST"),
            );
            let response = router.clone().oneshot(preflight).await.unwrap();
            assert_eq!(response.status(), StatusCode::NO_CONTENT, "{path}");
            let headers = response.headers();
            assert_eq!(headers["access-control-allow-origin"], APP_ORIGIN);
            assert_eq!(headers["access-control-allow-private-network"], "true");
            for header in ["authorization", "content-type", "x-latexhelper-client"] {
                assert!(headers["access-control-allow-headers"]
                    .to_str()
                    .unwrap()
                    .contains(header));
            }
        }
        let mut session = request("/api/v1/session", "POST", Some(APP_ORIGIN), None);
        session
            .headers_mut()
            .insert("x-latexhelper-client", HeaderValue::from_static("1"));
        let response = router.clone().oneshot(session).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()["access-control-allow-origin"],
            APP_ORIGIN
        );
        let unauthenticated = router
            .clone()
            .oneshot(request(
                "/api/v1/workspaces",
                "POST",
                Some(APP_ORIGIN),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(unauthenticated.status(), StatusCode::FORBIDDEN);
        for origin in [
            "https://evil.github.io",
            "http://schulhelferprivat.github.io",
            "https://schulhelferprivat.github.io.evil.invalid",
        ] {
            let mut foreign = request("/api/v1/session", "OPTIONS", Some(origin), None);
            foreign.headers_mut().insert(
                "access-control-request-method",
                HeaderValue::from_static("POST"),
            );
            let response = router.clone().oneshot(foreign).await.unwrap();
            assert_eq!(response.status(), StatusCode::FORBIDDEN, "{origin}");
            assert!(!response
                .headers()
                .contains_key("access-control-allow-origin"));
        }
        let local = router
            .oneshot(request(
                "/api/v1/workspaces",
                "POST",
                Some("http://localhost:38471"),
                Some("secret"),
            ))
            .await
            .unwrap();
        assert!(!local.headers().contains_key("access-control-allow-origin"));
    }
    #[tokio::test]
    async fn session_reconnect_preserves_workspace_ownership() {
        let temp = tempfile::tempdir().unwrap();
        let app = state(temp.path());
        let router = router(app.clone(), temp.path().into());
        let mut req = request(
            "/api/v1/session",
            "POST",
            Some("http://localhost:38471"),
            Some("secret"),
        );
        req.headers_mut()
            .insert("x-latexhelper-client", HeaderValue::from_static("1"));
        let response = router.clone().oneshot(req).await.unwrap();
        let bytes = axum::body::to_bytes(response.into_body(), 10000)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["token"], "secret");
        let response = router
            .oneshot(request(
                "/api/v1/workspaces",
                "POST",
                Some("http://localhost:38471"),
                Some("secret"),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            app.workspaces.lock().await.values().next().unwrap().owner,
            "secret"
        );
    }
    #[tokio::test]
    async fn incremental_inputs_reuse_unchanged_and_omit_deleted_files() {
        let temp = tempfile::tempdir().unwrap();
        let app = state(temp.path());
        let router = router(app.clone(), temp.path().into());
        let response = router
            .clone()
            .oneshot(request(
                "/api/v1/workspaces",
                "POST",
                Some("http://localhost:38471"),
                Some("secret"),
            ))
            .await
            .unwrap();
        let bytes = axum::body::to_bytes(response.into_body(), 10000)
            .await
            .unwrap();
        let id = serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        for (path, contents) in [
            ("main.tex", "old text"),
            ("images/chart.pdf", "unchanged image"),
            ("deleted.tex", "removed"),
        ] {
            let mut upload = request(
                &format!("/api/v1/workspaces/{id}/file?path={path}"),
                "PUT",
                Some("http://localhost:38471"),
                Some("secret"),
            );
            *upload.body_mut() = Body::from(contents);
            assert_eq!(
                router.clone().oneshot(upload).await.unwrap().status(),
                StatusCode::OK
            );
        }
        let source = app.workspaces.lock().await[&id].dir.path().to_owned();
        std::fs::create_dir_all(source.join("runs/student/out")).unwrap();
        std::fs::write(source.join("runs/student/out/result.aux"), "old labels").unwrap();
        let manifest = serde_json::json!({"files": [
            {"path":"main.tex", "size":8, "hash":format!("{:x}", Sha256::digest(b"new text"))},
            {"path":"images/chart.pdf", "size":15, "hash":format!("{:x}", Sha256::digest(b"unchanged image"))},
            {"path":"new.tex", "size":3, "hash":format!("{:x}", Sha256::digest(b"new"))}
        ]});
        let mut create = request(
            &format!("/api/v1/workspaces?previous={id}"),
            "POST",
            Some("http://localhost:38471"),
            Some("secret"),
        );
        create
            .headers_mut()
            .insert("content-type", HeaderValue::from_static("application/json"));
        *create.body_mut() = Body::from(manifest.to_string());
        let response = router.clone().oneshot(create).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), 10000)
            .await
            .unwrap();
        let result: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            result["missing"],
            serde_json::json!(["main.tex", "new.tex"])
        );
        let next = result["id"].as_str().unwrap();
        let spaces = app.workspaces.lock().await;
        let target = spaces[next].dir.path().to_owned();
        assert_eq!(spaces[next].bytes, 15);
        assert_eq!(spaces[next].files.len(), 1);
        drop(spaces);
        assert_eq!(
            std::fs::read(target.join("input/images/chart.pdf")).unwrap(),
            b"unchanged image"
        );
        assert!(!target.join("input/deleted.tex").exists());
        assert!(!target.join("runs").exists());
        for (path, contents) in [("main.tex", "new text"), ("new.tex", "new")] {
            let mut upload = request(
                &format!("/api/v1/workspaces/{next}/file?path={path}"),
                "PUT",
                Some("http://localhost:38471"),
                Some("secret"),
            );
            *upload.body_mut() = Body::from(contents);
            assert_eq!(
                router.clone().oneshot(upload).await.unwrap().status(),
                StatusCode::OK
            );
        }
        assert_eq!(
            std::fs::read(target.join("input/main.tex")).unwrap(),
            b"new text"
        );
        assert_eq!(
            std::fs::read(source.join("input/main.tex")).unwrap(),
            b"old text"
        );
    }
    #[tokio::test]
    async fn session_cache_copies_auxiliary_files_and_releases_directories() {
        let temp = tempfile::tempdir().unwrap();
        let app = state(temp.path());
        let router = router(app.clone(), temp.path().into());
        let response = router
            .clone()
            .oneshot(request(
                "/api/v1/workspaces",
                "POST",
                Some("http://localhost:38471"),
                Some("secret"),
            ))
            .await
            .unwrap();
        let bytes = axum::body::to_bytes(response.into_body(), 10000)
            .await
            .unwrap();
        let id = serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let source = app.workspaces.lock().await[&id].dir.path().to_owned();
        std::fs::create_dir_all(source.join("runs/student/out")).unwrap();
        std::fs::write(source.join("runs/student/out/result.aux"), "cached labels").unwrap();
        std::fs::write(source.join("runs/student/old.tex"), "old source").unwrap();
        app.sessions
            .lock()
            .await
            .insert("other".into(), std::time::Instant::now());
        let path = format!("/api/v1/workspaces?previous={id}");
        let response = router
            .clone()
            .oneshot(request(
                &path,
                "POST",
                Some("http://localhost:38471"),
                Some("other"),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let response = router
            .clone()
            .oneshot(request(
                &path,
                "POST",
                Some("http://localhost:38471"),
                Some("secret"),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), 10000)
            .await
            .unwrap();
        let next = serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let target = app.workspaces.lock().await[&next].dir.path().to_owned();
        assert_eq!(
            std::fs::read_to_string(target.join("runs/student/out/result.aux")).unwrap(),
            "cached labels"
        );
        assert!(!target.join("runs/student/old.tex").exists());
        let job = Arc::new(build::Job {
            result: Mutex::new(BuildResult {
                id: "cleanup-test".into(),
                state: "running".into(),
                progress: String::new(),
                results: Vec::new(),
            }),
            cancel: Arc::new(AtomicBool::new(false)),
            root: target.clone(),
            request: BuildRequest {
                workspace: next.clone(),
                main: "main.tex".into(),
                engine: "pdflatex".into(),
                preamble: None,
                solution: None,
                shell_escape: false,
                variants: Vec::new(),
            },
            owner: "secret".into(),
            shared: app.shared.clone(),
        });
        app.jobs
            .lock()
            .await
            .insert("cleanup-test".into(), job.clone());
        for workspace in [&id, &next] {
            let response = router
                .clone()
                .oneshot(request(
                    &format!("/api/v1/workspaces/{workspace}"),
                    "DELETE",
                    Some("http://localhost:38471"),
                    Some("secret"),
                ))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }
        assert!(!source.exists());
        assert!(job.cancel.load(Ordering::SeqCst));
        assert!(target.exists());
        job.result.lock().await.state = "cancelled".into();
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            while target.exists() {
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap();
        assert!(!target.exists());
    }
    #[tokio::test]
    async fn refuses_path_escape_upload_and_cross_session_access() {
        let temp = tempfile::tempdir().unwrap();
        let app = state(temp.path());
        let router = router(app.clone(), temp.path().into());
        let response = router
            .clone()
            .oneshot(request(
                "/api/v1/workspaces",
                "POST",
                Some("http://localhost:38471"),
                Some("secret"),
            ))
            .await
            .unwrap();
        let bytes = axum::body::to_bytes(response.into_body(), 10000)
            .await
            .unwrap();
        let id = serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let path = format!("/api/v1/workspaces/{id}/file?path=..%2Fsecret");
        let response = router
            .clone()
            .oneshot(request(
                &path,
                "PUT",
                Some("http://localhost:38471"),
                Some("secret"),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        app.sessions
            .lock()
            .await
            .insert("other".into(), std::time::Instant::now());
        let response = router
            .oneshot(request(
                &format!("/api/v1/workspaces/{id}"),
                "DELETE",
                Some("http://localhost:38471"),
                Some("other"),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
}
