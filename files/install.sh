#!/usr/bin/env bash
# Replicate the Pi agent workflow on a laptop.
# Run on the NEW machine. Safe to re-run: every step is idempotent.
# Nothing here contains a secret. Keys are added by you afterwards.
set -euo pipefail

PI_DIR="$HOME/.pi/agent"
SKILLS_DIR="$HOME/.agents/skills"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- 1. base tools
say "1/8  Base tools"
if command -v node >/dev/null; then
  echo "node $(node -v) already present"
else
  echo "Install Node 20+ first: https://nodejs.org  (brew install node / apt install nodejs npm)"
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || { echo "Node 20+ required, found $NODE_MAJOR"; exit 1; }

for t in git jq rg; do
  command -v "$t" >/dev/null && echo "ok: $t" || echo "MISSING: $t  (install it, then re-run)"
done

# ---------------------------------------------------------------- 2. directories
say "2/8  Directory layout"
mkdir -p "$PI_DIR/extensions" "$PI_DIR/prompts" "$SKILLS_DIR"
chmod 700 "$PI_DIR"

# ---------------------------------------------------------------- 3. pi itself
say "3/8  Pi CLI"
if command -v pi >/dev/null; then
  echo "pi $(pi --version 2>/dev/null || echo present)"
else
  npm install -g @earendil-works/pi-coding-agent
fi

# ---------------------------------------------------------------- 4. copy configs
say "4/8  Config files"
HERE="$(cd "$(dirname "$0")" && pwd)"
cp -n "$HERE/settings.json"        "$PI_DIR/settings.json"
cp -n "$HERE/mcp.json"             "$PI_DIR/mcp.json"
cp -n "$HERE/AGENTS.md"            "$PI_DIR/AGENTS.md"
cp -n "$HERE/prompts/chat.md"      "$PI_DIR/prompts/chat.md"
cp -n "$HERE/prompts/check-once.md" "$PI_DIR/prompts/check-once.md"
cp -n "$HERE/extensions/"*.ts      "$PI_DIR/extensions/"
mkdir -p "$PI_DIR/extensions/pi-permission-system"
cp -n "$HERE/permission-system-config.json" "$PI_DIR/extensions/pi-permission-system/config.json"
# models.json is NOT copied in place: it needs your API keys first. See step 5.
echo "copied (existing files left untouched)"

# ---------------------------------------------------------------- 5. models.json
say "5/8  Models"
if [ -f "$PI_DIR/models.json" ]; then
  echo "models.json already exists; backing up and NOT overwriting"
  cp "$PI_DIR/models.json" "$PI_DIR/models.json.bak-$(date +%Y%m%d%H%M%S)"
else
  cp "$HERE/models.sanitized.json" "$PI_DIR/models.json"
  echo "installed models.sanitized.json as models.json (apiKey values are \$ENV placeholders)"
fi
echo
echo "Set the provider keys as environment variables, e.g.:"
echo '  export DOLPHIN_API_KEY=...       # in ~/.zshrc or ~/.bashrc'
echo "Or use pi's own login:  pi auth login <provider>"

# ---------------------------------------------------------------- 6. pi packages
say "6/8  Pi packages (extensions, memory, subagents, search)"
PKGS=(
  "npm:pi-btw"
  "npm:pi-memory"
  "npm:billion-context"
  "npm:@dietrichgebert/ponytail"
  "npm:pi-subagents@latest"
  "npm:@piotr-oles/pi-bell"
  "npm:pi-usage"
  "npm:@juicesharp/rpiv-todo"
  "npm:@schovest/pi-goal"
  "npm:@gotgenes/pi-permission-system"
  "npm:pi-sessions"
  "npm:pi-web-access@latest"
)
for p in "${PKGS[@]}"; do
  pi install "$p" >/dev/null 2>&1 && echo "ok: $p" || echo "skip/failed: $p (may already be installed)"
done

# ---------------------------------------------------------------- 7. superpowers
say "7/8  Superpowers skill bundle"
if [ -d "$HOME/superpowers/.git" ]; then
  git -C "$HOME/superpowers" pull --ff-only || true
else
  git clone https://github.com/obra/superpowers "$HOME/superpowers"
fi
pi install "$HOME/superpowers" >/dev/null 2>&1 && echo "ok: superpowers linked" || echo "link manually: pi install ~/superpowers"

# ---------------------------------------------------------------- 8. skills
say "8/8  Standalone skills"
echo "Skills are folders with a SKILL.md. Install any of these you want:"
echo "  npx skills add heredotnow/skill --skill here-now -g"
echo "  npx skills add <owner/repo@skill> -g -y"
echo "Then check: ls $SKILLS_DIR"

say "Done. Next:"
cat <<'EOF'
1. Put your model API keys in the environment (or run `pi auth login`).
2. Run `pi` and check the footer shows your default model.
3. Try: /chat  and  /model
4. Extensions that are Android-only: notify.ts (Termux:API).
   Delete it on a laptop:  rm ~/.pi/agent/extensions/notify.ts
EOF
