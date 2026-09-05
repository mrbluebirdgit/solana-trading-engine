import { checkSolscanReadAccess } from "../src/integrations/solscan/read-health.mjs";

try {
  const result = await checkSolscanReadAccess(process.env.SOLSCAN_API_KEY);
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Solscan verification failed");
  process.exitCode = 1;
}
