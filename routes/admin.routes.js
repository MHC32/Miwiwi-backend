const router = require('express').Router();
const {requireAuth, isAdmin} = require('../middleware/auth.middleware');
const adminController = require('../controllers/admin.controller');
const {validateAdminCompanyCreation, companyExists} = require('../middleware/company.middleware')
const {createCompanyForOwner} = require('../controllers/admin.controller')

// User
router.post('/user', requireAuth, isAdmin, adminController.createUser);
router.get('/users', requireAuth, isAdmin, adminController.listAllUsers);
router.patch('/users/:id', requireAuth, isAdmin, adminController.updateUser);
router.delete('/users/:id', requireAuth, isAdmin, adminController.deactivateUser);
router.patch('/users/:id/reactivate', requireAuth, isAdmin,adminController.reactivateUser);


//Company
router.get('/companies', requireAuth, isAdmin, adminController.listAllCompany);
router.post('/companies', requireAuth, isAdmin, companyExists, validateAdminCompanyCreation, createCompanyForOwner);
router.patch('/companies/:id', requireAuth, isAdmin, companyExists, adminController.updateCompanyForOwner)
router.delete('/companies/:id', requireAuth, isAdmin, companyExists, adminController.deleteCompanyForOwner);
router.patch('/companies/:id/reactivate', requireAuth, isAdmin, companyExists, adminController.reactivateCompanyForOwner);


module.exports = router;