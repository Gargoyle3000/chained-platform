import { createServer } from "node:http";
import { createWorker } from "../lib/http-worker.mjs";
const brokerUrl = process.env.CHAINED_BROKER_URL, workerToken = process.env.CHAINED_IMAGE_WORKER_TOKEN;
if (!brokerUrl || !workerToken) throw new Error("Worker environment is incomplete.");
const handler = createWorker({ brokerUrl, workerToken });
createServer(async (req, res) => { const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, { method: req.method, headers: req.headers, body: req.method === "GET" ? undefined : req, duplex: "half" }); const response = await handler(request); res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); }).listen(Number(process.env.PORT ?? 8080));
