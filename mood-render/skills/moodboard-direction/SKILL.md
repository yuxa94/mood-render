---
name: moodboard-direction
description: Translate user-selected Mood Render reference images into material, lighting, colour and atmosphere instructions while preserving the original 3D image. Use when refining a saved moodboard before rendering.
---

# Moodboard direction

Read the project and inspect the selected references. Use only selected cards. The original determines the geometry and composition; references provide only their assigned visual elements. A reference building's form must not silently replace the user's building.

Keep the user's role, target and note for each card. Auto is the default for newly selected cards: inspect the actual reference and infer suitable materials, lighting, colour, planting, furniture and atmosphere in context of the original and the user's overall direction. Do not require per-card target or note; blank means automatic. Auto is exclusive of manual roles. Preserve existing manual choices. Ignore legacy strength fields; strength is no longer a control. Translate vague language into concrete image instructions when the intended change is clear. For meaningful conflicts such as daylight and night lighting, ask one focused question or propose variants; do not average incompatible directions without saying so.

Preserve camera, structure, openings and furniture according to the board's flags. Never promise dimensional accuracy. Save requested direction changes with save_board and a fresh revision. Do not change selected references without authorization.

If native tools are missing, use `../mood-render/references/tool-contracts.md`.
