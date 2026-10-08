#!/usr/bin/env node
// Cross-platform launcher for the production build (Linux, macOS, Windows,
// Termux). Runs the standalone server Next.js produces, bound to this machine
// only unless --host says otherwise.
//
//   node scripts/start.mjs [--port 3000] [--host 127.0.0.1] [--open]
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};

const port = option("port", process.env.PORT || "3000");
const host = option("host", process.env.HOSTNAME || "127.0.0.1");
const standalone = join(root, ".next", "standalone");
const server = join(standalone, "server.js");

if (!existsSync(server)) {
  console.error("No production build found. Run the install script or `yarn build` first.");
  process.exit(1);
}

// The standalone server expects static files next to it
cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });

const url = `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`;
const child = spawn(process.execPath, [server], {
  cwd: standalone,
  stdio: "inherit",
  env: { ...process.env, PORT: port, HOSTNAME: host },
});

if (host !== "127.0.0.1" && host !== "localhost") {
  console.log(
    `Listening on ${host}. Local MCP servers, hardware detection and fetch_url still only answer this machine unless YAKGPT_LOCAL_FEATURES=1.`
  );
}
console.log(`YakGPT: ${url}`);

if (args.includes("--open")) {
  const opener =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "android"
      ? ["termux-open-url", [url]]
      : ["xdg-open", [url]];
  setTimeout(() => {
    spawn(opener[0], opener[1], { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  }, 1500);
}

const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
