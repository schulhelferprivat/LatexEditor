use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Variant {
    pub id: String,
    pub name: String,
    pub suffix: String,
    pub defines: BTreeMap<String, serde_json::Value>,
    #[serde(default)]
    pub solution: Option<bool>,
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BuildRequest {
    #[serde(default)]
    pub preamble: Option<String>,
    #[serde(default)]
    pub solution: Option<bool>,
    #[serde(default, rename = "shellEscape")]
    pub shell_escape: bool,
    pub workspace: String,
    pub main: String,
    pub engine: String,
    pub variants: Vec<Variant>,
}
#[derive(Clone, Serialize)]
pub struct Diagnostic {
    pub severity: String,
    pub message: String,
    pub file: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
}
#[derive(Clone, Serialize)]
pub struct VariantResult {
    pub variant: String,
    pub ok: bool,
    pub artifact: Option<String>,
    pub diagnostics: Vec<Diagnostic>,
    pub log: String,
}
#[derive(Clone, Serialize)]
pub struct BuildResult {
    pub id: String,
    pub state: String,
    pub progress: String,
    pub results: Vec<VariantResult>,
}
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SyncLocation {
    pub file: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub page: Option<u32>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
}
