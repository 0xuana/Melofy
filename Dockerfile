FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
COPY packages/installed-profile-adapter/package.json packages/installed-profile-adapter/package.json
COPY packages/qqmusic-provider/package.json packages/qqmusic-provider/package.json
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build --workspace @qqmusic-web/web

FROM node:24-alpine AS api
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    QQMUSIC_SESSION_PATH=/data/session.json \
    QQMUSIC_PROFILE_PATH=/data/profile
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./package.json
COPY api ./api
COPY packages ./packages
WORKDIR /app/api
EXPOSE 8787
RUN mkdir -p /data && chown node:node /data
USER node
CMD ["node", "--import", "tsx", "src/main.ts"]

FROM nginx:alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
