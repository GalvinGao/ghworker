import { describe, expect, it } from "vitest";
import { configFromVars, resolve } from "./resolve";

const cfg = configFromVars({ DEFAULT_ORG: "acme", ORGS: "Rust-Lang, a = acme" });
const r = (q: string) => resolve(q, cfg);
const google = (q: string) => `https://www.google.com/search?q=${q}`;

describe("resolve", () => {
  it("jumps to repos", () => {
    expect(r("acme/widgets")).toBe("https://github.com/acme/widgets");
    expect(r("  ACME/widgets ")).toBe("https://github.com/acme/widgets");
    expect(r("rust-lang/rust")).toBe("https://github.com/Rust-Lang/rust");
    expect(r("acme/my.repo_2-x")).toBe("https://github.com/acme/my.repo_2-x");
  });

  it("expands org aliases", () => {
    expect(r("a/widgets")).toBe("https://github.com/acme/widgets");
    expect(r("A/widgets#5")).toBe("https://github.com/acme/widgets/issues/5");
    expect(r("a/widgets/actions")).toBe("https://github.com/acme/widgets/actions");
  });

  it("keeps repo subpaths", () => {
    expect(r("acme/widgets/pulls")).toBe("https://github.com/acme/widgets/pulls");
    expect(r("acme/widgets/")).toBe("https://github.com/acme/widgets");
    expect(r("acme/widgets/blob/main/src/lib.rs#L10")).toBe(
      "https://github.com/acme/widgets/blob/main/src/lib.rs#L10",
    );
  });

  it("jumps to issues", () => {
    expect(r("widgets#1234")).toBe("https://github.com/acme/widgets/issues/1234");
    expect(r("acme/widgets#7")).toBe("https://github.com/acme/widgets/issues/7");
    expect(r("rust-lang/rust#1")).toBe("https://github.com/Rust-Lang/rust/issues/1");
  });

  it("falls back to search", () => {
    expect(r("and/or")).toBe(google("and%2For"));
    expect(r("24/7")).toBe(google("24%2F7"));
    expect(r("km/h")).toBe(google("km%2Fh"));
    expect(r("C#")).toBe(google("C%23"));
    expect(r("widgets")).toBe(google("widgets"));
    expect(r("widgets#")).toBe(google("widgets%23"));
    expect(r("widgets#0")).toBe(google("widgets%230"));
    expect(r("widgets#abc")).toBe(google("widgets%23abc"));
    expect(r("#123")).toBe(google("%23123"));
    expect(r("acme/widgets how to")).toBe(google("acme%2Fwidgets+how+to"));
    expect(r("acme/../x")).toBe(google("acme%2F..%2Fx"));
    expect(r("acme/widgets/pull/1#2")).toBe(google("acme%2Fwidgets%2Fpull%2F1%232"));
    expect(r("other/widgets#1")).toBe(google("other%2Fwidgets%231"));
    expect(r("$&$'")).toBe(google("%24%26%24%27"));
    expect(r("你好")).toBe(google("%E4%BD%A0%E5%A5%BD"));
  });
});

describe("configFromVars", () => {
  it("requires DEFAULT_ORG", () => {
    expect(() => configFromVars({})).toThrow();
    expect(() => configFromVars({ DEFAULT_ORG: " " })).toThrow();
  });

  it("skips malformed ORGS entries", () => {
    const c = configFromVars({ DEFAULT_ORG: "acme", ORGS: " , =x, y=, Foo " });
    expect([...c.orgs]).toEqual([
      ["acme", "acme"],
      ["foo", "Foo"],
    ]);
  });

  it("applies defaults and custom fallback", () => {
    const c = configFromVars({ DEFAULT_ORG: "acme", FALLBACK: "https://duckduckgo.com/?q={q}" });
    expect([...c.orgs]).toEqual([["acme", "acme"]]);
    expect(resolve("hi there", c)).toBe("https://duckduckgo.com/?q=hi+there");
  });
});

describe("repo aliases", () => {
  const c = configFromVars({
    DEFAULT_ORG: "acme",
    ORGS: "a=acme",
    REPO_ALIASES: "Re=real-repo, dyn=long-config-name, bad, =x, y=, z=a/b",
  });
  const q = (x: string) => resolve(x, c);

  it("expands short repo names", () => {
    expect(q("re#12")).toBe("https://github.com/acme/real-repo/issues/12");
    expect(q("a/RE")).toBe("https://github.com/acme/real-repo");
    expect(q("acme/dyn/pulls")).toBe("https://github.com/acme/long-config-name/pulls");
  });

  it("leaves unknown names and bare aliases alone", () => {
    expect(q("widgets#1")).toBe("https://github.com/acme/widgets/issues/1");
    expect(q("re")).toBe("https://www.google.com/search?q=re");
  });

  it("tolerates unset or invalid REPO_ALIASES", () => {
    const none = configFromVars({ DEFAULT_ORG: "acme" });
    expect(none.repoAliases.size).toBe(0);
    expect([...c.repoAliases]).toEqual([
      ["re", "real-repo"],
      ["dyn", "long-config-name"],
    ]);
  });
});
