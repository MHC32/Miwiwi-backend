const router = require('express').Router();
const { requireAuth, isOwner } = require('../middleware/auth.middleware');
const {createMyCompany, updateCompany} = require('../controllers/company.controller');


router.post('/my-company', requireAuth, isOwner, createMyCompany);
router.patch('/my-company/:id', requireAuth, isOwner, updateCompany);

module.exports = router;