# Ohyna — Render / コンテナ向け（Playwright + Chromium）
# syntax=docker/dockerfile:1

FROM node:22-bookworm AS web
WORKDIR /src
# vite.config.ts が親ディレクトリの VERSION を読む
COPY VERSION ./VERSION
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web ./web
RUN cd web && npm run build

FROM mcr.microsoft.com/playwright/python:v1.62.0-jammy
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8787

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install chromium

COPY VERSION .
COPY ohyna ./ohyna
COPY styles ./styles
COPY themes ./themes
COPY docs ./docs
COPY site ./site
COPY --from=web /src/gui ./gui

EXPOSE 8787
CMD ["sh", "-c", "python -m ohyna serve --host 0.0.0.0 --port ${PORT:-8787}"]
