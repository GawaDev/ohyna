import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import {
  APP_BACKGROUND_COLOR,
  APP_DESCRIPTION,
  APP_MANIFEST_ID,
  APP_NAME,
  APP_NAME_FULL,
  APP_SCOPE,
  APP_START_URL,
  APP_THEME_COLOR,
  APP_TITLE,
} from "./src/appIdentity";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appVersion =
  readFileSync(join(rootDir, "VERSION"), "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#")) ?? "0.0.0";

export default defineConfig({
  define: {
    __OHYNA_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    {
      name: "ohyna-html-identity",
      transformIndexHtml(html) {
        return html
          .replaceAll("__OHYNA_THEME_COLOR__", APP_THEME_COLOR)
          .replaceAll("__OHYNA_TITLE__", APP_TITLE)
          .replaceAll("__OHYNA_DESCRIPTION__", APP_DESCRIPTION)
          .replaceAll("__OHYNA_NAME_FULL__", APP_NAME_FULL);
      },
    },
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.png",
        "ohyna-mark.svg",
        "ohyna-mark.png",
        "og.png",
        "pwa-192.png",
        "pwa-512.png",
        "pwa-maskable-512.png",
        "apple-touch-icon.png",
        "screenshots/wide.png",
        "screenshots/narrow.png",
      ],
      manifest: {
        id: APP_MANIFEST_ID,
        name: APP_NAME,
        short_name: APP_NAME,
        description: APP_DESCRIPTION,
        lang: "ja",
        dir: "ltr",
        start_url: APP_START_URL,
        scope: APP_SCOPE,
        display: "standalone",
        display_override: ["standalone", "minimal-ui", "browser"],
        orientation: "any",
        background_color: APP_BACKGROUND_COLOR,
        theme_color: APP_THEME_COLOR,
        categories: ["productivity", "utilities", "education"],
        prefer_related_applications: false,
        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          {
            src: "screenshots/wide.png",
            sizes: "1280x720",
            type: "image/png",
            form_factor: "wide",
            label: "編集とプレビュー",
          },
          {
            src: "screenshots/narrow.png",
            sizes: "750x1334",
            type: "image/png",
            form_factor: "narrow",
            label: "狭い画面の編集",
          },
        ],
      },
      workbox: {
        // 言語モード同梱でメインバンドルが 2MiB 前後になるため余裕を持たせる
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "/gui/index.html",
        navigateFallbackDenylist: [
          /^\/pdf/,
          /^\/preview/,
          /^\/analyze/,
          /^\/styles/,
          /^\/covers/,
          /^\/health/,
          /^\/docs/,
          /^\/llms/,
          /^\/webmcp\.json/,
          /^\/robots\.txt/,
          /^\/sitemap\.xml/,
          /^\/\.well-known\//,
        ],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,mjs,webmanifest}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              [
                "/pdf",
                "/preview",
                "/analyze",
                "/styles",
                "/covers",
                "/health",
                "/docs",
                "/llms.txt",
                "/llms-full.txt",
                "/webmcp.json",
                "/robots.txt",
                "/sitemap.xml",
              ].some(
                (p) => url.pathname === p || url.pathname.startsWith(`${p}/`)
              ) || url.pathname.startsWith("/.well-known/"),
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  base: "/gui/",
  build: {
    outDir: "../gui",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/pdf": "http://127.0.0.1:1717",
      "/preview": "http://127.0.0.1:1717",
      "/analyze": "http://127.0.0.1:1717",
      "/styles": "http://127.0.0.1:1717",
      "/covers": "http://127.0.0.1:1717",
      "/health": "http://127.0.0.1:1717",
      "/docs": "http://127.0.0.1:1717",
    },
  },
});
