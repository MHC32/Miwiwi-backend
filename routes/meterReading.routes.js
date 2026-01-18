// routes/meterReading.routes.js
const router = require('express').Router();
const { requireAuth,  isSupervisor, isOwner } = require('../middleware/auth.middleware');
const meterReadingController = require('../controllers/meterReading.controller');


router.get('/stores/:storeId/readings', requireAuth, isOwner, meterReadingController.getStoreReadings);
router.patch('/readings/:id/verify', requireAuth, isSupervisor, meterReadingController.verifyReading);


module.exports = router;