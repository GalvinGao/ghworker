//! Query → target URL resolution. Free of worker types so it can be unit-tested natively.

pub struct Config {
    /// Org used for bare `repo#123`.
    pub default_org: String,
    /// Orgs recognised in `org/repo`. Always contains `default_org`.
    pub orgs: Vec<String>,
    /// Search URL used when nothing matches; `{q}` is replaced by the encoded query.
    pub fallback: String,
}

impl Config {
    pub const DEFAULT_FALLBACK: &str = "https://www.google.com/search?q={q}";

    /// Builds the config from string vars: `DEFAULT_ORG` (required), `ORGS` (comma-separated), `FALLBACK`.
    pub fn from_vars(var: impl Fn(&str) -> Option<String>) -> Result<Self, String> {
        let default_org = var("DEFAULT_ORG")
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .ok_or("DEFAULT_ORG is not set")?;
        let mut orgs: Vec<String> = var("ORGS")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .collect();
        if !orgs.iter().any(|o| o.eq_ignore_ascii_case(&default_org)) {
            orgs.push(default_org.clone());
        }
        let fallback = var("FALLBACK")
            .filter(|s| s.contains("{q}"))
            .unwrap_or_else(|| Self::DEFAULT_FALLBACK.to_owned());
        Ok(Self {
            default_org,
            orgs,
            fallback,
        })
    }
}

/// Returns the URL to redirect to for a search query.
pub fn resolve(q: &str, cfg: &Config) -> String {
    let q = q.trim();
    github(q, cfg).unwrap_or_else(|| {
        let encoded: String = url::form_urlencoded::byte_serialize(q.as_bytes()).collect();
        cfg.fallback.replace("{q}", &encoded)
    })
}

/// Recognised forms:
///   org/repo            → repo
///   org/repo/<path>     → repo subpage (pulls, actions, blob/main/x.rs#L1, …)
///   org/repo#123        → issue/PR
///   repo#123            → issue/PR in default_org
fn github(q: &str, cfg: &Config) -> Option<String> {
    if q.is_empty() || q.contains(char::is_whitespace) {
        return None;
    }

    // Only a numeric suffix is an issue; other fragments (e.g. `#L10`) stay part of the path.
    let (target, issue) = match q.rsplit_once('#') {
        Some((t, n)) if is_issue(n) => (t, Some(n)),
        _ => (q, None),
    };

    let (org, rest) = match target.split_once('/') {
        Some((org, rest)) => {
            let org = cfg.orgs.iter().find(|o| o.eq_ignore_ascii_case(org))?;
            (org, rest)
        }
        None => (&cfg.default_org, target),
    };
    let (repo, path) = match rest.split_once('/') {
        Some((repo, path)) => (repo, path),
        None => (rest, ""),
    };
    if !is_repo(repo) {
        return None;
    }

    let base = format!("https://github.com/{org}/{repo}");
    match (issue, path, target.contains('/')) {
        (Some(n), "", _) => Some(format!("{base}/issues/{n}")),
        (Some(_), _, _) => None,
        // A bare word without `#123` is far too ambiguous to hijack.
        (None, _, false) => None,
        (None, "", true) => Some(base),
        (None, path, true) => Some(format!("{base}/{path}")),
    }
}

fn is_repo(s: &str) -> bool {
    !s.is_empty()
        && s != "."
        && s != ".."
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn is_issue(s: &str) -> bool {
    s.len() <= 10 && s.bytes().all(|b| b.is_ascii_digit()) && s.bytes().any(|b| b != b'0')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> Config {
        Config::from_vars(|k| match k {
            "DEFAULT_ORG" => Some("acme".into()),
            "ORGS" => Some("Rust-Lang, acme".into()),
            _ => None,
        })
        .unwrap()
    }

    fn r(q: &str) -> String {
        resolve(q, &cfg())
    }

    #[test]
    fn repo() {
        assert_eq!(r("acme/widgets"), "https://github.com/acme/widgets");
        assert_eq!(r("  ACME/widgets "), "https://github.com/acme/widgets");
        assert_eq!(r("rust-lang/rust"), "https://github.com/Rust-Lang/rust");
        assert_eq!(r("acme/my.repo_2-x"), "https://github.com/acme/my.repo_2-x");
    }

    #[test]
    fn repo_path() {
        assert_eq!(
            r("acme/widgets/pulls"),
            "https://github.com/acme/widgets/pulls"
        );
        assert_eq!(r("acme/widgets/"), "https://github.com/acme/widgets");
        assert_eq!(
            r("acme/widgets/blob/main/src/lib.rs#L10"),
            "https://github.com/acme/widgets/blob/main/src/lib.rs#L10"
        );
    }

    #[test]
    fn issue() {
        assert_eq!(
            r("widgets#1234"),
            "https://github.com/acme/widgets/issues/1234"
        );
        assert_eq!(
            r("acme/widgets#7"),
            "https://github.com/acme/widgets/issues/7"
        );
        assert_eq!(
            r("rust-lang/rust#1"),
            "https://github.com/Rust-Lang/rust/issues/1"
        );
    }

    #[test]
    fn falls_back() {
        let g = |q: &str| format!("https://www.google.com/search?q={q}");
        assert_eq!(r("and/or"), g("and%2For"));
        assert_eq!(r("24/7"), g("24%2F7"));
        assert_eq!(r("km/h"), g("km%2Fh"));
        assert_eq!(r("C#"), g("C%23"));
        assert_eq!(r("widgets"), g("widgets"));
        assert_eq!(r("widgets#"), g("widgets%23"));
        assert_eq!(r("widgets#0"), g("widgets%230"));
        assert_eq!(r("widgets#abc"), g("widgets%23abc"));
        assert_eq!(r("#123"), g("%23123"));
        assert_eq!(r("acme/widgets how to"), g("acme%2Fwidgets+how+to"));
        assert_eq!(r("acme/../x"), g("acme%2F..%2Fx"));
        assert_eq!(
            r("acme/widgets/pull/1#2"),
            g("acme%2Fwidgets%2Fpull%2F1%232")
        );
        assert_eq!(r("other/widgets#1"), g("other%2Fwidgets%231"));
        assert_eq!(r("你好"), g("%E4%BD%A0%E5%A5%BD"));
    }

    #[test]
    fn config() {
        assert!(Config::from_vars(|_| None).is_err());
        let c = Config::from_vars(|k| match k {
            "DEFAULT_ORG" => Some("acme".into()),
            "FALLBACK" => Some("https://duckduckgo.com/?q={q}".into()),
            _ => None,
        })
        .unwrap();
        assert_eq!(c.orgs, ["acme"]);
        assert_eq!(
            resolve("hi there", &c),
            "https://duckduckgo.com/?q=hi+there"
        );
    }
}
