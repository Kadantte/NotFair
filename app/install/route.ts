import { NextRequest } from 'next/server';

function buildScript(apiKey: string): string {
  return `#!/usr/bin/env bash
set -eo pipefail

API_KEY="${apiKey}"
SKILL_DIR="$HOME/.claude/skills/toprank"

echo "Installing AdsAgent..."

# Clone or update toprank
if [ -d "$SKILL_DIR/.git" ]; then
  git -C "$SKILL_DIR" pull --ff-only -q 2>/dev/null || true
else
  rm -rf "$SKILL_DIR"
  git clone --depth 1 https://github.com/nowork-studio/toprank.git "$SKILL_DIR" 2>/dev/null
fi

# Run setup — auto-detect all available hosts
"$SKILL_DIR/setup" --skill ads --api-key "$API_KEY"
`;
}

export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return new Response('echo "Error: missing token. Visit your AdsAgent connect page to get your install command."', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(buildScript(token), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
