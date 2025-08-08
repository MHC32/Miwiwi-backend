const express = require('express');
const router = express.Router();
const { requireAuth, isOwner } = require('../middleware/auth.middleware');
const {validateCategoryInput, checkCategoryPermissions} = require('../middleware/category.middleware');
const CategoryController = require('../controllers/category.controller');
const categoryModels = require('../models/category.models');

router.post('/categories', requireAuth, isOwner, validateCategoryInput, checkCategoryPermissions, CategoryController.createCategory);
router.get('/categories', requireAuth, isOwner, CategoryController.listMyCategories);
router.patch('/categories/:id', requireAuth, isOwner, CategoryController.updateCategory);
router.patch('/categories/:id/deactivate', requireAuth, isOwner, CategoryController.deactivateCategory);
router.patch('/categories/:id/reactivate', requireAuth, isOwner, CategoryController.reactivateCategory);


module.exports = router;