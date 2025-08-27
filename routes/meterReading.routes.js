// routes/meterReading.routes.js
const router = require('express').Router();
const { requireAuth,  isSupervisor, isOwner } = require('../middleware/auth.middleware');
const meterReadingController = require('../controllers/meterReading.controller');




// Routes pour la consultation
router.get('/stores/:storeId/readings', isOwner, requireAuth, meterReadingController.getStoreReadings);

// Route pour la validation (superviseurs/owners)
router.patch('/readings/:id/verify', isOwner, requireAuth, isSupervisor, meterReadingController.verifyReading);

module.exports = router;