// Query → target URL resolution. Free of Worker APIs so it can be tested in plain Node.

export interface Config {
  /** Org used for bare `repo#123`. */
  defaultOrg: string;
  /** Orgs recognised in `org/repo`. Always contains `defaultOrg`. */
  orgs: string[];
  /** Search URL used when nothing matches; `{q}` is replaced by the encoded query. */
  fallback: string;
}

export interface Vars {
  DEFAULT_ORG?: string;
  ORGS?: string;
  FALLBACK?: string;
}

export const DEFAULT_FALLBACK = "https://www.google.com/search?q={q}";

const ISSUE = /^(?!0+$)\d{1,10}$/;
const REPO = /^(?!\.\.?$)[\w.-]+$/;
// [org/]repo[/path]
const TARGET = /^(?:([^/]+)\/)?([^/]+)(?:\/(.*))?$/;

export function configFromVars(vars: Vars): Config {
  const defaultOrg = vars.DEFAULT_ORG?.trim();
  if (!defaultOrg) throw new Error("DEFAULT_ORG is not set");
  const orgs = (vars.ORGS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!orgs.some((o) => sameOrg(o, defaultOrg))) orgs.push(defaultOrg);
  const fallback = vars.FALLBACK?.includes("{q}") ? vars.FALLBACK : DEFAULT_FALLBACK;
  return { defaultOrg, orgs, fallback };
}

/** Returns the URL to redirect to for a search query. */
export function resolve(query: string, cfg: Config): string {
  const q = query.trim();
  const encoded = new URLSearchParams({ q }).toString().slice("q=".length);
  return github(q, cfg) ?? cfg.fallback.replace("{q}", () => encoded);
}

/**
 * Recognised forms:
 *   org/repo          → repo
 *   org/repo/<path>   → repo subpage (pulls, actions, blob/main/x.ts#L1, …)
 *   org/repo#123      → issue/PR
 *   repo#123          → issue/PR in defaultOrg
 */
function github(q: string, cfg: Config): string | null {
  if (!q || /\s/.test(q)) return null;

  // Only a numeric suffix is an issue; other fragments (e.g. `#L10`) stay part of the path.
  const hash = q.lastIndexOf("#");
  const issue = hash >= 0 && ISSUE.test(q.slice(hash + 1)) ? q.slice(hash + 1) : null;
  const target = issue ? q.slice(0, hash) : q;

  const m = TARGET.exec(target);
  if (!m) return null;
  const [, orgInput, repo, path = ""] = m;
  const org = orgInput === undefined ? cfg.defaultOrg : cfg.orgs.find((o) => sameOrg(o, orgInput));
  if (!org || !REPO.test(repo)) return null;

  const base = `https://github.com/${org}/${repo}`;
  if (issue) return path ? null : `${base}/issues/${issue}`;
  // A bare word without `#123` is far too ambiguous to hijack.
  if (orgInput === undefined) return null;
  return path ? `${base}/${path}` : base;
}

function sameOrg(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
