FROM oven/bun:1

WORKDIR /usr/src/app

# Salin dependency files untuk caching layer
COPY app/package.json app/bun.lock ./
RUN bun install --frozen-lockfile

# Salin source files
COPY app/ ./

# Pastikan folder uploads tersedia
RUN mkdir -p uploads

# Expose port (Railway akan menyediakan variabel env PORT)
EXPOSE 3000

ENV NODE_ENV=production

# Jalankan server API
CMD ["bun", "run", "src/index.ts"]

