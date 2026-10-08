# YakGPT

A fast, private chat UI for every AI provider, local or in the cloud. Hebrew (right-to-left) and English interface.

## Features

- **Every major provider**: OpenAI, xAI (Grok), Groq, OpenRouter, Google Gemini, and local models through Ollama. Switch provider and model from the picker at the top.
- **Local models that fit your machine**: on first launch YakGPT detects your CPU, RAM and GPU, suggests Ollama models that will run well, and downloads them with live progress.
- **Tools**: models can call tools (current time, calculator, fetch a web page) and you see every call and result.
- **MCP servers**: connect remote (HTTP) and local (stdio) Model Context Protocol servers, or import a Claude Desktop / Cursor `mcp.json`.
- **Skills**: instruction packs the model loads on demand (`SKILL.md` or JSON import/export).
- **Voice**: dictation (Whisper or Azure), read-aloud (OpenAI, Azure, ElevenLabs), and realtime speech-to-speech with Grok.
- **Reasoning view**: thinking from reasoning models is shown in a collapsible block.
- **Error monitoring**: in-app error log with JSON export, error boundaries, optional Sentry.
- **Modern UI**: Next.js 16, React 19 and Mantine 9, light/dark themes, smooth animations, mobile friendly.
- **Private**: keys and chats are stored in your browser and sent only to the provider you chose.

## Screenshots

| Chat (Hebrew, dark) | Setup wizard with hardware detection |
| --- | --- |
| ![Chat](docs/screenshots/chat-rtl-dark.png) | ![Setup](docs/screenshots/setup-wizard.png) |
| **Tools, MCP and skills** | **English, light** |
| ![Tools](docs/screenshots/tools-mcp.png) | ![Light](docs/screenshots/light-english.png) |

<img src="docs/screenshots/mobile.png" alt="Mobile" width="260" />

## 🚀 Getting Started

Visit [YakGPT](https://yakgpt.vercel.app) to try it out without installing, or follow these steps to run it locally:

### Prerequisites

- [Node.js](https://nodejs.org/) 20.9 or newer
- [Yarn](https://yarnpkg.com/) (or npm or pnpm)
- Optional: [Ollama](https://ollama.com) for local models

### Installation

1. Clone the repository:

```
$ git clone https://github.com/yakGPT/YakGPT.git
```

2. Install dependencies, build the bundle and run the server

```
$ yarn
$ yarn build
$ yarn start
```

Then navigate to http://localhost:3000

Congratulations! 🎉 You are now running YakGPT locally on your machine.

## 🔑 Providers and keys

The setup wizard asks for keys on first launch; you can change them any time under **Providers & keys**. Keys can also be set in `.env.local` (⚠️ local use only, they end up in the browser bundle):

```
NEXT_PUBLIC_OPENAI_API_KEY=...
NEXT_PUBLIC_XAI_API_KEY=...
NEXT_PUBLIC_GROQ_API_KEY=...
NEXT_PUBLIC_OPENROUTER_API_KEY=...
NEXT_PUBLIC_GEMINI_API_KEY=...
NEXT_PUBLIC_OLLAMA_BASE_URL=http://localhost:11434/v1
NEXT_PUBLIC_CHAT_PROVIDER=openai   # openai | xai | groq | openrouter | gemini | ollama
NEXT_PUBLIC_11LABS_API_KEY=...
NEXT_PUBLIC_AZURE_API_KEY=...
NEXT_PUBLIC_AZURE_REGION=...
NEXT_PUBLIC_SENTRY_DSN=...          # optional error reporting
```

Speech to text (Whisper) and OpenAI text to speech use the OpenAI key.

### Local models (Ollama)

Install [Ollama](https://ollama.com) and start it so the app's origin may call it:

```
$ OLLAMA_ORIGINS=http://localhost:3000 ollama serve
```

YakGPT finds it automatically. Open **Local models** to see your hardware, the models that fit, and to download or remove models.

### Realtime voice (Grok)

With an xAI key set, the headset button in the composer starts a speech-to-speech conversation with Grok. Both sides are transcribed into the chat, and the chat's system prompt and recent messages are given to the voice model. Voice and model are under **Settings → Voice**.

### Tools, skills and MCP

Open **Tools, skills & MCP**:

- **Tools**: turn tool use on or off, globally or per tool. Models that don't support tools answer normally.
- **MCP servers**: add a remote server by URL, or a local server by command (for example `npx -y @modelcontextprotocol/server-filesystem ~/Documents`). Quick-add presets and `mcp.json` import are included.
- **Skills**: write instruction packs with a name and a "when to use" description; the model loads one with the `load_skill` tool when a task matches. **Import from GitHub** takes a public repository (for example `anthropics/skills`), a folder in it, or a single `SKILL.md` link, lists every skill it finds and imports the ones you pick. Importing again updates skills with the same name.

### Local-only server features

Local MCP servers, hardware detection and the `fetch_url` tool run on the server, so they only answer requests from the same machine (loopback). To use them from elsewhere, for example through Docker's port mapping, set `YAKGPT_LOCAL_FEATURES=1`. Only do that when the port is not reachable by other people: it lets the browser start processes on the server.

## 🐳 Docker

To use the pre-built Docker image from Docker Hub (only for amd64), run:

```
$ docker run -it -p 3000:3000 yakgpt/yakgpt:latest
```

---

To build the Docker image yourself (such as if you're on arm64), run:

```
$ docker build -t yakgpt:latest .
$ docker run -it -p 127.0.0.1:3000:3000 -e YAKGPT_LOCAL_FEATURES=1 yakgpt:latest
```

`YAKGPT_LOCAL_FEATURES=1` enables local MCP servers and hardware detection inside the container (see above); binding to `127.0.0.1` keeps the port private to your machine. Hardware detection then reports the container's view of the machine.

## 🎤 Microphone Integration

YakGPT makes chatting a breeze with its microphone integration! Activate your microphone using your browser's permissions, and YakGPT will automatically convert your speech into text.

You can also toggle the mic integration as needed by clicking on the microphone icon in the app.

Remember to use a supported web browser and ensure your microphone is functioning properly.

## 🛡️ Data Privacy and Security

YakGPT uses your own API keys. Chats and keys are stored in your browser, and requests go directly from your browser to the provider you chose. The YakGPT server is only involved for local MCP servers, hardware detection and the `fetch_url` tool.

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for what changed in each release (Hebrew and English).

## 📃 License

This project is licensed under the MIT License - see the [`LICENSE`](LICENSE) file for details

## 🙌 Acknowledgments

- [OpenAI](https://openai.com/) for building such amazing models and making them cheap as chips.
- [Mantine UI](https://ui.mantine.dev/) just an all-around amazing UI library.
- [opus-media-recorder](https://github.com/kbumsik/opus-media-recorder) A real requirement for me was to be able to walk-and-talk. OpenAI's Whisper API is unable to accept the audio generated by Safari, and so I went back to wav recording which due to lack of compression makes things incredibly slow on mobile networks. `opus-media-recorder` saved my butt by allowing cross-platform compressed audio recording via web worker magic. 🤗

Got feedback, questions or ideas? Feel free to submit an issue!
