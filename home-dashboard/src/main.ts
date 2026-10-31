import { main } from "./cli";

main(process.env).catch((e: unknown) => {
  console.error(`startup failed: ${e instanceof Error ? e.message : "unknown error"}`);
  process.exit(1);
});
