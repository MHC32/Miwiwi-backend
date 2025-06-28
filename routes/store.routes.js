const router = require('express').Router();
const storeController = require('../controllers/store.controller')
const { requireAuth, isOwner } = require('../middleware/auth.middleware');
const {upload, checkUploadDir} = require('../middleware/storeUpload');

router.post('/stores', requireAuth, isOwner, checkUploadDir, upload.single('photo'), storeController.createStore );
router.patch('/stores/:id', requireAuth, isOwner, checkUploadDir, upload.single('photo'), storeController.updateStore);
router.get('/stores', requireAuth, isOwner, storeController.listOwnerStores);
router.delete('/stores/:id', requireAuth, isOwner, storeController.deleteStore);
router.patch('/stores/:id/activate', requireAuth, storeController.activateStore);
router.patch('/stores/:id/deactivate', requireAuth, storeController.deactivateStore);
router.get('/stores/:id', requireAuth, storeController.getStoreDetails);

module.exports = router;