import { defineConfig } from "vite";

export default defineConfig({
  base: '/pf2e-hud-owlbear/',
  build: {
    target: "esnext",
  },
  publicDir: "public",
});
