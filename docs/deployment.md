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
AUTH_URL=https://warehouse.example.com
IMAGE_REPOSITORY=warehouse-app
```

Keep PostgreSQL private. The production Compose file only exposes the application on `127.0.0.1:3000`; terminate HTTPS through a reverse proxy such as Caddy or Nginx.

## GitHub production environment

Create an Actions environment named `production` and add:

Environment variables:

- `PROD_APP_DIR`: `/opt/warehouse`
- `PROD_URL`: the public URL

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

## Rollback

Open the **Deploy production** workflow in GitHub Actions, choose **Run workflow**, and provide a previously released tag such as `v1.0.0`. The workflow checks out that tag, rebuilds it on the server, and starts it.
