import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        },
    },
    build: {
        outDir: "dist",
        sourcemap: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, "index.html"),
                "legacy-bridge": resolve(__dirname, "src/legacy/bridge-entry.ts"),
            },
            output: {
                entryFileNames: (chunkInfo) => chunkInfo.name === "legacy-bridge"
                    ? "assets/[name].js"
                    : "assets/[name]-[hash].js",
            },
        },
    },
});
