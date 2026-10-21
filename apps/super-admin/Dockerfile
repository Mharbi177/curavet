FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/super-admin/package.json ./apps/super-admin/package.json
RUN pnpm install --frozen-lockfile --filter super-admin...
COPY tsconfig.json ./
COPY apps/super-admin ./apps/super-admin
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter super-admin build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/super-admin/dist /usr/share/nginx/html
COPY apps/super-admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
