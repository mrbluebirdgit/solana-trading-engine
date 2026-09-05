import { createServer } from "node:http";

export function startHealthServer({ port, status }) {
  const server = createServer((request, response) => {
    const ready = status().ready;
    if (request.url !== "/healthz" && request.url !== "/readyz") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify(status()));
  });
  server.listen(port, "0.0.0.0");
  return { close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

