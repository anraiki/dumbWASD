import { defineConfig } from "vite";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
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
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 5174 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
