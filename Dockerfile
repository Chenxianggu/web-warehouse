# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# prisma.config.ts requires DATABASE_URL to exist. prisma generate does not connect.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Keep the complete dependency tree: the container also runs Prisma migrations
# before starting Next.js (the Prisma CLI is a devDependency in this project).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/src/features ./src/features
COPY docker-entrypoint.prod.sh ./docker-entrypoint.prod.sh
RUN sed -i 's/\r$//' ./docker-entrypoint.prod.sh

EXPOSE 3000
ENTRYPOINT ["sh", "./docker-entrypoint.prod.sh"]
CMD ["start"]
