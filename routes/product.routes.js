const router = require('express').Router();
const { requireAuth, isOwner } = require('../middleware/auth.middleware');
const productController = require('../controllers/product.controller');
const { upload: productUpload, checkUploadDir } = require('../middleware/productUpload');

// Routes pour les produits
router.post('/products', requireAuth, isOwner, checkUploadDir, productUpload.array('images', 5), productController.createProduct);
router.get('/products', requireAuth, isOwner, productController.listOwnerProducts);
router.patch('/products/:id', requireAuth, isOwner, checkUploadDir, productUpload.array('images', 5),productController.updateProduct);
router.delete('/products/:id', requireAuth, isOwner, productController.deactivateProduct);
router.patch('/products/:id/reactivate', requireAuth, isOwner, productController.reactivateProduct);

module.exports = router;