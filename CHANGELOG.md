# Changelog

## 2026-10 — Import skills from GitHub

- **עברית:** ייבוא סקילים ממאגר GitHub ציבורי (למשל `anthropics/skills`), מתיקייה בתוכו או מקישור לקובץ SKILL.md. כל הסקילים שנמצאים מוצגים לבחירה, וייבוא חוזר מעדכן סקילים קיימים במקום לשכפל אותם.
- Skills tab → **Import from GitHub** (`lib/githubSkills.ts`, `components/modals/GithubSkillsImport.tsx`):
  - accepts `owner/repo`, repository/folder URLs and single `SKILL.md` links;
  - finds every `SKILL.md` with one GitHub API call (the repository tree) and reads files from raw.githubusercontent.com;
  - shows a selectable list with progress, read failures and rate-limit errors.
- Re-importing updates skills with the same name instead of duplicating them (`upsertSkills`).
- Imported skills keep their source folder, and their instructions say where the skill's other files are.
- The SKILL.md parser now handles CRLF line endings and multi-line (`>` / `|`) and quoted front-matter values.

## 2026-10 — Redesign, providers, local models, tools, MCP and monitoring

### סיכום בעברית

- **שדרוג טכנולוגי:** ‏Next.js 16, ‏React 19, ‏Mantine 9, ‏Tabler Icons 3, ‏zustand 5. העיצוב עבר מ־emotion ל־CSS modules, והאנימציות משתמשות ב־motion. ב־Docker הבסיס הוא Node 22.
- **עיצוב חדש:** משטחים שקופים, רקע צבעוני שזז לאט, אנימציות חלקות, מצב בהיר/כהה/לפי המערכת, ותמיכה מלאה במובייל.
- **עברית מימין לשמאל כברירת מחדל:** כל הצ'אט והממשק מיושרים לימין, קוד נשאר משמאל לימין, ופסקאות באנגלית בתוך עברית מוצגות נכון. אפשר לעבור לאנגלית.
- **ספקים חדשים:** ‏Groq, ‏OpenRouter ו־Google Gemini, לצד OpenAI, ‏xAI ו־Ollama. בורר מודלים אחד לכל הספקים, והמערכת זוכרת את המודל האחרון של כל ספק.
- **זיהוי חומרה ומודלים מקומיים:** אשף פתיחה מזהה מעבד, זיכרון וכרטיס מסך, ממליץ על מודלי Ollama שמתאימים למחשב ומוריד אותם עם סרגל התקדמות. Ollama שרץ במחשב מזוהה אוטומטית.
- **כלים:** המודל מפעיל כלים בכמה צעדים ברצף, וכל קריאה ותוצאה מוצגות בכרטיס. כלים מובנים: שעה, מחשבון, קריאת דף אינטרנט.
- **שרתי MCP:** שרתים מרוחקים (HTTP) מתחברים מהדפדפן, ושרתים מקומיים (stdio) רצים על השרת. יש הוספה מהירה וייבוא `mcp.json`.
- **סקילים:** חבילות הוראות שהמודל טוען כשמשימה מתאימה, עם ייבוא וייצוא של `SKILL.md` או JSON.
- **ניטור שגיאות:** יומן שגיאות באפליקציה עם ייצוא, error boundaries ו־Sentry אופציונלי.
- **תיקוני באגים:**
  - סדר ההודעות שנשלחו למודל התהפך כשלא הייתה הנחיית מערכת.
  - בחירת דמות הוצמדה לשיחה הקודמת.
  - מפתח OpenRouter שגוי התקבל כתקין.
  - שרתי MCP שמופעלים דרך npx נתקעו.

### Summary (English)

#### Stack
- Next.js 13 → 16 (Turbopack), React 18 → 19, Mantine 6 → 9, Tabler Icons 3, zustand 5, TypeScript 5.9, ESLint 9 flat config.
- Emotion (`createStyles`, `sx`) replaced by CSS modules with `postcss-preset-mantine`; animations with `motion`.
- Dockerfile uses Node 22 (Next 16 requires Node ≥ 20.9).

#### UI
- New design system (`lib/theme.ts`, `styles/globals.css`): glass surfaces, aurora background, Rubik + JetBrains Mono, light/dark/system.
- Hebrew right-to-left UI by default, English selectable (`uiLanguage`). Strings are written inline in both languages with `useT()` (`lib/i18n.ts`).
- Rebuilt components:
  - `components/layout/*`: app shell, sidebar, top bar.
  - `components/chat/*`: chat view, message bubbles, markdown, code blocks, composer, model picker, new-chat screen.
  - `components/modals/*`: providers, settings, tools/MCP/skills, local models, error log.
  - `components/Welcome.tsx`: setup wizard.

#### Providers
- `stores/Providers.ts` is a registry of OpenAI-compatible providers: OpenAI, xAI, Groq, OpenRouter, Gemini, Ollama.
- OpenRouter keys are validated against `/key`, because its `/models` endpoint is public.

#### Local models
- `pages/api/hardware.ts` reads CPU/RAM/GPU with `systeminformation`; `lib/localModels.ts` falls back to what the browser can see.
- `lib/localModels.ts` holds the catalog of Ollama models and their memory needs, plus the fit and recommendation logic.
- `stores/Ollama.ts` detects Ollama and pulls, lists and deletes models through its native API.

#### Tools, MCP, skills
- `stores/SubmitMessage.ts`: agent loop of up to 8 tool steps. When a model rejects tools, the request is retried without them.
- `stores/OpenAI.ts`:
  - streams tool-call deltas and reasoning (`reasoning_content`);
  - sends tool calls and results as assistant + `tool` messages;
  - stores tool calls and results on the assistant message.
- `stores/Tools.ts`: built-in tools (`get_current_time`, `calculator`, `fetch_url`), `load_skill`, and MCP tools.
- `stores/Mcp.ts` + `pages/api/mcp.ts`:
  - remote servers connect from the browser over Streamable HTTP, falling back to SSE;
  - local stdio servers are kept alive in the Next server.
- `stores/Skills.ts`: instruction packs listed in the system prompt and loaded on demand.

#### Monitoring
- `stores/ErrorLog.ts`: `captureError()` writes to a persisted log (exportable as JSON) and sends to Sentry when `NEXT_PUBLIC_SENTRY_DSN` is set.
- `components/ErrorBoundary.tsx` and global `error` / `unhandledrejection` handlers report into the same log.

#### Security
- `/api/mcp`, `/api/hardware` and `/api/fetch-url` only answer loopback requests, unless `YAKGPT_LOCAL_FEATURES=1` is set (see README).

#### Fixes
- `truncateMessages` reversed the message order when there was no system prompt.
- Choosing a persona attached it to the previous chat.
- Invalid OpenRouter keys passed validation.
- `npx`-launched MCP servers hung because the SDK's default environment drops PATH and proxy settings.

#### New environment variables
`NEXT_PUBLIC_GROQ_API_KEY`, `NEXT_PUBLIC_OPENROUTER_API_KEY`, `NEXT_PUBLIC_GEMINI_API_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `YAKGPT_LOCAL_FEATURES`.

#### Migration notes
- Existing chats and keys are kept (same `chat-store-v23` storage key).
- Users who already configured a provider skip the setup wizard.
- Run `yarn install` again: the dependency tree changed substantially.

## 2026-10 — xAI, Ollama and realtime Grok voice

- Chat through xAI (Grok) and Ollama via OpenAI-compatible endpoints; streaming moved to `fetch`.
- Realtime speech-to-speech conversations with Grok over xAI's realtime WebSocket API.
