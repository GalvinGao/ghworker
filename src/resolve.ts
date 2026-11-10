// Query → target URL resolution. Free of Worker APIs so it can be tested in plain Node.

export interface Config {
  /** Org used for bare `repo#123`. */
  defaultOrg: string;
  /** Lowercased org name or alias → org as used in GitHub URLs. Always contains `defaultOrg`. */
  orgs: Map<string, string>;
  /** Search URL used when nothing matches; `{q}` is replaced by the encoded query. */
  fallback: string;
  /** Lowercased short repo name → real repo name. Org-independent. */
  repoAliases: Map<string, string>;
}

export interface Vars {
  DEFAULT_ORG?: string;
  ORGS?: string;
  FALLBACK?: string;
  REPO_ALIASES?: string;
}

export const DEFAULT_FALLBACK = "https://www.google.com/search?q={q}";

const ISSUE = /^(?!0+$)\d{1,10}$/;
const REPO = /^(?!\.\.?$)[\w.-]+$/;
// [org/]repo[/path]
const TARGET = /^(?:([^/]+)\/)?([^/]+)(?:\/(.*))?$/;

let warnedAliases = false;

// REPO_ALIASES entries are `short=repo`, comma-separated. Bad entries are skipped (logged once).
function parseRepoAliases(raw: string | undefined): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const entry of (raw ?? "").split(",")) {
    if (!entry.trim()) continue;
    const [short, repo] = entry.split("=", 2).map((s) => s.trim());
    if (!short || !repo || !REPO.test(short) || !REPO.test(repo)) {
      if (!warnedAliases) {
        warnedAliases = true;
        console.warn("REPO_ALIASES: ignoring invalid entry (expected short=repo)");
      }
      continue;
    }
    aliases.set(short.toLowerCase(), repo);
  }
  return aliases;
}

export function configFromVars(vars: Vars): Config {
  const defaultOrg = vars.DEFAULT_ORG?.trim();
  if (!defaultOrg) throw new Error("DEFAULT_ORG is not set");
  const orgs = new Map([[defaultOrg.toLowerCase(), defaultOrg]]);
  // ORGS entries are `org` or `alias=org`; both the alias and the org itself are recognised.
  for (const entry of (vars.ORGS ?? "").split(",")) {
    const [alias, org = alias] = entry.split("=", 2).map((s) => s.trim());
    if (!alias || !org) continue;
    orgs.set(org.toLowerCase(), org);
    orgs.set(alias.toLowerCase(), org);
  }
  const fallback = vars.FALLBACK?.includes("{q}") ? vars.FALLBACK : DEFAULT_FALLBACK;
  return { defaultOrg, orgs, fallback, repoAliases: parseRepoAliases(vars.REPO_ALIASES) };
}

/** Returns the URL to redirect to for a search query. */
export function resolve(query: string, cfg: Config): string {
  const q = query.trim();
  const encoded = new URLSearchParams({ q }).toString().slice("q=".length);
  return github(q, cfg) ?? cfg.fallback.replace("{q}", () => encoded);
}

/**
 * Recognised forms:
 *   org/repo          → repo (org may be an alias from ORGS)
 *   org/repo/<path>   → repo subpage (pulls, actions, blob/main/x.ts#L1, …)
 *   org/repo#123      → issue/PR
 *   repo#123          → issue/PR in defaultOrg
 * A repo segment may be a short name from REPO_ALIASES (e.g. `re#5`, `org/re`).
 */
function github(q: string, cfg: Config): string | null {
  if (!q || /\s/.test(q)) return null;

  // Only a numeric suffix is an issue; other fragments (e.g. `#L10`) stay part of the path.
  const hash = q.lastIndexOf("#");
  const issue = hash >= 0 && ISSUE.test(q.slice(hash + 1)) ? q.slice(hash + 1) : null;
  const target = issue ? q.slice(0, hash) : q;

  const m = TARGET.exec(target);
  if (!m) return null;
  const [, orgInput, repoInput, path = ""] = m;
  const org = orgInput === undefined ? cfg.defaultOrg : cfg.orgs.get(orgInput.toLowerCase());
  if (!org || !REPO.test(repoInput)) return null;
  const repo = cfg.repoAliases.get(repoInput.toLowerCase()) ?? repoInput;

  const base = `https://github.com/${org}/${repo}`;
  if (issue) return path ? null : `${base}/issues/${issue}`;
  // A bare word without `#123` is far too ambiguous to hijack.
  if (orgInput === undefined) return null;
  return path ? `${base}/${path}` : base;
}
