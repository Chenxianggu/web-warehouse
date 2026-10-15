import { randomBytes } from "node:crypto";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = new URL("./.secrets/", import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
for (const name of ["grafana_admin_password", "grafana_secret_key", "audit_reader_password"]) {
  try {
    // Files must be readable by the container UID; the parent directory is owner-only.
    await writeFile(new URL(name, directory), randomBytes(32).toString("base64url"), { flag: "wx", mode: 0o444 });
    console.info(`Created ${name}`);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    console.info(`Kept existing ${name}`);
  }
}
console.info(`Grafana username: developer. Password file: ${fileURLToPath(new URL("grafana_admin_password", directory))}`);
