ARG NGINX_IMAGE=public.ecr.aws/docker/library/nginx:1.28-alpine
FROM node:24-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build
FROM ${NGINX_IMAGE}
COPY deploy/local/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
