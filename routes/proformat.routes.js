// routes/proformat.routes.js - POUR OWNER/SUPERVISEUR SIMPLE

const express = require('express');
const router = express.Router();

// Middlewares d'authentification
const { requireAuth } = require('../middleware/auth.middleware');
const proformatController = require('../controllers/proformat.controller');

// Middleware pour owner/superviseur
const isOwnerOrSupervisor = (req, res, next) => {
  const user = res.locals.user;
  
  if (!user || !['owner', 'supervisor'].includes(user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Accès réservé aux propriétaires et superviseurs'
    });
  }
  
  next();
};

// ====================== ROUTES OWNER/SUPERVISEUR ======================


router.get('/',requireAuth,  isOwnerOrSupervisor,  proformatController.listAllProformats);
router.get('/:id',  requireAuth,  isOwnerOrSupervisor,  proformatController.getProformat);
router.delete('/:id',  requireAuth,  isOwnerOrSupervisor,  proformatController.deleteProformat);

module.exports = router;