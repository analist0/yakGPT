// Skills are instruction packs: the model sees each skill's name and
// description, and loads the full instructions with the load_skill tool when a
// task matches.
import { v4 as uuidv4 } from "uuid";
import { useChatStore } from "./ChatStore";

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
}

const get = useChatStore.getState;
const set = useChatStore.setState;

export const EXAMPLE_SKILLS: Omit<Skill, "id">[] = [
  {
    name: "code-review",
    description:
      "Review code for bugs, security issues and readability. Use when the user shares code and asks for a review or feedback.",
    instructions: `When reviewing code:
1. Start with a one-line verdict.
2. List concrete bugs first, each with the line, the failure scenario and a fix.
3. Then security issues, then readability.
4. Show fixes as minimal code blocks, not full rewrites.
5. Do not invent problems; say so when the code looks fine.`,
    enabled: true,
  },
  {
    name: "hebrew-writing",
    description:
      "Write or edit polished Hebrew text (emails, posts, documents). Use when the user asks to write or improve Hebrew text.",
    instructions: `Write in clear, modern Hebrew.
- Prefer short sentences and active voice.
- Keep professional terms in English only when there is no common Hebrew term.
- Keep the user's tone (formal or casual).
- When editing, return the improved text first, then a short list of the main changes.`,
    enabled: true,
  },
  {
    name: "summarize",
    description:
      "Summarize long text, articles or web pages. Use when the user asks for a summary or TL;DR.",
    instructions: `Summaries:
- Start with a 1-2 sentence TL;DR.
- Then 3-7 bullet points with the key facts, numbers and decisions.
- End with open questions or action items if there are any.
- If a URL is given and the fetch_url tool is available, fetch it first.`,
    enabled: true,
  },
];

const validName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "skill";

export const saveSkill = (skill: Omit<Skill, "id"> & { id?: string }) => {
  const normalized = { ...skill, name: validName(skill.name) };
  set((state) => {
    if (skill.id && state.skills.some((s) => s.id === skill.id)) {
      return {
        skills: state.skills.map((s) =>
          s.id === skill.id ? { ...s, ...normalized, id: s.id } : s
        ),
      };
    }
    return { skills: [...state.skills, { ...normalized, id: uuidv4() }] };
  });
};

export const deleteSkill = (id: string) =>
  set((state) => ({ skills: state.skills.filter((s) => s.id !== id) }));

export const toggleSkill = (id: string) =>
  set((state) => ({
    skills: state.skills.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    ),
  }));

export const addExampleSkills = () => {
  const existing = new Set(get().skills.map((s) => s.name));
  EXAMPLE_SKILLS.filter((s) => !existing.has(s.name)).forEach(saveSkill);
};

export const enabledSkills = () => get().skills.filter((s) => s.enabled);

export const findSkill = (name: string) =>
  enabledSkills().find((s) => s.name === validName(name));

// System prompt section listing the available skills
export const skillsPrompt = () => {
  const skills = enabledSkills();
  if (skills.length === 0) return undefined;
  return [
    "You have skills: instruction packs for specific tasks.",
    "When a task matches a skill, call the load_skill tool with its name before answering, then follow the loaded instructions.",
    "Available skills:",
    ...skills.map((s) => `- ${s.name}: ${s.description}`),
  ].join("\n");
};

// SKILL.md: YAML-like front matter with name and description, then the body
export const parseSkillMarkdown = (text: string): Omit<Skill, "id"> => {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) throw new Error("Missing front matter (--- name / description ---)");
  const meta: Record<string, string> = {};
  match[1].split("\n").forEach((line) => {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) {
      meta[key.trim()] = rest.join(":").trim().replace(/^["']|["']$/g, "");
    }
  });
  if (!meta.name || !meta.description) {
    throw new Error("Front matter needs name and description");
  }
  return {
    name: meta.name,
    description: meta.description,
    instructions: match[2].trim(),
    enabled: true,
  };
};

export const skillToMarkdown = (skill: Skill) =>
  `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.instructions}\n`;

export const importSkills = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed);
    const list = Array.isArray(data) ? data : [data];
    list.forEach((s) => {
      if (!s.name || !s.instructions) throw new Error("Invalid skill JSON");
      saveSkill({
        name: s.name,
        description: s.description || "",
        instructions: s.instructions,
        enabled: s.enabled !== false,
      });
    });
    return list.length;
  }
  saveSkill(parseSkillMarkdown(trimmed));
  return 1;
};

export const exportSkills = () => {
  const blob = new Blob([JSON.stringify(get().skills, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "yakgpt-skills.json";
  a.click();
  URL.revokeObjectURL(url);
};
