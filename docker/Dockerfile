# Stage 1: build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: build python deps
FROM python:3.11-slim AS backend-builder
WORKDIR /install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 3: final image
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    arp-scan \
    nmap \
    iputils-ping \
    nginx \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY --from=backend-builder /install /usr/local

# Backend
WORKDIR /app
COPY backend/src ./src

# Frontend
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Config files
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN mkdir -p /app/data

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
