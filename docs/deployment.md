# Production deployment

CI runs on GitHub-hosted runners. A release tag such as `v1.2.3` uploads the source to the production server over SSH and builds the image there, so the server does not pull from GHCR.

## Server prerequisites

Install Docker Engine with the Docker Compose plugin. Create a non-root deployment user that can run Docker, then create the application directory:

```bash
sudo mkdir -p /opt/warehouse
sudo chown ubuntu:ubuntu /opt/warehouse
```

Create `/opt/warehouse/.env.prod` on the server. Do not commit it:

```dotenv
POSTGRES_DB=warehouse
POSTGRES_USER=warehouse
POSTGRES_PASSWORD=replace-with-a-long-random-password
AUTH_SECRET=replace-with-a-random-secret-at-least-32-characters-long
AUTH_URL=https://yinfengsuliao.com
IMAGE_REPOSITORY=warehouse-app
```

Keep PostgreSQL private. The production Compose file only exposes the application on `127.0.0.1:3000`; terminate HTTPS through a reverse proxy such as Caddy or Nginx.

## Domain and HTTPS

The production URL is `https://yinfengsuliao.com`; `www.yinfengsuliao.com` also points to the server. Follow the [Nginx and HTTPS runbook](./nginx.md) for DNS, Ubuntu firewall rules, initial certificate issuance, renewal, configuration recovery, and authentication URL changes. The versioned templates are in `ops/nginx/`.

Release deployments copy these templates into `/opt/warehouse/ops/nginx/` for reference. Installing them into `/etc/nginx/` is a separate server administration step. Existing Nginx configuration, Certbot certificates and renewal schedules, and `/opt/warehouse/.env.prod` are preserved during application releases.

Keep certificate private keys and production environment files on the server, outside the repository. Updating `AUTH_URL` requires recreating the application container; restarting Nginx or restarting the existing container does not reload Compose environment values.

## GitHub production environment

Create an Actions environment named `production` and add:

Environment variables:

- `PROD_APP_DIR`: `/opt/warehouse`
- `PROD_URL`: `https://yinfengsuliao.com` (set in GitHub Settings → Environments → production; this controls the deployment link, while the server's `AUTH_URL` controls authentication URLs)

Environment secrets:

- `PROD_HOST`: server hostname or IP address
- `PROD_PORT`: SSH port, normally `22`
- `PROD_USER`: non-root deployment user
- `PROD_SSH_KEY`: private key for the deployment user
- `PROD_KNOWN_HOSTS`: output of `ssh-keyscan` for the server host key

Restrict the environment to protected tags matching `v*` and optionally require manual approval.

## Release

Run CI on `main`, then tag the exact commit to release:

```bash
git switch main
git pull --ff-only
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

The application container runs `prisma migrate deploy` before starting Next.js. Database schema changes should therefore remain backward-compatible with the previous application version.

## Logging

Logging is available only in the separate developer Grafana console, bound to server loopback port 3300 and accessed through an SSH tunnel. Business accounts have no log UI or export endpoint. See [logging operations](./logging.md) for one-time secret generation, the audit-only database role, stack startup, backups and retention.

Releases copy `ops/` and `docker-compose.ops.yml` to the application directory without touching `ops/.secrets/`. The operations stack uses its own Compose project, `warehouse-ops`; business deployments do not restart it. First deploy the business release and wait for migrations, then initialize and start the operations stack separately. Existing installations recreate the business containers once to join the audit network and enable log collection labels.

Mobile alerting uses the separate `notifier` service and requires one-time DingTalk secret configuration. On upgrade, rerun `ops/init-secrets.mjs` to create the new secret files before recreating Grafana. See [mobile alerting](./alerting.md) for rules, persistent retries, phone acceptance tests, and deploying `docker-compose.monitor.yml` on a different host. The application health check now calls `/api/health`, including a read-only database probe. Business releases do not automatically activate or restart the monitoring stack.

## Rollback

Open the **Deploy production** workflow in GitHub Actions, choose **Run workflow**, and provide a previously released tag such as `v1.0.0`. The workflow checks out that tag, rebuilds it on the server, and starts it.
