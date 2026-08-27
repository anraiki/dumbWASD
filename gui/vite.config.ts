import { defineConfig } from "vite";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  resolve: {
    alias: {
      "@devices": resolve(__dirname, "../devices"),
    },
  },
  clearScreen: false,
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        overlay: resolve(__dirname, "overlay.html"),
      },
    },
  },
  server: {
    port: 5183,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 5184 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    fs: {
      // The @devices alias resolves outside this root, so the dev server
      // has to be told those files may be served.
      allow: [resolve(__dirname), resolve(__dirname, "../devices")],
    },
  },
});
