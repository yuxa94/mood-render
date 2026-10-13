# Local tool access

The plugin root is two directories above this skill's folder. Use the real absolute directory of the installed skill, not a remembered cache version. All functions are also exposed as native MCP tools when available.

To call from the terminal, save a JSON object to a temporary file using a file-writing tool and run:

```sh
node "<plugin-root>/dist/server.mjs" --call get_project --args-file "<arguments.json>"
```

Do not embed user prompts into shell code. CLI calls use the same data store as the UI. No arguments: `--call list_projects`. Open the local UI with `node "<plugin-root>/dist/server.mjs" --preview`, then use the exact returned localhost URL in Codex. Keep that process alive while the studio is open.

Default project root: `${CODEX_HOME:-~/.codex}/mood-render/projects/`. `MOOD_RENDER_DATA_ROOT` overrides it for tests. Do not set a test override during a user's real workflow.

Common calls:
- `create_project`: `{name}` → project.
- `get_project`: `{projectId}` → project with revision, references, board, jobs and results.
- `import_image`: `{projectId,path,expectedRevision}` → `{asset,revision}`. Only import explicitly selected or legitimately retrieved image files. Actual PNG/JPEG/WebP, maximum 25 MiB.
- `set_source`: `{projectId,assetId,expectedRevision}` → project.
- `add_references`: `{projectId,expectedRevision,items:[{title,sourceUrl,imageUrl?,reason,category,rightsNote?,assetId?}]}` → project. Omit assetId when actual pixels are unavailable. category: material, lighting, color, landscape, furniture or mood.
- `attach_reference_image`: `{projectId,referenceId,assetId,expectedRevision}` → project.
- `save_board`: `{projectId,board,expectedRevision}` → project. Preserve all existing settings except requested changes; read current project first.
- Board items: `{referenceId,roles:["auto"],target:"",note:""}` is the default. Auto is exclusive of manual roles (`material`, `lighting`, `color`, `landscape`, `furniture`, `mood`). Target/note are optional; empty means automatic. Legacy strength is ignored. Preserve existing manual roles.
- `prepare_render`: `{projectId,expectedRevision,clientRequestId,baseResultId?,instruction}` → `{job,brief,revision}`. Use a fresh UUID for a new request, reuse it only for the identical retry. This freezes the inputs but does not generate an image.
- `get_render`: `{projectId,jobId}` → `{job,brief,inputFiles:[{path,assetId,mimeType,role}]}`. Image paths are verified local inputs for image viewing/generation tools.
- `set_render_status`: `{projectId,jobId,status,error?}`. Valid states prepared, dispatched, running, needs-result, failed. Never set completed directly.
- `register_result`: `{projectId,jobId,assetId,note?,reviewNote?,modelLabel?}` → `{result,project}`. Call after importing the real result. This atomically sets completed.
- `update_result_review`: `{projectId,resultId,reviewNote,expectedRevision}` → project.

Read a fresh revision before each new project mutation. A revision conflict means another writer changed the project; reconcile the current state rather than overwrite it. BUSY means another process holds a write lock. Do not remove locks or user data to force an update. Same job result registration is idempotent.

When the UI says result registration is required, the user can upload the image there or you can import a usable native tool output and register it. Source image reuse, placeholder images and generated file paths guessed from names do not qualify as results.
