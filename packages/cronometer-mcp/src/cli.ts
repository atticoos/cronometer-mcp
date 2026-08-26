#!/usr/bin/env node
import { startStdioServer } from "./index.js";

startStdioServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
