# Etapa 1: Construcción de la aplicación React + TypeScript + Vite
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Etapa 2: Servidor web ultraligero Nginx (1 solo worker) para consumo mínimo de RAM y CPU
FROM nginx:1.27-alpine-slim AS production

# Configurar Nginx con 1 único proceso worker y 256 conexiones para usar ~4-6 MB de RAM
RUN sed -i 's/worker_processes  auto;/worker_processes  1;/' /etc/nginx/nginx.conf && \
    sed -i 's/worker_connections  1024;/worker_connections  256;/' /etc/nginx/nginx.conf && \
    rm -rf /docker-entrypoint.d/*

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
