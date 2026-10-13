---
name: mood-render
description: Open or resume the local Mood Render studio to turn a 3D screenshot into a photoreal concept image using selected reference images and a moodboard. Use for this plugin's projects, boards, reference searches and saved render jobs. Not a 3D model editor.
---

# Mood Render

Open the studio with `open_mood_render`. Keep all project assets in the plugin's project store; do not save user images inside the plugin installation cache. Use `list_projects` or the user's exact projectId to resume. Ask for the project only if more than one is plausible.

The workflow is original image → reference search → user selection → moodboard → built-in image generation → comparison. The user controls reference selection unless they explicitly delegate that choice.

- Searching: read `../reference-research/SKILL.md`.
- Resolving reference roles: read `../moodboard-direction/SKILL.md`.
- Generating or revising: read `../render-from-moodboard/SKILL.md`.
- Tools unavailable in this conversation: read [local tool calls](references/tool-contracts.md). Use the packaged CLI and open its localhost studio in Codex. Never pretend the localhost page can send a chat message; it provides a copyable request when the native bridge is unavailable.

There is no external image API, API key or background model daemon. If Codex's built-in search/image tool is unavailable, preserve the work and state the missing capability. Do not substitute an API or fabricate references/results.
