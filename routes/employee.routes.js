const express = require('express');
const router = express.Router();
const { requireAuth, isOwner } = require('../middleware/auth.middleware');
const employeeController = require('../controllers/employee.controller');

router.get('/employees', requireAuth, isOwner, employeeController.listOwnerEmployees);
router.post('/employees', requireAuth, isOwner, employeeController.createEmployeeForStore);
router.patch('/employees/:id', requireAuth, isOwner, employeeController.updateEmployee);

module.exports = router;