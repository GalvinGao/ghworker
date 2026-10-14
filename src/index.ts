import { configFromVars, resolve } from "./resolve";

const HELP = `ghjump — set https://<this host>/?q=%s as your browser's search engine.

  org/repo          → github.com/org/repo
  org/repo/<path>   → github.com/org/repo/<path>
  org/repo#123      → github.com/org/repo/issues/123
  repo#123          → github.com/<DEFAULT_ORG>/repo/issues/123
  anything else     → FALLBACK search
`;

export default {
  fetch(request, env) {
    const q = new URL(request.url).searchParams.get("q")?.trim();
    if (!q) return new Response(HELP, { headers: { "content-type": "text/plain; charset=utf-8" } });
    return Response.redirect(resolve(q, configFromVars(env)), 302);
  },
} satisfies ExportedHandler<Env>;
