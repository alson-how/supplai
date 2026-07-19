FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm install
COPY apps/api apps/api
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build -w @supplai/api
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/dist dist
COPY --from=build /app/apps/api/prisma prisma
ENV NODE_ENV=production
# Apply migrations (idempotent) then start; the server seeds an empty database.
CMD ["sh","-c","npx prisma migrate deploy --schema=prisma/schema.prisma && node dist/server.js"]
