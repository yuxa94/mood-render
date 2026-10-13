---
name: render-from-moodboard
description: Execute or revise a saved Mood Render job with Codex built-in image generation and register a non-destructive result version. Use when asked to photorealize a 3D image from a selected moodboard or execute a projectId/jobId.
---

# Render from moodboard

Use only built-in image generation. Do not request an API key, call a model API, run an image API CLI, or claim a model name the current tool does not confirm. If native plugin tools are unavailable, use `../mood-render/references/tool-contracts.md`.

1. Read get_render for the exact projectId/jobId. If the user supplied only a project, read it and prepare_render with a new request UUID after confirming the selected board is ready. A completed job should show its existing result, not regenerate. A running job needs reconciliation with the actual conversation/tool result before a retry; never generate a second image merely because a UI refresh occurred.
2. Inspect every inputFiles.path with the image viewing tool. The original is the geometry reference. When baseResultId exists, the previous result is the edit target and the original remains the structure reference. Selected references supply assigned materials, light or atmosphere. For Auto cards, infer relevant elements and their application from the actual image, overall direction and preservation settings; respect optional target/note overrides. Do not ask users to assign roles individually. Ignore legacy strength fields. If an image cannot be read, preserve the request and explain exactly which input is missing. Do not quietly remove it.
3. Use the frozen brief, not a subsequently edited live board. Follow the current built-in image tool's supported reference mechanism and limits. If all inputs cannot be supplied, ask the user to narrow references or approve a suitable composite; never silently omit references. Do not promise exact geometry preservation or unsupported mask/seed controls.
4. Record running immediately before actual generation. Call the built-in image tool. On failure, record failed with the actual reason; do not auto-loop. Show the native returned image in the conversation.
5. If the tool exposes a genuine usable image file or native image data that can be saved, import that output with import_image, then register_result with a concise note. Preserve the original and previous versions. If the result exists only as conversation media and cannot be saved, record needs-result and explain the studio's result registration action. Never invent a local path or register a placeholder as a result.
6. Inspect the real output and original. Report visible changes in camera, walls/mass, openings and furniture separately from material/lighting success. Record the comparison in reviewNote (update_result_review after registration if needed). No claim of measured or construction-level accuracy.

End by showing the image, stating any visible geometry deviations and the registered version or remaining file-registration step. Keep subsequent revisions linked to the selected result through baseResultId.
