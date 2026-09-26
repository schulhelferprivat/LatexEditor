use crate::model::BuildRequest;
use std::path::{Component, Path};

pub fn reject_link(path: &Path) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("Symlinks sind nicht erlaubt".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err("Reparse-Points sind nicht erlaubt".into());
        }
    }
    Ok(())
}
pub fn checked_file(root: &Path, relative: &str) -> Result<std::path::PathBuf, String> {
    relative_path(relative)?;
    reject_link(root)?;
    let mut path = root.to_path_buf();
    for component in Path::new(relative).components() {
        path.push(component);
        reject_link(&path)?;
    }
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(root.canonicalize().map_err(|e| e.to_string())?) {
        return Err("Datei außerhalb des Arbeitsbereichs".into());
    }
    Ok(canonical)
}
pub fn relative_path(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 512
        || value.contains('\\')
        || value.contains(':')
        || value.chars().any(|c| c.is_control())
    {
        return Err("Ungültiger relativer Pfad".into());
    }
    for part in value.split('/') {
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.ends_with('.')
            || part.ends_with(' ')
            || part.starts_with('.')
            || part.chars().any(|c| "<>\"|?*".contains(c))
        {
            return Err("Ungültiger Pfadbestandteil".into());
        }
        let base = part.split('.').next().unwrap_or("").to_uppercase();
        if [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ]
        .contains(&base.as_str())
        {
            return Err("Reservierter Dateiname".into());
        }
    }
    if Path::new(value)
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("Pfadausbruch verhindert".into());
    }
    Ok(())
}
pub fn validate(request: &BuildRequest) -> Result<(), String> {
    relative_path(&request.main)?;
    if request.main.contains('/')
        || !request.main.to_lowercase().ends_with(".tex")
        || !request
            .main
            .chars()
            .all(|c| c.is_alphanumeric() || " ._-".contains(c))
    {
        return Err("Die Hauptdatei muss eine .tex-Datei im Dokumentordner sein; erlaubt sind Buchstaben, Zahlen, Leerzeichen, Punkt, _ und -.".into());
    }
    if !["lualatex", "pdflatex", "xelatex"].contains(&request.engine.as_str())
        || request.variants.is_empty()
        || request.variants.len() > 20
    {
        return Err("Ungültige Engine oder Variantenauswahl".into());
    }
    if request
        .preamble
        .as_ref()
        .is_some_and(|text| text.trim().is_empty())
    {
        return Err("Bitte eine Präambel einschließlich \\documentclass einfügen.".into());
    }
    if (request.solution.is_some()
        || request
            .variants
            .iter()
            .any(|variant| variant.solution.is_some()))
        && request.preamble.is_none()
    {
        return Err("Lösung erfordert eine gemeinsame Präambel.".into());
    }
    let mut ids = std::collections::HashSet::new();
    let mut suffixes = std::collections::HashSet::new();
    for variant in &request.variants {
        if variant.id.is_empty()
            || variant.id.len() > 64
            || !variant
                .id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
            || !ids.insert(&variant.id)
        {
            return Err("Ungültige Varianten-ID".into());
        }
        if variant.name.trim().is_empty()
            || variant.name.len() > 320
            || variant.suffix.is_empty()
            || variant.suffix.len() > 48
            || !variant
                .suffix
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "_-".contains(c))
            || !suffixes.insert(variant.suffix.to_lowercase())
        {
            return Err("Ungültiger Variantenname oder Suffix".into());
        }
        if variant.defines.len() > 50 {
            return Err("Zu viele Defines".into());
        }
        for (key, value) in &variant.defines {
            if key.is_empty() || key.len() > 48 || !key.chars().all(|c| c.is_ascii_alphabetic()) {
                return Err("Define-Namen dürfen nur ASCII-Buchstaben enthalten".into());
            }
            if !value.is_boolean()
                && !value
                    .as_str()
                    .is_some_and(|s| s.len() <= 4000 && !s.chars().any(|c| c.is_control()))
            {
                return Err("Defines müssen boolesch oder literaler Text sein".into());
            }
        }
    }
    Ok(())
}
pub fn has_document_environment(source: &str) -> bool {
    let mut code = String::new();
    for line in source.lines() {
        let mut escaped = false;
        for character in line.chars() {
            if character == '%' && !escaped {
                break;
            }
            code.push(character);
            escaped = character == '\\' && !escaped;
        }
        code.push('\n');
    }
    regex::Regex::new(r"\\begin\s*\{\s*document\s*\}")
        .unwrap()
        .is_match(&code)
}
pub fn wrapper(
    request: &BuildRequest,
    variant: &crate::model::Variant,
    preamble_name: Option<&str>,
    wraps_document: bool,
    precompiled: bool,
) -> String {
    let mut text = String::new();
    if precompiled {
        text.push_str("\\endofdump\n");
    }
    for (name, value) in &variant.defines {
        if let Some(flag) = value.as_bool() {
            text.push_str(&format!("\\ifcsname if{name}\\endcsname\\errmessage{{Define already exists: {name}}}\\fi\n\\expandafter\\newif\\csname if{name}\\endcsname\n\\csname {name}{}\\endcsname\n", if flag {"true"} else {"false"}));
        } else if let Some(value) = value.as_str() {
            let escaped: String = value
                .chars()
                .map(|c| match c {
                    '\\' => "\\textbackslash{}".into(),
                    '{' => "\\{".into(),
                    '}' => "\\}".into(),
                    '%' => "\\%".into(),
                    '$' => "\\$".into(),
                    '#' => "\\#".into(),
                    '&' => "\\&".into(),
                    '_' => "\\_".into(),
                    '^' => "\\textasciicircum{}".into(),
                    '~' => "\\textasciitilde{}".into(),
                    _ => c.to_string(),
                })
                .collect();
            text.push_str(&format!("\\ifcsname {name}\\endcsname\\errmessage{{Define already exists: {name}}}\\fi\n\\expandafter\\def\\csname {name}\\endcsname{{{escaped}}}\n"));
        }
    }
    if let Some(name) = preamble_name {
        if !precompiled {
            text.push_str(&format!("\\input{{{name}}}\n"));
        }
        if let Some(solution) = request.solution.or(variant.solution) {
            text.push_str(&format!(
                "\\setboolean{{loesung}}{{{}}}\n",
                if solution { "true" } else { "false" }
            ));
        }
        if wraps_document {
            text.push_str("\\begin{document}\n");
        }
    }
    text.push_str(&format!("\\input{{\\detokenize{{{}}}}}\n", request.main));
    if preamble_name.is_some() && wraps_document {
        text.push_str("\\end{document}\n");
    }
    text
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shell_escape_request_is_explicit_and_defaults_off() {
        let request = serde_json::json!({"workspace":"x","main":"body.tex","engine":"pdflatex","variants":[{"id":"a","name":"A","suffix":"a","defines":{}}]});
        let disabled: BuildRequest = serde_json::from_value(request.clone()).unwrap();
        assert!(!disabled.shell_escape);
        let enabled: BuildRequest = serde_json::from_value(serde_json::json!({"shellEscape":true,"workspace":"x","main":"body.tex","engine":"pdflatex","variants":[{"id":"a","name":"A","suffix":"a","defines":{}}]})).unwrap();
        assert!(enabled.shell_escape);
        let mut invalid = request;
        invalid["shellEscape"] = serde_json::json!("true");
        assert!(serde_json::from_value::<BuildRequest>(invalid).is_err());
    }
    #[test]
    fn detects_document_environment_without_commented_commands() {
        assert!(!has_document_environment("% \\begin{document}\nText"));
        assert!(has_document_environment(
            "\\newcommand{\\name}{Test}\n\\begin { document }\nText\n\\end{document}"
        ));
        assert!(!has_document_environment("Text only"));
    }
    #[test]
    fn preamble_wrapper_preserves_main_file_and_optional_document_environment() {
        let request: BuildRequest = serde_json::from_value(serde_json::json!({"workspace":"x","main":"body.tex","engine":"pdflatex","preamble":"\\documentclass{article}","variants":[{"id":"a","name":"A","suffix":"a","defines":{"Solutions":true}}]})).unwrap();
        let automatic = wrapper(
            &request,
            &request.variants[0],
            Some("preamble.tex"),
            true,
            false,
        );
        assert!(automatic.ends_with("\\input{preamble.tex}\n\\begin{document}\n\\input{\\detokenize{body.tex}}\n\\end{document}\n"));
        assert!(automatic.find("Solutionstrue").unwrap() < automatic.find("preamble.tex").unwrap());
        let explicit = wrapper(
            &request,
            &request.variants[0],
            Some("preamble.tex"),
            false,
            false,
        );
        assert!(explicit.ends_with("\\input{preamble.tex}\n\\input{\\detokenize{body.tex}}\n"));
        assert!(!explicit.contains("\\begin{document}"));
    }
    #[test]
    fn precompiled_wrapper_starts_after_dump_without_reading_preamble() {
        let request: BuildRequest = serde_json::from_value(serde_json::json!({"workspace":"x","main":"body.tex","engine":"pdflatex","preamble":"\\documentclass{article}","variants":[{"id":"loesung","name":"Lösung","suffix":"loesung","defines":{},"solution":true}]})).unwrap();
        assert_eq!(
            wrapper(&request, &request.variants[0], Some("preamble.tex"), true, true),
            "\\endofdump\n\\setboolean{loesung}{true}\n\\begin{document}\n\\input{\\detokenize{body.tex}}\n\\end{document}\n"
        );
        assert_eq!(
            wrapper(
                &request,
                &request.variants[0],
                Some("preamble.tex"),
                false,
                true
            ),
            "\\endofdump\n\\setboolean{loesung}{true}\n\\input{\\detokenize{body.tex}}\n"
        );
    }
    #[test]
    fn solution_switch_follows_preamble_for_both_document_forms() {
        let mut request: BuildRequest = serde_json::from_value(serde_json::json!({"workspace":"x","main":"body.tex","engine":"pdflatex","preamble":"\\documentclass{article}","solution":true,"variants":[{"id":"a","name":"A","suffix":"a","defines":{}}]})).unwrap();
        for wraps_document in [true, false] {
            for (enabled, value) in [(true, "true"), (false, "false")] {
                request.solution = Some(enabled);
                let result = wrapper(
                    &request,
                    &request.variants[0],
                    Some("preamble.tex"),
                    wraps_document,
                    false,
                );
                let command = format!("\\setboolean{{loesung}}{{{value}}}\n");
                assert!(result.contains(&format!("\\input{{preamble.tex}}\n{command}")));
                assert!(
                    result.find(&command).unwrap()
                        < result.find("\\input{\\detokenize{body.tex}}").unwrap()
                );
                if wraps_document {
                    assert!(
                        result.find(&command).unwrap() < result.find("\\begin{document}").unwrap()
                    );
                }
            }
        }
        request.solution = None;
        assert!(!wrapper(
            &request,
            &request.variants[0],
            Some("preamble.tex"),
            true,
            false
        )
        .contains("\\setboolean"));
    }
    #[test]
    fn solution_switch_requires_shared_preamble() {
        let request: BuildRequest = serde_json::from_value(serde_json::json!({"workspace":"x","main":"body.tex","engine":"pdflatex","solution":false,"variants":[{"id":"a","name":"A","suffix":"a","defines":{}}]})).unwrap();
        assert!(validate(&request).is_err());
    }
    #[test]
    fn fixed_variants_set_opposite_solution_values_after_preamble() {
        let mut request: BuildRequest = serde_json::from_value(serde_json::json!({"workspace":"x","main":"body.tex","engine":"pdflatex","preamble":"\\documentclass{article}","variants":[{"id":"arbeitsblatt","name":"Arbeitsblatt","suffix":"arbeitsblatt","defines":{},"solution":false},{"id":"loesung","name":"Lösung","suffix":"loesung","defines":{},"solution":true}]})).unwrap();
        assert!(wrapper(
            &request,
            &request.variants[0],
            Some("preamble.tex"),
            true,
            false
        )
        .contains("\\input{preamble.tex}\n\\setboolean{loesung}{false}\n"));
        assert!(wrapper(
            &request,
            &request.variants[1],
            Some("preamble.tex"),
            true,
            false
        )
        .contains("\\input{preamble.tex}\n\\setboolean{loesung}{true}\n"));
        request.solution = Some(true);
        assert!(wrapper(
            &request,
            &request.variants[0],
            Some("preamble.tex"),
            true,
            false
        )
        .contains("\\setboolean{loesung}{true}\n"));
        request.preamble = None;
        assert!(validate(&request).is_err());
    }
    #[test]
    fn blocks_cross_platform_path_escapes() {
        for path in [
            "../x", "/tmp/x", "a/../x", "C:/x", "a\\x", "a//x", "NUL.tex", "x/COM1", "x.",
            ".hidden", "a:stream",
        ] {
            assert!(relative_path(path).is_err(), "{path}");
        }
        for path in ["main.tex", "Bilder/Große Grafik.png", "chapter_1.bib"] {
            assert!(relative_path(path).is_ok());
        }
    }
    #[test]
    fn wrapper_encodes_literals_and_never_embeds_source() {
        let r:BuildRequest=serde_json::from_value(serde_json::json!({"workspace":"x","main":"Meine Datei.tex","engine":"lualatex","variants":[{"id":"a","name":"A","suffix":"a","defines":{"Solutions":true,"Title":"x%\\input{secret}"}}]})).unwrap();
        validate(&r).unwrap();
        let result = wrapper(&r, &r.variants[0], None, false, false);
        assert!(result.contains("\\csname Solutionstrue\\endcsname"));
        assert!(result.contains("x\\%\\textbackslash{}input\\{secret\\}"));
        assert!(result.ends_with("\\input{\\detokenize{Meine Datei.tex}}\n"));
    }
}
