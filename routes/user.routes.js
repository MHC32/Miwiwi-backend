const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const {requireAuth} = require('../middleware/auth.middleware')




router.post('/register', authController.signUp);
router.post('/login', authController.signIn);
router.get('/logout', authController.logout);
router.post('/login-owner', authController.loginOwner); 
router.get('/owner-data', requireAuth, authController.getOwnerData);
module.exports = router;