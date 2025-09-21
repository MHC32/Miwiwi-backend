// controllers/proformat.controller.js - POUR OWNER/SUPERVISEUR SIMPLE

const mongoose = require('mongoose');
const Proformat = require('../models/proformat.models');
const Store = require('../models/stores.models');
const Company = require('../models/company.models');

/**
 * Lister toutes les proformats (Owner/Superviseur)
 */
module.exports.listAllProformats = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status,
      storeId,
      startDate, 
      endDate
    } = req.query;
    
    const user = res.locals.user;

    // 1. Déterminer magasins accessibles
    let accessibleStoreIds = [];

    if (user.role === 'owner') {
      const companies = await Company.find({ owner_id: user._id });
      const companyIds = companies.map(c => c._id);
      const stores = await Store.find({ 
        company_id: { $in: companyIds },
        is_active: true 
      });
      accessibleStoreIds = stores.map(s => s._id);
      
    } else if (user.role === 'supervisor') {
      const store = await Store.findOne({ 
        supervisor_id: user._id,
        is_active: true 
      });
      if (store) {
        accessibleStoreIds = [store._id];
      }
    }

    if (accessibleStoreIds.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Aucun magasin accessible'
      });
    }

    // 2. Construire requête
    const query = {
      store: { $in: accessibleStoreIds }
    };

    if (status) {
      query.status = status;
    }

    if (storeId && user.role === 'owner') {
      if (accessibleStoreIds.some(id => id.toString() === storeId)) {
        query.store = storeId;
      }
    }

    if (startDate && endDate) {
      query.created_at = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // 3. Exécuter requête
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { created_at: -1 },
      populate: [
        { path: 'store', select: 'name' },
        { path: 'cashier', select: 'first_name last_name' },
        { path: 'converted_to_order', select: 'ref_code total' }
      ]
    };

    const result = await Proformat.paginate(query, options);

    const formattedData = result.docs.map(proformat => ({
      id: proformat._id,
      ref_code: proformat.ref_code,
      client: {
        name: proformat.client.name,
        phone: proformat.client.phone
      },
      total: proformat.total,
      currency: proformat.currency,
      status: proformat.status,
      is_expired: proformat.is_expired,
      expires_at: proformat.expires_at,
      store: proformat.store,
      cashier: {
        id: proformat.cashier._id,
        name: `${proformat.cashier.first_name} ${proformat.cashier.last_name}`
      },
      items_count: proformat.item_count,
      converted_order: proformat.converted_to_order,
      created_at: proformat.created_at
    }));

    res.status(200).json({
      success: true,
      data: formattedData,
      pagination: {
        total: result.totalDocs,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Récupérer une proforma spécifique (Owner/Superviseur)
 */
module.exports.getProformat = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = res.locals.user;

    const proformat = await Proformat.findById(id)
      .populate('store', 'name company_id supervisor_id')
      .populate('cashier', 'first_name last_name phone')
      .populate('converted_to_order', 'ref_code status total created_at');

    if (!proformat) {
      return res.status(404).json({
        success: false,
        message: 'Proforma non trouvée'
      });
    }

    // Vérifier permissions
    let hasAccess = false;

    if (user.role === 'owner') {
      const company = await Company.findOne({
        _id: proformat.store.company_id,
        owner_id: user._id
      });
      hasAccess = !!company;
    } else if (user.role === 'supervisor') {
      hasAccess = proformat.store.supervisor_id?.toString() === user._id.toString();
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette proforma'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: proformat._id,
        ref_code: proformat.ref_code,
        client: proformat.client,
        store: proformat.store,
        cashier: {
          id: proformat.cashier._id,
          name: `${proformat.cashier.first_name} ${proformat.cashier.last_name}`,
          phone: proformat.cashier.phone
        },
        status: proformat.status,
        is_expired: proformat.is_expired,
        days_remaining: proformat.days_remaining,
        expires_at: proformat.expires_at,
        validity_days: proformat.validity_days,
        
        // Détails financiers
        subtotal: proformat.subtotal,
        discount_percent: proformat.discount_percent,
        discount_amount: proformat.discount_amount,
        tax_rate: proformat.tax_rate,
        tax_amount: proformat.tax_amount,
        total: proformat.total,
        currency: proformat.currency,
        
        // Items
        items: proformat.items,
        items_count: proformat.item_count,
        
        notes: proformat.notes,
        converted_order: proformat.converted_to_order,
        converted_at: proformat.converted_at,
        created_at: proformat.created_at,
        updated_at: proformat.updated_at
      }
    });

  } catch (error) {
    next(error);
  }
};
/**
 * Supprimer une proforma (Owner/Superviseur)
 */
module.exports.deleteProformat = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = res.locals.user;

    const proformat = await Proformat.findById(id)
      .populate('store', 'company_id supervisor_id');

    if (!proformat) {
      return res.status(404).json({
        success: false,
        message: 'Proforma non trouvée'
      });
    }

    // Vérifier permissions
    let hasAccess = false;

    if (user.role === 'owner') {
      const company = await Company.findOne({
        _id: proformat.store.company_id,
        owner_id: user._id
      });
      hasAccess = !!company;
      
    } else if (user.role === 'supervisor') {
      hasAccess = proformat.store.supervisor_id?.toString() === user._id.toString();
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Vous ne pouvez pas supprimer cette proforma'
      });
    }

    // Vérifier si suppression possible
    if (proformat.status === 'converted') {
      return res.status(400).json({
        success: false,
        message: 'Impossible de supprimer une proforma convertie'
      });
    }

    // Soft delete
    await proformat.cancel();

    res.status(200).json({
      success: true,
      message: 'Proforma supprimée avec succès'
    });

  } catch (error) {
    next(error);
  }
};