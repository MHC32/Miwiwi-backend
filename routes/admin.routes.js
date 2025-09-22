const router = require('express').Router();
const {requireAuth, isAdmin} = require('../middleware/auth.middleware');
const adminController = require('../controllers/admin.controller');
const {validateAdminCompanyCreation, companyExists} = require('../middleware/company.middleware');
const {validateCategoryInput, checkCategoryPermissions} = require('../middleware/category.middleware')
const CategoryController = require('../controllers/category.controller');
const { upload: productUpload, checkUploadDir } = require('../middleware/productUpload');



// User
router.post('/user', requireAuth, isAdmin, adminController.createUser);
router.get('/users', requireAuth, isAdmin, adminController.listAllUsers);
router.patch('/users/:id', requireAuth, isAdmin, adminController.updateUser);
router.delete('/users/:id', requireAuth, isAdmin, adminController.deactivateUser);
router.patch('/users/:id/reactivate', requireAuth, isAdmin,adminController.reactivateUser);


//Company
router.get('/companies', requireAuth, isAdmin, adminController.listAllCompany);
router.post('/companies', requireAuth, isAdmin, validateAdminCompanyCreation, adminController.createCompanyForOwner);
router.patch('/companies/:id', requireAuth, isAdmin, companyExists, adminController.updateCompanyForOwner)
router.delete('/companies/:id', requireAuth, isAdmin, companyExists, adminController.deleteCompanyForOwner);
router.patch('/companies/:id/reactivate', requireAuth, isAdmin, companyExists, adminController.reactivateCompanyForOwner);


//Stores
router.get('/stores', requireAuth, isAdmin, adminController.listAllStores)
router.post('/stores',requireAuth,isAdmin, adminController.createStoreByAdmin);
router.patch('/stores/:id', requireAuth, isAdmin, adminController.updateStoreForOwner);
router.delete('/stores/:id', requireAuth, isAdmin, adminController.deleteStoreForOwner);
router.patch('/stores/:id', requireAuth, isAdmin, adminController.reactivateStoreForOwner);


//Employee
router.get('/employees', requireAuth, isAdmin, adminController.listAllEmployees);
router.post('/employees', requireAuth, isAdmin, adminController.createEmployeeForStore);
router.patch('/employees/:id', requireAuth, isAdmin, adminController.updateEmployee);
router.delete('/employees/:id', requireAuth, isAdmin, adminController.deactivateEmployee);
router.patch('/employees/:id/reactivate', requireAuth, isAdmin, adminController.reactivateEmployee);
router.get('/employees/:id/stores', requireAuth, isAdmin, adminController.getEmployeeStores);
router.post('/employees/:id/stores', requireAuth, isAdmin, adminController.addEmployeeToStores);
router.delete('/employees/:id/stores', requireAuth, isAdmin, adminController.removeEmployeeFromStores);



//Categorie
router.post('/categories', requireAuth, isAdmin, validateCategoryInput, checkCategoryPermissions, CategoryController.createCategory );
router.get('/categories', requireAuth, isAdmin, adminController.listAllCategories);
router.patch('/categories/:id', requireAuth, isAdmin, adminController.updateCategory);
router.patch('/categories/:id/deactivate', requireAuth, isAdmin, adminController.deactivateCategory);
router.patch('/categories/:id/reactivate', requireAuth, isAdmin, adminController.reactivateCategory);


//Products
router.post('/products',requireAuth, isAdmin, checkUploadDir, productUpload.array('images', 5), adminController.createProduct);
router.get('/products', requireAuth, isAdmin, adminController.listAllProducts);
router.get('/products/:id', requireAuth, isAdmin, adminController.getProductDetails);
router.patch('/products/:id', requireAuth, isAdmin, checkUploadDir, productUpload.array('images', 5), adminController.updateProduct);
router.delete('/products/:id', requireAuth, isAdmin, adminController.deactivateProduct);
router.patch('/products/:id/reactivate', requireAuth, isAdmin, adminController.reactivateProduct);


module.exports = router;