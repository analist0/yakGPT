#!/usr/bin/env bash
# Installs and builds Hamal on Linux, macOS or Android (Termux).
#
#   ./scripts/install.sh            install dependencies and build
#   ./scripts/install.sh --ollama   also install Ollama for local models
#   ./scripts/install.sh --boot     Termux: start Hamal when the phone boots
#                                   (needs the Termux:Boot app)
#
# Afterwards run `hamal` (or `node scripts/start.mjs`) and open
# http://localhost:3000
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
MIN_NODE_MAJOR=20
MIN_NODE_MINOR=9
WITH_OLLAMA=0
WITH_BOOT=0
for arg in "$@"; do
  case "$arg" in
    --ollama) WITH_OLLAMA=1 ;;
    --boot) WITH_BOOT=1 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

info() { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

IS_TERMUX=0
if [ -n "${TERMUX_VERSION:-}" ] || [[ "${PREFIX:-}" == *com.termux* ]]; then
  IS_TERMUX=1
fi

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local version major minor
  version="$(node -p 'process.versions.node')"
  major="${version%%.*}"
  minor="$(echo "$version" | cut -d. -f2)"
  [ "$major" -gt "$MIN_NODE_MAJOR" ] || { [ "$major" -eq "$MIN_NODE_MAJOR" ] && [ "$minor" -ge "$MIN_NODE_MINOR" ]; }
}

# 1. Node.js
if ! node_ok; then
  if [ "$IS_TERMUX" -eq 1 ]; then
    info "Installing Node.js with pkg"
    pkg update -y
    pkg install -y nodejs-lts git
  else
    fail "Node.js ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR} or newer is required (found: $(node -v 2>/dev/null || echo none)).
Install it from https://nodejs.org or with your package manager, e.g.:
  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
  Fedora:        sudo dnf install nodejs
  Arch:          sudo pacman -S nodejs npm
  macOS:         brew install node"
  fi
  node_ok || fail "Node.js is still too old after installing: $(node -v)"
fi
info "Node.js $(node -v)"

# 2. Dependencies (the repository pins Yarn 1)
YARN=(npx --yes yarn@1.22.22)
info "Installing dependencies"
"${YARN[@]}" install --frozen-lockfile --network-timeout 600000

# 3. Build. Termux has no native Next.js compiler for Android, so build with
# webpack (Next downloads its WebAssembly compiler automatically)
info "Building"
if [ "$IS_TERMUX" -eq 1 ]; then
  NODE_OPTIONS="--max-old-space-size=2048" "${YARN[@]}" next build --webpack
else
  "${YARN[@]}" build
fi

# 4. A `hamal` command
if [ "$IS_TERMUX" -eq 1 ]; then
  BIN_DIR="$PREFIX/bin"
else
  BIN_DIR="$HOME/.local/bin"
fi
mkdir -p "$BIN_DIR"
if [ "$IS_TERMUX" -eq 1 ]; then
  SHEBANG="#!$PREFIX/bin/bash"
else
  SHEBANG="#!/usr/bin/env bash"
fi
cat > "$BIN_DIR/hamal" <<EOF
$SHEBANG
exec node "$ROOT/scripts/start.mjs" "\$@"
EOF
chmod +x "$BIN_DIR/hamal"
info "Created $BIN_DIR/hamal"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) warn "$BIN_DIR is not on your PATH; run $BIN_DIR/hamal or add it to PATH" ;;
esac

# 5. Optional: Ollama for local models
if [ "$WITH_OLLAMA" -eq 1 ]; then
  if command -v ollama >/dev/null 2>&1; then
    info "Ollama is already installed"
  elif [ "$IS_TERMUX" -eq 1 ]; then
    info "Installing Ollama with pkg"
    pkg install -y ollama
  elif [ "$(uname)" = "Darwin" ]; then
    warn "Install Ollama from https://ollama.com/download (or: brew install ollama)"
  else
    info "Installing Ollama (official script, may ask for sudo)"
    curl -fsSL https://ollama.com/install.sh | sh
  fi
fi

# 6. Optional: start on boot (Termux:Boot)
if [ "$WITH_BOOT" -eq 1 ]; then
  if [ "$IS_TERMUX" -ne 1 ]; then
    warn "--boot only applies to Termux; use a systemd user service or your desktop's autostart instead"
  else
    mkdir -p "$HOME/.termux/boot"
    OLLAMA_LINE=""
    if [ "$WITH_OLLAMA" -eq 1 ]; then
      OLLAMA_LINE='ollama serve > "$HOME/ollama.log" 2>&1 &'
    fi
    cat > "$HOME/.termux/boot/hamal" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
$OLLAMA_LINE
node "$ROOT/scripts/start.mjs" > "\$HOME/hamal.log" 2>&1
EOF
    chmod +x "$HOME/.termux/boot/hamal"
    info "Hamal will start when the phone boots (requires the Termux:Boot app from F-Droid)"
  fi
fi

echo
info "Done. Start Hamal with:  hamal --open"
if [ "$IS_TERMUX" -eq 1 ]; then
  echo "    Then open http://localhost:3000 in your browser and use \"Add to Home screen\"."
  echo "    Tip: run termux-wake-lock so Android doesn't stop it in the background."
fi
