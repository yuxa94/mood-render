export interface Transport {
  callTool: (name: string, args: unknown) => Promise<any>;
  sendMessage?: (text: string) => Promise<unknown>;
  updateContext?: (text: string) => Promise<unknown>;
  openLink?: (url: string) => Promise<unknown>;
}
export function makeBridge(t: Transport) {
  return {
    callTool: t.callTool,
    async sendMessage(
      text: string,
    ): Promise<"sent" | "unsupported" | "failed"> {
      if (!t.sendMessage) return "unsupported";
      try {
        const r: any = await t.sendMessage(text);
        return r?.isError ? "failed" : "sent";
      } catch {
        return "failed";
      }
    },
    async updateContext(text: string) {
      try {
        if (!t.updateContext) return false;
        await t.updateContext(text);
        return true;
      } catch {
        return false;
      }
    },
    async openLink(url: string) {
      if (t.openLink) await t.openLink(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    },
  };
}
export async function connectHost() {
  if (window.parent !== window) {
    const { App } = await import("@modelcontextprotocol/ext-apps");
    const app = new App(
      { name: "Mood Render", version: "0.1.4" },
      {},
      { autoResize: true },
    );
    await app.connect(undefined, { timeout: 10000 });
    const bridge = makeBridge({
      callTool: async (name, args: any) => {
        const r = await app.callServerTool({ name, arguments: args });
        if (r.isError)
          throw Error((r.content?.[0] as any)?.text || "도구 실행 실패");
        return (r.structuredContent as any)?.data;
      },
      sendMessage: async (text) =>
        app.sendMessage({ role: "user", content: [{ type: "text", text }] }),
      updateContext: async (text) =>
        app.updateModelContext({ content: [{ type: "text", text }] }),
      openLink: async (url) => app.openLink({ url }),
    });
    return { bridge, mode: "codex" };
  }
  const token = (window as any).__MOOD_TOKEN__;
  if (!token)
    throw Error("Codex에서 플러그인을 열거나 로컬 실행기를 사용하세요.");
  return {
    bridge: makeBridge({
      callTool: async (name, args) => {
        const r = await fetch("/rpc", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name, args }),
        });
        const out = await r.json();
        if (!r.ok) throw Error(out.error);
        return out;
      },
      openLink: async (url) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
    }),
    mode: "local",
  };
}
