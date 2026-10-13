import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { Service } from "./service.js";
function startPreview(root, html, port = 0) {
  const service = new Service(root), token = randomBytes(24).toString("hex");
  let origin = "";
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.headers.host !== origin.replace("http://", "")) {
      res.writeHead(403);
      res.end();
      return;
    }
    const url = new URL(req.url || "/", origin);
    if (req.method === "GET" && url.pathname === "/" && url.searchParams.get("token") === token) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        html.replace(
          "<!-- HOST_CONFIG -->",
          `<script>window.__MOOD_TOKEN__=${JSON.stringify(token)};</script>`
        )
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/rpc" && req.headers.authorization === `Bearer ${token}` && (!req.headers.origin || req.headers.origin === origin)) {
      let chunks = [], size = 0;
      try {
        for await (const c of req) {
          size += c.length;
          if (size > 6e5) throw Error("\uC694\uCCAD\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4.");
          chunks.push(c);
        }
        const a = JSON.parse(Buffer.concat(chunks).toString());
        const def = service.tools[a.name];
        if (!def || def.modelOnly)
          throw Error("\uC774 \uB3C4\uAD6C\uB294 Codex \uB300\uD654\uC5D0\uC11C\uB9CC \uC2E4\uD589\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        const out = await service.call(a.name, a.args);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(out));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    res.writeHead(403);
    res.end("\uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB85C\uCEEC \uC2E4\uD589\uAE30\uAC00 \uD45C\uC2DC\uD55C \uC8FC\uC18C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.");
  });
  return new Promise(
    (resolve) => server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      origin = `http://127.0.0.1:${addr.port}`;
      resolve({ server, url: `${origin}/?token=${token}` });
    })
  );
}
export {
  startPreview
};
