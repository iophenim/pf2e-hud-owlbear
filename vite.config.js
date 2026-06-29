import { defineConfig } from "vite";

export default defineConfig({
  base: '/pf2e-hud/',
  build: {
    target: "esnext",
  },
  publicDir: "public",
});
