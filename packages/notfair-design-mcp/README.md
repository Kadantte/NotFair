# NotFair Design MCP

Local stdio MCP server for image generation. The server exposes design tools to MCP clients such as Codex, Claude Desktop, Claude Code, Cursor, and Cline.

## Providers

- `openai` (default): OpenAI Images API, default model `gpt-image-2`
- `nano_banana`: Gemini 3 Pro Image / Nano Banana Pro, default model `gemini-3-pro-image-preview`

## Setup

```bash
cd /Users/tongchen/Documents/Projects/notfair/packages/notfair-design-mcp
pnpm install
pnpm build
```

Set at least one API key:

```bash
export OPENAI_API_KEY=...
export GEMINI_API_KEY=...
export NOTFAIR_DESIGN_PROVIDER=openai
export NOTFAIR_DESIGN_USER_STATUS=free
export NOTFAIR_DESIGN_USER_ID=local
export NOTFAIR_DESIGN_OUTPUT_DIR=./out
```

Quota is enforced before generation and counted only after successful image writes:

- `free`: 10 successful generations per UTC calendar month
- `growth`: 200 successful generations per UTC calendar month

Local usage is stored at `~/.notfair-design-mcp/usage.json` unless `NOTFAIR_DESIGN_USAGE_PATH` is set. The local store uses short cross-process reservations so concurrent stdio server processes do not overrun the monthly limit. The hosted NotFair MCP should replace `NOTFAIR_DESIGN_USER_STATUS` with the authenticated user's subscription state.

Images are written under `NOTFAIR_DESIGN_OUTPUT_DIR` by default. Relative `outputPath` values must stay inside that directory, existing files are not overwritten unless `overwrite: true` is passed, and absolute paths require `allowAbsolutePath: true`.

Codex MCP example:

```bash
codex mcp add notfair-design -- node /Users/tongchen/Documents/Projects/notfair/packages/notfair-design-mcp/dist/index.js
```

Claude Desktop style config:

```json
{
  "mcpServers": {
    "notfair-design": {
      "command": "node",
      "args": ["/Users/tongchen/Documents/Projects/notfair/packages/notfair-design-mcp/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "YOUR_OPENAI_API_KEY",
        "GEMINI_API_KEY": "YOUR_GEMINI_API_KEY",
        "NOTFAIR_DESIGN_PROVIDER": "openai",
        "NOTFAIR_DESIGN_USER_STATUS": "free",
        "NOTFAIR_DESIGN_USER_ID": "local",
        "NOTFAIR_DESIGN_OUTPUT_DIR": "./out"
      }
    }
  }
}
```

## Tools

### `list_providers`

Shows configured providers, default models, and current quota.

### `get_usage`

Shows the current configured user's monthly image quota and reset time.

### `generate_image`

Generates one image and saves it to disk. The result returns the file path plus provider/model metadata.

Minimal call:

```json
{
  "prompt": "A polished SaaS product hero image for NotFair, showing AI-managed ad operations, clean modern UI, no text"
}
```

Explicit provider:

```json
{
  "provider": "nano_banana",
  "prompt": "High-end product mockup for an AI marketing operations platform, editorial lighting, no text",
  "aspectRatio": "16:9",
  "resolution": "2K"
}
```

OpenAI generation options:

```json
{
  "provider": "openai",
  "model": "gpt-image-2",
  "prompt": "Square app icon for NotFair Design, sharp vector-like rendering, no words",
  "size": "1024x1024",
  "quality": "medium",
  "outputFormat": "png"
}
```

For fast drafts, use `quality: "low"` or `quality: "medium"` before moving final candidates to `high`.
