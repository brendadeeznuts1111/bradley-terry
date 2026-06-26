# Production image for the Bradley-Terry HTTP ratings service.
FROM oven/bun:1.4.0 AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production \
	PORT=3000 \
	DB_PATH=/data/ratings.db \
	REQUEST_LOG=true \
	REFRESH_RATE_LIMIT=5 \
	REFRESH_RATE_WINDOW=60

RUN mkdir -p /data && chown -R bun:bun /data /app
USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "src/server/index.ts"]
