// Finds SKILL.md files in a public GitHub repository and loads them as skills.
// Uses one GitHub API call (the repository tree) and fetches files from
// raw.githubusercontent.com, which is not rate limited the same way.
import { parseSkillMarkdown, Skill } from "@/stores/Skills";

export interface GithubSource {
  owner: string;
  repo: string;
  ref: string;
  path: string;
}

export interface FoundSkill {
  path: string;
  folderUrl: string;
  skill?: Omit<Skill, "id">;
  error?: string;
}

const MAX_SKILLS = 200;
const CONCURRENCY = 6;

// Accepts "owner/repo", repo URLs, and /tree/<ref>/<path> or /blob/<ref>/<path> URLs
export const parseGithubSource = (input: string): GithubSource => {
  const text = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const short = text.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (short) return { owner: short[1], repo: short[2], ref: "HEAD", path: "" };

  let url: URL;
  try {
    url = new URL(text.includes("://") ? text : `https://${text}`);
  } catch {
    throw new Error("Enter a GitHub repository, e.g. anthropics/skills");
  }
  if (!/(^|\.)github\.com$/.test(url.hostname)) {
    throw new Error("Only github.com repositories are supported");
  }
  const [owner, repo, kind, ref, ...rest] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo) throw new Error("Enter a GitHub repository, e.g. anthropics/skills");
  if ((kind === "tree" || kind === "blob") && ref) {
    return { owner, repo, ref, path: decodeURIComponent(rest.join("/")) };
  }
  return { owner, repo, ref: "HEAD", path: "" };
};

const isSkillFile = (path: string) => /(^|\/)SKILL\.md$/i.test(path);

const folderOf = (path: string) => path.replace(/\/?SKILL\.md$/i, "");

const rawUrl = (src: GithubSource, path: string) =>
  `https://raw.githubusercontent.com/${src.owner}/${src.repo}/${encodeURIComponent(src.ref)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

const listSkillPaths = async (src: GithubSource): Promise<string[]> => {
  // A link straight to one SKILL.md
  if (isSkillFile(src.path)) return [src.path];

  const res = await fetch(
    `https://api.github.com/repos/${src.owner}/${src.repo}/git/trees/${encodeURIComponent(src.ref)}?recursive=1`,
    { headers: { Accept: "application/vnd.github+json" } }
  );
  if (res.status === 404) {
    throw new Error(`Repository ${src.owner}/${src.repo} not found or not public`);
  }
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
    const when = reset ? ` Try again after ${new Date(reset).toLocaleTimeString()}.` : "";
    throw new Error(`GitHub rate limit reached.${when}`);
  }
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);

  const data = await res.json();
  const prefix = src.path ? `${src.path}/` : "";
  return (data.tree as { path: string; type: string }[])
    .filter((item) => item.type === "blob" && isSkillFile(item.path))
    .map((item) => item.path)
    .filter((path) => !prefix || path.startsWith(prefix))
    .sort();
};

const loadSkill = async (src: GithubSource, path: string): Promise<FoundSkill> => {
  const folder = folderOf(path);
  const folderUrl = `https://github.com/${src.owner}/${src.repo}/tree/${src.ref}/${folder}`.replace(/\/$/, "");
  try {
    const res = await fetch(rawUrl(src, path));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const skill = parseSkillMarkdown(await res.text());
    // Skills can ship extra files next to SKILL.md; tell the model where they are
    const filesBase = rawUrl(src, folder ? `${folder}/` : "");
    skill.instructions += `\n\n---\nSource: ${folderUrl}\nOther files this skill mentions can be read with fetch_url from ${filesBase}<relative path>`;
    return { path, folderUrl, skill: { ...skill, source: folderUrl } };
  } catch (error) {
    return { path, folderUrl, error: (error as Error).message };
  }
};

export const findGithubSkills = async (
  input: string,
  onProgress?: (done: number, total: number) => void
) => {
  const src = parseGithubSource(input);
  const paths = await listSkillPaths(src);
  if (paths.length === 0) {
    throw new Error("No SKILL.md files found in this repository or folder");
  }
  const limited = paths.slice(0, MAX_SKILLS);
  const results: FoundSkill[] = new Array(limited.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, limited.length) }, async () => {
      while (next < limited.length) {
        const index = next++;
        results[index] = await loadSkill(src, limited[index]);
        onProgress?.(++done, limited.length);
      }
    })
  );
  return { source: src, skills: results, truncated: paths.length > MAX_SKILLS };
};
