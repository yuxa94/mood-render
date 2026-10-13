import { McpServer } from "@modelcontextprotocol/server";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { Service } from "./service.js";
const UI_URI = "ui://mood-render/v0.1.4/app.html";
function createServer(root, html) {
  const server = new McpServer({ name: "mood-render", version: "0.1.4" });
  const service = new Service(root);
  server.registerResource(
    "mood-render-studio",
    UI_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: UI_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: {
              prefersBorder: false,
              csp: { resourceDomains: [], connectDomains: [] }
            }
          }
        }
      ]
    })
  );
  for (const [name, tool] of Object.entries(service.tools)) {
    server.registerTool(
      name,
      {
        title: name,
        description: tool.description,
        inputSchema: tool.schema,
        annotations: {
          readOnlyHint: !!tool.readOnly,
          destructiveHint: false,
          openWorldHint: false
        },
        _meta: {
          ui: {
            ...name === "open_mood_render" ? { resourceUri: UI_URI } : {},
            visibility: tool.uiOnly ? ["app"] : tool.modelOnly ? ["model"] : ["app", "model"]
          },
          ...name === "open_mood_render" ? { "openai/ui": { entrypoints: [{ type: "thread" }] } } : {}
        }
      },
      async (args) => {
        try {
          const data = await service.call(name, args);
          return {
            structuredContent: { data },
            content: [{ type: "text", text: JSON.stringify(data) }]
          };
        } catch (e) {
          return {
            isError: true,
            content: [{ type: "text", text: e.message }]
          };
        }
      }
    );
  }
  return server;
}
export {
  UI_URI,
  createServer
};
