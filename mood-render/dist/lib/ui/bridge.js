function makeBridge(t) {
  return {
    callTool: t.callTool,
    async sendMessage(text) {
      if (!t.sendMessage) return "unsupported";
      try {
        const r = await t.sendMessage(text);
        return r?.isError ? "failed" : "sent";
      } catch {
        return "failed";
      }
    },
    async updateContext(text) {
      try {
        if (!t.updateContext) return false;
        await t.updateContext(text);
        return true;
      } catch {
        return false;
      }
    },
    async openLink(url) {
      if (t.openLink) await t.openLink(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    }
  };
}
async function connectHost() {
  if (window.parent !== window) {
    const { App } = await import("@modelcontextprotocol/ext-apps");
    const app = new App(
      { name: "Mood Render", version: "0.1.4" },
      {},
      { autoResize: true }
    );
    await app.connect(void 0, { timeout: 1e4 });
    const bridge = makeBridge({
      callTool: async (name, args) => {
        const r = await app.callServerTool({ name, arguments: args });
        if (r.isError)
          throw Error(r.content?.[0]?.text || "\uB3C4\uAD6C \uC2E4\uD589 \uC2E4\uD328");
        return r.structuredContent?.data;
      },
      sendMessage: async (text) => app.sendMessage({ role: "user", content: [{ type: "text", text }] }),
      updateContext: async (text) => app.updateModelContext({ content: [{ type: "text", text }] }),
      openLink: async (url) => app.openLink({ url })
    });
    return { bridge, mode: "codex" };
  }
  const token = window.__MOOD_TOKEN__;
  if (!token)
    throw Error("Codex\uC5D0\uC11C \uD50C\uB7EC\uADF8\uC778\uC744 \uC5F4\uAC70\uB098 \uB85C\uCEEC \uC2E4\uD589\uAE30\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.");
  return {
    bridge: makeBridge({
      callTool: async (name, args) => {
        const r = await fetch("/rpc", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ name, args })
        });
        const out = await r.json();
        if (!r.ok) throw Error(out.error);
        return out;
      },
      openLink: async (url) => {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }),
    mode: "local"
  };
}
export {
  connectHost,
  makeBridge
};
