import { randomBytes } from "node:crypto";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = new URL("./.secrets/", import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
for (const name of ["grafana_admin_password", "grafana_secret_key", "audit_reader_password", "alert_webhook_token"]) {
  try {
    // Files must be readable by the container UID; the parent directory is owner-only.
    await writeFile(new URL(name, directory), randomBytes(32).toString("base64url"), { flag: "wx", mode: 0o444 });
    console.info(`Created ${name}`);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    console.info(`Kept existing ${name}`);
  }
}
try {
  await writeFile(new URL("alert_channel.json", directory), JSON.stringify({ channel: "unconfigured", webhook: "", secret: "" }, null, 2) + "\n", { flag: "wx", mode: 0o444 });
  console.info("Created alert_channel.json template (mobile delivery requires configuration)");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.info("Kept existing alert_channel.json");
}
console.info(`Grafana username: developer. Password file: ${fileURLToPath(new URL("grafana_admin_password", directory))}`);
