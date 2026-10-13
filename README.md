# Mood Render

Mood Render is a local Codex plugin for turning architectural 3D screenshots into photoreal concept images with a selected reference moodboard. It uses Codex's built-in search and image tools; no separate model API key is needed.

## Install in Codex

Node.js 22.21 or newer is required on the computer running the plugin.

1. Add this repository as a plugin marketplace: `codex plugin marketplace add yuxa94/mood-render`.
2. Restart the ChatGPT desktop app, open the Plugins Directory, select the **Mood Render** marketplace, and install **Mood Render**.
3. Start a new Codex chat and ask it to open Mood Render.

The repo includes the built MCP server and app UI in `mood-render/dist/`, so installation does not require `npm install`. For a standalone local preview, download the ZIP from GitHub Releases, extract it, and run `mood-render/Start.command` on macOS. The preview prepares requests for Codex; it does not call an image model on its own.

Project data and user images are stored separately under `~/.codex/mood-render/projects/` and are **not** included in this repository or release ZIP. See [the plugin README](mood-render/README.md) for the workflow and limitations.
