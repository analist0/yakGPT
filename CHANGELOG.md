# Changelog

## 2026-10 — Images and vision

- **עברית:** אפשר לצרף תמונות להודעה, מכפתור, בהדבקה או בגרירה, ולשאול עליהן מודלים שתומכים בתמונות. התמונות מוקטנות, נשמרות בדפדפן ב־IndexedDB ומוצגות בצ'אט. לחיצה על תמונה פותחת אותה בגודל מלא.
- `lib/images.ts`:
  - scales images to at most 1568 px and re-encodes them as JPEG;
  - stores them in IndexedDB (`yakgpt-images`);
  - deletes unused images older than a day on startup.
- `Message.images` holds image ids. `toApiMessages` sends user messages with images as OpenAI `text` + `image_url` content parts. `truncateMessages` counts about 1000 tokens per image.
- Composer:
  - attach button, paste and drag-and-drop;
  - thumbnails with remove buttons;
  - image-only messages;
  - editing a message brings its images back.
- Images show in the user bubble and open full size on click.
- A 4xx error that mentions images suggests switching to a vision model.

## 2026-10 — Tools in realtime voice

- **עברית:** בשיחה הקולית עם Grok אפשר עכשיו להשתמש באותם כלים כמו בצ'אט: הכלים המובנים, שרתי MCP וסקילים. כל קריאה לכלי מוצגת בצ'אט ככרטיס, והמודל עונה בקול עם התוצאה.
- `stores/XaiRealtime.ts`:
  - sends the active tools in `session.update` (`tools`) and adds the skills list and a short tool hint to the instructions;
  - runs `response.function_call_arguments.done` calls through `runTool` and returns `function_call_output` items;
  - sends a single `response.create` once the response is done and all of its calls have outputs, and none after an interrupted (cancelled) response;
  - falls back to `function_call` items in `response.done`, deduplicated by `call_id`;
  - stores calls and results as `toolCalls` on the assistant message, so they render like text-chat tool calls.

## 2026-10 — Linux, Windows and Termux installers

- **עברית:**
  - **סקריפטים להתקנה:** בלינוקס/macOS ‏(`scripts/install.sh`), ב־Windows ‏(`scripts/install.ps1`) ובאנדרואיד דרך Termux (אותו `install.sh`). הם בודקים או מתקינים Node.js, מתקינים ובונים, ויוצרים פקודת הפעלה `yakgpt`. אפשר להוסיף גם התקנת Ollama, ובטלפון גם הפעלה אוטומטית כשהוא נדלק.
  - **הפעלה מקומית בלבד:** השרת מאזין ל־`127.0.0.1` כברירת מחדל.
  - **התקנה כאפליקציה:** אפשר להוסיף את האפליקציה למסך הבית.
  - **הוראות Ollama:** מותאמות למערכת ההפעלה.
- `scripts/start.mjs`: cross-platform launcher for the standalone build.
  - Copies `public` and `.next/static` next to the standalone server.
  - Binds to `127.0.0.1` by default (`--host`, `--port`).
  - `--open` opens the browser (`xdg-open`, `open`, `start` or `termux-open-url`).
  - `yarn start` now runs it.
- `scripts/install.sh` (Linux, macOS, Termux):
  - checks Node ≥ 20.9 (installs it with `pkg` on Termux);
  - installs dependencies with pinned Yarn 1 and builds; on Termux it uses webpack, because Next.js has no native Android compiler and falls back to WebAssembly;
  - creates a `yakgpt` launcher;
  - `--ollama` installs Ollama; `--boot` adds a Termux:Boot start script.
- `scripts/install.ps1` (Windows): installs Node.js LTS and optionally Ollama with `winget`, builds, and creates `yakgpt.cmd`.
- `yarn build:webpack` script.
- `next.config.js`: images are served unoptimized on Android, because `sharp` has no Android build. Also controllable with `YAKGPT_UNOPTIMIZED_IMAGES=1`.
- `.gitattributes` keeps `.sh`/`.mjs` LF and `.ps1`/`.cmd` CRLF, so scripts run after a Windows checkout.
- Web app manifest and new icons, so "Add to Home screen" installs YakGPT as a standalone app.
- The "Ollama is not running" help detects the OS (Windows, macOS, Linux, Android/Termux) and shows the matching install and start commands. `OLLAMA_ORIGINS` is only shown when the page isn't on localhost.

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
