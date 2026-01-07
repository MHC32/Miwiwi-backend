const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const {requireAuth} = require('../middleware/auth.middleware')
const { validateSignUp } = require('../middleware/validation.middleware');

router.post('/register', validateSignUp,authController.signUp);
router.post('/login', authController.signIn);
router.post('/logout', authController.logout);
router.post('/login-owner', authController.loginOwner); 
router.get('/owner-data', requireAuth, authController.getOwnerData);
router.post('/cashier/login-step1', authController.loginCashierStep1);
router.post('/cashier/login-step2', authController.loginCashierStep2);
router.post('/cashier/logout',authController.logoutCashier);

module.exports = router;