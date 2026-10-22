FROM node:22-bookworm-slim
WORKDIR /opt
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
CMD ["node", "/opt/agent/server.mjs"]
