# build the static site, then serve it with nginx; /api is proxied to the backend container (see nginx.conf)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# VITE_SUPABASE_* are read from frontend/.env at build time (publishable key only, safe to ship to the browser)
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
