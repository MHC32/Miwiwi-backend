const express = require('express');
const router = express.Router();
const { verifyCashier, checkStoreAccess, checkActiveSession } = require('../middleware/cashier.middleware');
const { requireAuth, isCashier } = require('../middleware/auth.middleware');
const cashierController = require('../controllers/cashier.controller');
const { upload, checkUploadDir } = require('../middleware/meterReadingUpload');
const { validateCreateOrder, sanitizeCreateOrder, validateBusinessRules,logCreateOrderAttempt } = require('../middleware/validation.middleware');



// Routes spécifiques
router.get('/categories', requireAuth, isCashier, checkStoreAccess, cashierController.listCategories);
router.get('/products', requireAuth, isCashier,checkStoreAccess, cashierController.listProducts);
router.get('/categories/:categoryId/products', requireAuth, isCashier, checkStoreAccess, cashierController.listProductsByCategory);
router.post('/create-ticket', requireAuth, isCashier, checkStoreAccess, logCreateOrderAttempt,  sanitizeCreateOrder,  validateCreateOrder,  validateBusinessRules,  cashierController.createOrder);
router.get('/reports', requireAuth, isCashier, checkStoreAccess, cashierController.getCashierReports);
router.get('/tickets', requireAuth, isCashier, checkStoreAccess, cashierController.listTickets);
router.post('/readings', requireAuth, isCashier, checkUploadDir, upload.single('photo'), cashierController.createMeterReading);
router.post('/proformats',  requireAuth,  isCashier,  checkStoreAccess,  cashierController.createProformat);
router.get('/proformats',  requireAuth,  isCashier,  cashierController.listProformats);
router.get('/proformats/:id',  requireAuth, isCashier,  cashierController.getProformat);
router.post('/proformats/:id/convert',  requireAuth,  isCashier,  checkStoreAccess,  cashierController.convertProformatToOrder);


module.exports = router;