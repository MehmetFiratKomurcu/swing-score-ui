# Build
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=
ARG VITE_ADMIN_TOKEN=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_ADMIN_TOKEN=${VITE_ADMIN_TOKEN}

RUN npm run build

# Serve static assets (React Router: client-side routes)
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
