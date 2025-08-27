const express = require('express');
const router = express.Router();
const { requireAuth, isOwner } = require('../middleware/auth.middleware');
const reportController = require('../controllers/report.controller');

router.get('/overview', requireAuth, isOwner, reportController.getOwnerOverview);
router.get('/store/:storeId', requireAuth, isOwner, reportController.getStoreReport);

module.exports = router;