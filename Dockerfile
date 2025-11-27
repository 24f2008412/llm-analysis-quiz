FROM node:18-slim

# Install Chromium and libs required by Puppeteer
RUN apt-get update && apt-get install -y \
  chromium \
  libxss1 \
  libnss3 \
  libatk-bridge2.0-0 \
  libgbm1 \
  libasound2 \
  libxshmfence1 \
  libgtk-3-0 \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Prevent Puppeteer from downloading Chromium (we installed system chromium)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm install --production

COPY . .

# Hugging Face uses port 7860 by default for Spaces
ENV PORT=7860
EXPOSE 7860

CMD ["node", "server.js"]
