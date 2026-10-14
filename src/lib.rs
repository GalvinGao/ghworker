mod resolve;

use resolve::{Config, resolve};
use worker::*;

const HELP: &str = "\
ghjump — set https://<this host>/?q=%s as your browser's search engine.

  org/repo          → github.com/org/repo
  org/repo/<path>   → github.com/org/repo/<path>
  org/repo#123      → github.com/org/repo/issues/123
  repo#123          → github.com/<DEFAULT_ORG>/repo/issues/123
  anything else     → FALLBACK search
";

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let url = req.url()?;
    let q = url
        .query_pairs()
        .find(|(k, _)| k == "q")
        .map(|(_, v)| v.into_owned())
        .unwrap_or_default();
    if q.trim().is_empty() {
        return Response::ok(HELP);
    }

    let cfg =
        Config::from_vars(|k| env.var(k).ok().map(|v| v.to_string())).map_err(Error::RustError)?;
    Response::redirect(Url::parse(&resolve(&q, &cfg))?)
}
