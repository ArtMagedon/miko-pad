FROM node:22-alpine AS frontend-build

WORKDIR /app
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN mkdir -p public/fonts \
    && cp -R node_modules/@excalidraw/excalidraw/dist/prod/fonts/. public/fonts/ \
    && npm run build

FROM nginx:1.27-alpine
COPY --from=frontend-build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
