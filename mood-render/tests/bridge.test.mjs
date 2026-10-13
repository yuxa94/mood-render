import test from "node:test";
import assert from "node:assert/strict";
const { makeBridge } = await import("../dist/lib/ui/bridge.js");
test("unsupported host does not report a dispatched request", async () => {
  const bridge = makeBridge({ callTool: async () => ({}) });
  assert.equal(await bridge.sendMessage("render"), "unsupported");
});
test("rejected host message is failed, not sent", async () => {
  const bridge = makeBridge({
    callTool: async () => ({}),
    sendMessage: async () => {
      throw Error("denied");
    },
  });
  assert.equal(await bridge.sendMessage("render"), "failed");
});
