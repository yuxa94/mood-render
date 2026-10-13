import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { Service } from "./service.js";
export function startPreview(root: string, html: string, port = 0) {
  const service = new Service(root),
    token = randomBytes(24).toString("hex");
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
    if (
      req.method === "GET" &&
      url.pathname === "/" &&
      url.searchParams.get("token") === token
    ) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        html.replace(
          "<!-- HOST_CONFIG -->",
          `<script>window.__MOOD_TOKEN__=${JSON.stringify(token)};</script>`,
        ),
      );
      return;
    }
    if (
      req.method === "POST" &&
      url.pathname === "/rpc" &&
      req.headers.authorization === `Bearer ${token}` &&
      (!req.headers.origin || req.headers.origin === origin)
    ) {
      let chunks: Buffer[] = [],
        size = 0;
      try {
        for await (const c of req) {
          size += c.length;
          if (size > 600000) throw Error("요청이 너무 큽니다.");
          chunks.push(c);
        }
        const a = JSON.parse(Buffer.concat(chunks).toString());
        const def = service.tools[a.name];
        if (!def || def.modelOnly)
          throw Error("이 도구는 Codex 대화에서만 실행할 수 있습니다.");
        const out = await service.call(a.name, a.args);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(out));
      } catch (e: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    res.writeHead(403);
    res.end("접근할 수 없습니다. 로컬 실행기가 표시한 주소를 사용하세요.");
  });
  return new Promise<{ server: ReturnType<typeof createServer>; url: string }>(
    (resolve) =>
      server.listen(port, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        origin = `http://127.0.0.1:${addr.port}`;
        resolve({ server, url: `${origin}/?token=${token}` });
      }),
  );
}
