import { seedDatabase } from './seed.js';
import { config } from './config.js';

try {
  const result = seedDatabase({ force: true });
  console.log(`[fleettrack] Database reset complete at ${config.dbPath}`);
  console.log(result);
} catch (error) {
  console.error('[fleettrack] Failed to reset database:', error);
  process.exitCode = 1;
}
