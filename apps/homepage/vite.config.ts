import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import vinext from "vinext";

export default defineConfig({
  define: {
    __PREVIEW_PR_NUMBER__: JSON.stringify(process.env.PREVIEW_PR_NUMBER ?? null),
  },
  plugins: [
    tailwindcss(),
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
