FROM node:20-slim

WORKDIR /app

# Install system deps: openssl (prisma), pg_isready (entrypoint), chromium (puppeteer PDF)
# Note: sharp uses prebuilt binaries — libvips-dev not needed
RUN apt-get update && apt-get install -y \
    openssl \
    postgresql-client \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Tell puppeteer to use system chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate

COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4100

ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "start"]
