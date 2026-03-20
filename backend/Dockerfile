FROM node:20-slim

WORKDIR /app

# Install system deps needed by puppeteer, sharp, and prisma
RUN apt-get update && apt-get install -y \
    openssl \
    postgresql-client \
    chromium \
    libvips-dev \
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
