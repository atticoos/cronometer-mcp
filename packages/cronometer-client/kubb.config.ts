import { defineConfig } from "kubb";
import { pluginTs } from "@kubb/plugin-ts";

export default defineConfig({
  input: "../../specs/cronometer-mobile.yaml",
  output: { path: "./src/generated", clean: true, extName: { type: ".d.ts" } },
  plugins: [
    pluginTs({
      output: { path: "schemas.d.ts", mode: "single" },
      optionalType: "questionToken",
    }),
  ],
});
