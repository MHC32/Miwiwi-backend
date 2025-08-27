const express = require('express');
const router = express.Router();
const { verifyCashier, checkStoreAccess, checkActiveSession } = require('../middleware/cashier.middleware');
const { requireAuth, isCashier } = require('../middleware/auth.middleware');
const cashierController = require('../controllers/cashier.controller');
const { upload, checkUploadDir } = require('../middleware/meterReadingUpload');


// Routes spécifiques
router.get('/categories', requireAuth, isCashier, checkStoreAccess, cashierController.listCategories);
router.get('/products', requireAuth, isCashier,checkStoreAccess, cashierController.listProducts);
router.get('/categories/:categoryId/products', requireAuth, isCashier, checkStoreAccess, cashierController.listProductsByCategory);
router.post('/create-ticket', requireAuth, isCashier, checkStoreAccess, cashierController.createOrder);
router.get('/reports', requireAuth, isCashier, checkStoreAccess, cashierController.getCashierReports);
router.get('/tickets', requireAuth, isCashier, checkStoreAccess, cashierController.listTickets);
router.post('/readings', requireAuth, isCashier, checkUploadDir, upload.single('photo'), cashierController.createMeterReading);

module.exports = router;