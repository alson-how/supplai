FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY apps/web apps/web
RUN npm run build -w @supplai/web
FROM nginx:alpine
COPY --from=build /app/apps/web/dist/web/browser /usr/share/nginx/html
