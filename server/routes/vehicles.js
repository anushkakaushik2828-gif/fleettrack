import express from 'express';
import { requireAuth } from '../auth.js';
import { getFleetSummary, getLiveVehicles } from '../lib/fleet.js';

const router = express.Router();
router.use(requireAuth);

router.get('/live', (req, res) => {
  res.json({
    vehicles: getLiveVehicles(),
    summary: getFleetSummary(),
    generatedAt: new Date().toISOString(),
  });
});

export default router;
