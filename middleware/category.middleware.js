const mongoose = require('mongoose');
const Company = require('../models/company.models');
const Store = require('../models/stores.models');

// Validation des données d'entrée
exports.validateCategoryInput = (req, res, next) => {
  const { name, storeIds } = req.body;
  
  if (!name || typeof name !== 'string' || name.length > 50) {
    return res.status(400).json({ 
      success: false,
      message: 'Nom de catégorie invalide (1-50 caractères)'
    });
  }

  if (storeIds && (!Array.isArray(storeIds) || storeIds.some(id => !mongoose.Types.ObjectId.isValid(id)))) {
                                                   
    return res.status(400).json({
      success: false,
      message: 'Liste de magasins invalide'
    });
  }

  next();
};


// Vérification des permissions
exports.checkCategoryPermissions = async (req, res, next) => {
  const user = res.locals.user;
  const { company_id, storeIds } = req.body;

  try {
    // 1. Admins peuvent tout faire
    if (user.role === 'admin') {
      if (company_id && !mongoose.Types.ObjectId.isValid(company_id)) {
        return res.status(400).json({ message: 'Company ID invalide' });
      }
      return next();
    }

    // 2. Pour les owners
    if (user.role === 'owner') {
      // Trouver la company de l'owner
      const company = await Company.findOne({ owner_id: user._id });
      
      if (!company) {
        return res.status(403).json({ 
          success: false,
          message: 'Aucune entreprise associée à votre compte' 
        });
      }

      // Vérification des stores
      if (storeIds?.length > 0) {
        const validStores = await Store.countDocuments({
          _id: { $in: storeIds },
          company_id: company._id
        });

        if (validStores !== storeIds.length) {
          return res.status(403).json({
            success: false,
            message: 'Un ou plusieurs magasins ne sont pas dans votre entreprise'
          });
        }
      }

      req.body.company_id = company._id; // Injection sécurisée
      return next();
    }

    // 3. Autres rôles
    return res.status(403).json({
      success: false,
      message: 'Action réservée aux admins et owners'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur de vérification des permissions'
    });
  }
};