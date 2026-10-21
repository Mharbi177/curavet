FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/salon-admin/package.json ./apps/salon-admin/package.json
RUN pnpm install --frozen-lockfile --filter salon-admin...
COPY tsconfig.json ./
COPY apps/salon-admin ./apps/salon-admin
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter salon-admin build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/salon-admin/dist /usr/share/nginx/html
COPY apps/salon-admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
