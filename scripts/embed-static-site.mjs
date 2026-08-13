import { readFile, writeFile } from "node:fs/promises";

const files = await Promise.all(
  [
    "index.html",
    "styles.css",
    "config.js",
    "app.js",
    "assets/watercolour-background.png",
    "assets/knotwork-border.png",
    "assets/cmt-wheel-logo.png",
    "assets/wordmark.png",
    "assets/fonts/lora-latin-400-normal.woff2",
    "assets/fonts/lora-latin-600-normal.woff2",
    "assets/fonts/lora-latin-700-normal.woff2",
    "assets/fonts/lora-latin-ext-400-normal.woff2",
    "assets/fonts/lora-latin-ext-600-normal.woff2",
    "assets/fonts/lora-latin-ext-700-normal.woff2",
    "assets/fonts/allura-latin-400-normal.woff2",
    "assets/fonts/allura-latin-ext-400-normal.woff2",
  ].map(async (name) => [
    name,
    await readFile(new URL(`../${name}`, import.meta.url)),
  ]),
);

const binaryExtensions = new Set(["png", "woff2"]);
const assets = Object.fromEntries(files.map(([name, contents]) => {
  const extension = name.split(".").pop();
  return [name, binaryExtensions.has(extension) ? contents.toString("base64") : contents.toString("utf8")];
}));
const source = `const assets = ${JSON.stringify(assets)};

const binaryAssets = new Set(${JSON.stringify(files.filter(([name]) => binaryExtensions.has(name.split(".").pop())).map(([name]) => name))});

const contentTypes = {
  "/": "text/html; charset=utf-8",
  "/index.html": "text/html; charset=utf-8",
  "/styles.css": "text/css; charset=utf-8",
  "/config.js": "text/javascript; charset=utf-8",
  "/app.js": "text/javascript; charset=utf-8",
  "/assets/watercolour-background.png": "image/png",
  "/assets/knotwork-border.png": "image/png",
  "/assets/cmt-wheel-logo.png": "image/png",
  "/assets/wordmark.png": "image/png",
  "/assets/fonts/lora-latin-400-normal.woff2": "font/woff2",
  "/assets/fonts/lora-latin-600-normal.woff2": "font/woff2",
  "/assets/fonts/lora-latin-700-normal.woff2": "font/woff2",
  "/assets/fonts/lora-latin-ext-400-normal.woff2": "font/woff2",
  "/assets/fonts/lora-latin-ext-600-normal.woff2": "font/woff2",
  "/assets/fonts/lora-latin-ext-700-normal.woff2": "font/woff2",
  "/assets/fonts/allura-latin-400-normal.woff2": "font/woff2",
  "/assets/fonts/allura-latin-ext-400-normal.woff2": "font/woff2",
};

export default {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    const name = pathname === "/" ? "index.html" : pathname.slice(1);
    const asset = assets[name];
    if (asset === undefined) return new Response("Not found", { status: 404 });
    const body = binaryAssets.has(name)
      ? Uint8Array.from(atob(asset), (character) => character.charCodeAt(0))
      : asset;
    return new Response(body, {
      headers: {
        "content-type": contentTypes[pathname] || "application/octet-stream",
        "cache-control": pathname === "/" || pathname === "/index.html"
          ? "no-cache"
          : "public, max-age=300",
      },
    });
  },
};
`;

await writeFile(new URL("../worker/index.js", import.meta.url), source);
