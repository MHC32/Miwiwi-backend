const express = require('express');
const router = express.Router();
const { requireAuth, isOwner } = require('../middleware/auth.middleware');
const employeeController = require('../controllers/employee.controller');

router.get('/employees', requireAuth, isOwner, employeeController.listOwnerEmployees);
router.post('/employees', requireAuth, isOwner, employeeController.createEmployeeForStore);
router.patch('/employees/:id', requireAuth, isOwner, employeeController.updateEmployee);
router.patch('/employees/:id/activate', requireAuth, isOwner, employeeController.activateEmployee);
router.patch('/employees/:id/deactivate', requireAuth, isOwner, employeeController.deactivateEmployee);
router.get('/employees/:id', requireAuth, isOwner, employeeController.getEmployeeDetails);
module.exports = router;