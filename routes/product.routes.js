const router = require('express').Router();
const { requireAuth, isOwner } = require('../middleware/auth.middleware');
const productController = require('../controllers/product.controller');
const { productUpload } = require('../utils/uploadUtils'); 
// Routes pour les produits
router.post('/products', requireAuth, isOwner, productUpload.checkUploadDir, productUpload.upload.array('images', 5), productController.createProduct);
router.get('/products', requireAuth, isOwner, productController.listOwnerProducts);
router.patch('/products/:id', requireAuth, isOwner, productUpload.checkUploadDir, productUpload.upload.array('images', 5), productController.updateProduct);
router.delete('/products/:id', requireAuth, isOwner, productController.deactivateProduct);
router.patch('/products/:id/reactivate', requireAuth, isOwner, productController.reactivateProduct);

module.exports = router;