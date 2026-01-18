const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const {requireAuth} = require('../middleware/auth.middleware')
const { validateSignUp,validateLogin } = require('../middleware/validation.middleware');

router.post('/register', validateSignUp, authController.signUp);
router.post('/login', validateLogin, authController.signIn);
router.post('/login-owner', validateLogin, authController.loginOwner); 
router.post('/logout', authController.logout);
router.get('/owner-data', requireAuth, authController.getOwnerData);
router.post('/cashier/login-step1', validateLogin, authController.loginCashierStep1);
router.post('/cashier/login-step2', authController.loginCashierStep2);
router.post('/cashier/logout',authController.logoutCashier);

module.exports = router;