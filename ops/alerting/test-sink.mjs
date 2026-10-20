// Explicit verification profile only. Uses the real receiver and durable outbox,
// but never mounts a mobile channel secret or starts a delivery worker.
import { readFile } from "node:fs/promises";
import { Outbox } from "./outbox.mjs";
import { createAlertServer } from "./server.mjs";

const token = (await readFile("/run/secrets/alert_webhook_token", "utf8")).trim();
const outbox = await Outbox.open("/tmp/alert-test-outbox.json");
await outbox.enqueue(null);
createAlertServer({ token, outbox, configured: true }).listen(8080, "0.0.0.0");
