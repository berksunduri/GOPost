import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: "hidden",
    rollupOptions: {
      external: ["/wails/runtime.js"],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    alias: {
      "/wails/runtime.js": path.resolve(
        __dirname,
        "./src/test/wails-runtime-stub.js",
      ),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**", "src/context/**", "src/api.js", "src/bridge.js"],
      // MockServerContext: v8 remap chokes on JSX in this file (rolldown parse).
      exclude: ["src/context/MockServerContext.jsx", "**/__tests__/**"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});
