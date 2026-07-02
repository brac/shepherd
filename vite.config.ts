import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: { port: 1574, strictPort: true, open: true },
  build: { target: "es2022" },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
