# ---- Build the React frontend ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Serve API + static files ----
FROM node:22-alpine
WORKDIR /app
# better-sqlite3 compiles natively — needs python3/make/g++ at install time
RUN apk add --no-cache python3 make g++
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "server/index.js"]
