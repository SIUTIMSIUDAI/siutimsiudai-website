import * as fs from "fs";
import * as path from "path";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "@/constants/legal";

// The repo root doubles as the GitHub Pages site for siutimsiudai.app, so a legal document is just
// an HTML file at a path. That once tempted someone into keeping a second copy of each document
// under a nested folder; the copies drifted, and the stale Terms page shipped with its whole body
// inside an HTML comment. Apple treats an unreachable or wrong Privacy Policy / Terms as a
// rejection (Guidelines 5.1.1 and 3.1.2), so this asserts there is exactly one copy of each
// document and that every link in the app and on the site resolves to it.

const REPO_ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".expo",
  "android",
  "ios",
  "dist",
  "build",
]);

function htmlFilesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : htmlFilesUnder(full);
    }
    return entry.isFile() && entry.name.toLowerCase().endsWith(".html") ? [full] : [];
  });
}

// GitHub Pages resolves a bare directory URL to index.html inside it.
function servedFileFor(url: string): string {
  const slug = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
  return path.join(REPO_ROOT, slug, "index.html");
}

function documentTitleOf(file: string): string | null {
  const h1 = /<h1>([\s\S]*?)<\/h1>/.exec(fs.readFileSync(file, "utf8"));
  if (!h1) return null;
  const text = h1[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text.startsWith("Privacy Policy")) return "Privacy Policy";
  if (text.startsWith("Terms of Service")) return "Terms of Service";
  return null;
}

function repoPathsTitled(title: string): string[] {
  return htmlFilesUnder(REPO_ROOT)
    .filter((file) => documentTitleOf(file) === title)
    .map((file) => path.relative(REPO_ROOT, file))
    .sort();
}

describe("legal documents", () => {
  it("serves the Privacy Policy the app links to", () => {
    const served = servedFileFor(PRIVACY_POLICY_URL);
    expect(fs.existsSync(served)).toBe(true);
    expect(documentTitleOf(served)).toBe("Privacy Policy");
  });

  it("serves the Terms of Service the app links to", () => {
    const served = servedFileFor(TERMS_OF_SERVICE_URL);
    expect(fs.existsSync(served)).toBe(true);
    expect(documentTitleOf(served)).toBe("Terms of Service");
  });

  // The drift guard: a second copy can go stale without anyone noticing, so there must not be one.
  it("keeps exactly one copy of each document", () => {
    expect(repoPathsTitled("Privacy Policy")).toEqual(["privacy/index.html"]);
    expect(repoPathsTitled("Terms of Service")).toEqual(["terms/index.html"]);
  });

  it("links only to the canonical URLs from the public site pages", () => {
    const canonical = [PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL];
    for (const page of ["index.html", "404.html", "support/index.html"]) {
      const html = fs.readFileSync(path.join(REPO_ROOT, page), "utf8");
      const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
      const legal = hrefs.filter((href) => /privacy|terms/i.test(href));
      for (const href of legal) {
        expect(canonical).toContain(href);
      }
    }
  });
});
