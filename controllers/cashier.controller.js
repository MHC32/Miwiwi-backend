const Product = require('../models/products.models');
const Category = require('../models/category.models');
const Store = require('../models/stores.models');
const Order = require('../models/order.models');
const Proformat = require('../models/proformat.models');
const mongoose = require('mongoose');
const MeterReading = require('../models/meterReading.models');
const { formatImageUrl } = require('../utils/fileUtils');

// ==================== FONCTIONS UTILITAIRES ====================

/**
 * Valider les informations client
 */
const validateClient = (client) => {
  const errors = [];
  
  // Validation du nom (obligatoire)
  if (!client || !client.name || client.name.trim().length === 0) {
    errors.push('Le nom du client est obligatoire');
  } else if (client.name.trim().length > 100) {
    errors.push('Le nom du client ne peut pas dépasser 100 caractères');
  }
  
  // Validation du téléphone (optionnel)
  if (client.phone && !/^[0-9]{8,15}$/.test(client.phone)) {
    errors.push('Le numéro de téléphone doit contenir entre 8 et 15 chiffres');
  }
  
  // Validation de l'email (optionnel)
  if (client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) {
    errors.push('Format d\'email invalide');
  }
  
  // Validation de l'adresse (optionnel)
  if (client.address && client.address.length > 200) {
    errors.push('L\'adresse ne peut pas dépasser 200 caractères');
  }
  
  return errors;
};

/**
 * Traiter les items d'une commande/proformat
 */
async function processItems(items, storeId, session, checkStock = true) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw {
      name: 'ValidationError',
      message: 'Au moins un produit est requis',
      code: 'NO_ITEMS'
    };
  }

  const processedItems = [];
  const productUpdates = [];
  let total = 0;

  for (const item of items) {
    // Récupérer le produit
    const product = await Product.findById(item.product)
      .populate('category_id', 'name')
      .session(session);

    if (!product) {
      throw {
        name: 'ValidationError',
        message: `Produit ${item.product} non trouvé`,
        code: 'PRODUCT_NOT_FOUND'
      };
    }

    if (!product.is_active) {
      throw {
        name: 'ValidationError',
        message: `Le produit "${product.name}" n'est plus disponible`,
        code: 'PRODUCT_INACTIVE'
      };
    }

    // Calculer quantité et prix
    let quantity = parseFloat(item.quantity);
    let unit_price = product.pricing?.base_price || product.price || 0;
    
    // Pour les produits fuel avec montant
    if (item.amount && product.type === 'fuel') {
      const amount = parseFloat(item.amount);
      
      // Utiliser fuel_config si disponible, sinon le prix de base
      const fuelPrice = product.pricing?.fuel_config?.price_per_unit || unit_price;
      
      if (fuelPrice <= 0) {
        throw {
          name: 'ValidationError',
          message: `Configuration prix carburant manquante pour "${product.name}"`,
          code: 'FUEL_CONFIG_MISSING'
        };
      }
      
      quantity = amount / fuelPrice;
      unit_price = fuelPrice;
    }

    // Vérifier le stock (si demandé et si ce n'est pas du fuel)
    if (checkStock && product.type !== 'fuel') {
      const currentStock = product.inventory?.current || 0;
      if (currentStock < quantity) {
        throw {
          name: 'ValidationError',
          message: `Stock insuffisant pour "${product.name}". Disponible: ${currentStock}, demandé: ${quantity}`,
          code: 'INSUFFICIENT_STOCK'
        };
      }
      
      // Préparer la mise à jour du stock
      productUpdates.push({
        updateOne: {
          filter: { _id: product._id },
          update: { $inc: { 'inventory.current': -quantity } }
        }
      });
    }

    const itemTotal = unit_price * quantity;
    total += itemTotal;

    processedItems.push({
      product: product._id,
      product_name: product.name,
      item_type: product.type || 'standard',
      quantity: quantity,
      unit_price: unit_price,
      total: itemTotal,
      unit: product.unit || 'unité',
      variant: item.variant || null,
      variant_name: item.variant_name || null
    });
  }

  return { processedItems, total, productUpdates };
}

/**
 * Convertir les items de proformat en items de commande
 */
function convertProformatItemsToOrder(proformatItems) {
  return proformatItems.map(item => ({
    product: item.product,
    product_name: item.product_name,
    item_type: item.item_type,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total: item.total,
    unit: item.unit,
    variant: item.variant,
    variant_name: item.variant_name
  }));
}

// ==================== CONTROLLERS CATÉGORIES ====================

// Lister toutes les catégories actives
module.exports.listCategories = async (req, res) => {
    try {
        const { storeId } = req.query;
        const cashier = res.locals.user;

        // Vérifier que le caissier a accès au magasin
        if (storeId && !cashier.stores.includes(storeId)) {
            return res.status(403).json({
                success: false,
                message: "Accès non autorisé à ce magasin"
            });
        }

        const query = { 
            is_active: true,
            ...(storeId && { stores: storeId })
        };

        const categories = await Category.find(query)
            .select('_id name icon color')
            .sort({ name: 1 });

        res.status(200).json({
            success: true,
            data: categories
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Erreur serveur'
        });
    }
};

// ==================== CONTROLLERS PRODUITS ====================

// Lister tous les produits actifs
module.exports.listProducts = async (req, res) => {
    try {
        const { storeId, categoryId, search } = req.query;
        const cashier = res.locals.user;

        // Vérifier les permissions
        if (storeId && !cashier.stores.includes(storeId)) {
            return res.status(403).json({
                success: false,
                message: "Accès non autorisé à ce magasin"
            });
        }

        const query = {
            is_active: true,
            store_id: storeId || { $in: cashier.stores }
        };

        if (categoryId) {
            query.category_id = categoryId;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { barcode: { $regex: search, $options: 'i' } }
            ];
        }

        const products = await Product.find(query)
            .select('_id name barcode pricing variants images type unit')
            .populate('category_id', 'name color')
            .sort({ name: 1 });

        // Formater la réponse
        const formattedProducts = products.map(product => ({
            id: product._id,
            name: product.name,
            barcode: product.barcode,
            price: product.pricing.base_price,
            type: product.type,
            unit: product.unit,
            category: product.category_id ? {
                id: product.category_id._id,
                name: product.category_id.name,
                color: product.category_id.color
            } : null,
            image: product.images?.find(img => img.is_main)?.url || 
                   product.images?.[0]?.url || null,
            variants: product.variants || []
        }));

        res.status(200).json({
            success: true,
            data: formattedProducts
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Erreur serveur'
        });
    }
};

// Lister les produits par catégorie
module.exports.listProductsByCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { storeId } = req.query;
        const cashier = res.locals.user;

        // Vérifier que la catégorie existe et est active
        const category = await Category.findOne({
            _id: categoryId,
            is_active: true
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Catégorie non trouvée ou inactive"
            });
        }

        // Vérifier les permissions du magasin
        if (storeId && !cashier.stores.includes(storeId)) {
            return res.status(403).json({
                success: false,
                message: "Accès non autorisé à ce magasin"
            });
        }

        const query = {
            is_active: true,
            category_id: categoryId,
            store_id: storeId || { $in: cashier.stores }
        };

        const products = await Product.find(query)
            .select('_id name barcode pricing variants images')
            .sort({ name: 1 });

        const formattedProducts = products.map(product => ({
            id: product._id,
            name: product.name,
            barcode: product.barcode,
            price: product.pricing.base_price,
            image: product.images?.find(img => img.is_main)?.url || 
                   product.images?.[0]?.url || null,
            variants: product.variants || []
        }));

        res.status(200).json({
            success: true,
            data: {
                category: {
                    id: category._id,
                    name: category.name,
                    color: category.color,
                    icon: category.icon
                },
                products: formattedProducts
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Erreur serveur'
        });
    }
};

// ==================== CONTROLLERS COMMANDES ====================

/**
 * Crée un nouveau ticket/commande - VERSION CORRIGÉE
 */
module.exports.createOrder = async (req, res, next) => {
  let session;
  
  try {
    session = await mongoose.startSession();
    await session.startTransaction();
    
    const { items, storeId } = req.body;
    const cashier = res.locals.user;

    console.log('📥 Données reçues createOrder:', { items, storeId, cashier: cashier._id });

    // =================== 1. VALIDATION RENFORCÉE ===================
    
    // Validation storeId
    if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
      throw {
        name: 'ValidationError',
        message: 'ID de magasin invalide',
        code: 'INVALID_STORE'
      };
    }

    // Validation items
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw {
        name: 'ValidationError',
        message: 'Au moins un produit est requis',
        code: 'INVALID_ITEMS'
      };
    }

    // Vérifier chaque item
    for (const [index, item] of items.entries()) {
      if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
        throw {
          name: 'ValidationError',
          message: `Item ${index + 1}: ID produit invalide`,
          code: 'INVALID_PRODUCT_ID'
        };
      }

      if (item.type === 'fuel' || item.productType === 'fuel') {
        if (!item.amount || item.amount <= 0 || isNaN(item.amount)) {
          throw {
            name: 'ValidationError',
            message: `Item ${index + 1}: Montant carburant invalide`,
            code: 'INVALID_FUEL_AMOUNT'
          };
        }
      } else {
        if (!item.quantity || item.quantity <= 0 || isNaN(item.quantity)) {
          throw {
            name: 'ValidationError',
            message: `Item ${index + 1}: Quantité invalide`,
            code: 'INVALID_QUANTITY'
          };
        }
      }
    }

    // =================== 2. VÉRIFICATION AUTORISATION ===================
    
    const store = await Store.findOne({
      _id: storeId,
      is_active: true,
      $or: [
        { employees: cashier._id },
        { supervisor_id: cashier._id }
      ]
    }).session(session);

    if (!store) {
      throw {
        name: 'AuthorizationError',
        message: 'Accès non autorisé à ce magasin',
        code: 'STORE_ACCESS_DENIED'
      };
    }

    // =================== 3. TRAITEMENT DES ITEMS ===================
    
    const { processedItems, total, productUpdates } = await processItems(
      items,
      storeId,
      session,
      true // checkStock = true pour commande
    );

    // =================== 4. CRÉATION DE LA COMMANDE ===================
    
    const order = new Order({
      cashier: cashier._id,
      items: processedItems,
      total: Math.round(total * 100) / 100,
      payment_status: 'paid',
      status: 'completed',
      store: storeId,
      created_by: cashier._id
    });

    await order.save({ session });

    // =================== 5. MISE À JOUR DES STOCKS ===================
    
    if (productUpdates.length > 0) {
      try {
        const bulkResult = await Product.bulkWrite(productUpdates, { 
          session,
          ordered: true
        });

        if (bulkResult.modifiedCount !== productUpdates.length) {
          throw new Error('Certaines mises à jour de stock ont échoué');
        }
      } catch (bulkError) {
        throw {
          name: 'InventoryError',
          message: 'Erreur lors de la mise à jour des stocks',
          code: 'STOCK_UPDATE_FAILED',
          details: bulkError.message
        };
      }
    }

    // =================== 6. COMMIT TRANSACTION ===================
    
    await session.commitTransaction();

    console.log('✅ Commande créée avec succès:', order._id);

    // =================== 7. RÉPONSE ===================
    
    res.status(201).json({
      success: true,
      data: {
        id: order._id,
        ref_code: order.ref_code,
        store: {
          id: order.store,
          name: store.name
        },
        cashier: {
          id: order.cashier,
          name: `${cashier.first_name} ${cashier.last_name}`
        },
        status: order.status,
        total: order.total,
        payment_status: order.payment_status,
        items: order.items.map(item => ({
          product: {
            id: item.product,
            name: item.product_name,
            type: item.item_type
          },
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          ...(item.unit && { unit: item.unit }),
          ...(item.variant && { 
            variant: item.variant,
            variant_name: item.variant_name 
          })
        })),
        items_count: processedItems.length,
        created_at: order.created_at
      }
    });

  } catch (error) {
    console.error('❌ Erreur createOrder:', error);
    
    if (session) {
      try {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
    }

    const errorTypes = {
      ValidationError: { status: 400, code: error.code || 'VALIDATION_ERROR' },
      AuthorizationError: { status: 403, code: error.code || 'AUTH_ERROR' },
      NotFoundError: { status: 404, code: error.code || 'NOT_FOUND' },
      InventoryError: { status: 400, code: error.code || 'INVENTORY_ERROR' },
      CastError: { status: 400, code: 'INVALID_ID' },
      MongoServerError: { status: 500, code: 'DATABASE_ERROR' },
      default: { status: 500, code: 'SERVER_ERROR' }
    };

    const errorType = errorTypes[error.name] || errorTypes.default;
    
    const response = {
      success: false,
      code: errorType.code,
      message: error.message || 'Une erreur inattendue est survenue',
      ...(process.env.NODE_ENV === 'development' && { 
        stack: error.stack,
        details: error.details 
      })
    };

    res.status(errorType.status).json(response);

  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (sessionError) {
        console.error('Session cleanup failed:', sessionError);
      }
    }
  }
};

// ==================== CONTROLLERS RAPPORTS ====================

module.exports.getCashierReports = async (req, res) => {
  try {
    const { startDate, endDate, storeId } = req.query;
    const cashier = res.locals.user;

    console.log('🔍 DEBUG - Query params:', { startDate, endDate, storeId });

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Les dates de début et de fin sont requises'
      });
    }

    const start = new Date(Date.UTC(
      parseInt(startDate.split('-')[0]),
      parseInt(startDate.split('-')[1]) - 1,
      parseInt(startDate.split('-')[2]),
      0, 0, 0, 0
    ));

    const end = new Date(Date.UTC(
      parseInt(endDate.split('-')[0]),
      parseInt(endDate.split('-')[1]) - 1,
      parseInt(endDate.split('-')[2]),
      23, 59, 59, 999
    ));

    const cashierObjectId = new mongoose.Types.ObjectId(cashier._id);
    const storeObjectIds = cashier.stores.map(store => 
      new mongoose.Types.ObjectId(store.toString())
    );

    let storeFilter = { store: { $in: storeObjectIds } };
    
    if (storeId) {
      const requestedStoreId = new mongoose.Types.ObjectId(storeId);
      
      if (!storeObjectIds.some(storeId => storeId.equals(requestedStoreId))) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce magasin'
        });
      }
      storeFilter.store = requestedStoreId;
    }

    const matchStage = {
      ...storeFilter,
      created_at: { 
        $gte: start, 
        $lte: end 
      },
      cashier: cashierObjectId
    };

    const orders = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalTickets: { $sum: 1 },
          totalAmount: { $sum: '$total' },
          cancelledTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          completedTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      }
    ]);

    const [store] = await Promise.all([
      storeId ? Store.findById(storeId).select('name') : Promise.resolve(null)
    ]);

    const reportData = orders[0] || {
      totalTickets: 0,
      totalAmount: 0,
      cancelledTickets: 0,
      completedTickets: 0
    };

    const response = {
      success: true,
      data: {
        period: {
          startDate: startDate,
          endDate: endDate
        },
        generatedAt: new Date().toISOString(),
        store: store ? { 
          id: store._id, 
          name: store.name 
        } : null,
        tickets: {
          total: reportData.totalTickets,
          completed: reportData.completedTickets,
          cancelled: reportData.cancelledTickets
        },
        financial: {
          totalAmount: reportData.totalAmount || 0,
          averageTicket: reportData.totalTickets > 0 
            ? Math.round((reportData.totalAmount / reportData.totalTickets) * 100) / 100
            : 0
        }
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Report Error:', error);
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur lors de la génération du rapport'
    });
  }
};

module.exports.listTickets = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 10 } = req.query;
    const cashier = res.locals.user;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Les dates de début et de fin sont requises'
      });
    }

    const start = new Date(Date.UTC(
      parseInt(startDate.split('-')[0]),
      parseInt(startDate.split('-')[1]) - 1,
      parseInt(startDate.split('-')[2]),
      0, 0, 0, 0
    ));

    const end = new Date(Date.UTC(
      parseInt(endDate.split('-')[0]),
      parseInt(endDate.split('-')[1]) - 1,
      parseInt(endDate.split('-')[2]),
      23, 59, 59, 999
    ));

    const query = {
      cashier: new mongoose.Types.ObjectId(cashier._id),
      created_at: { 
        $gte: start, 
        $lte: end 
      }
    };

    const tickets = await Order.find(query)
      .select('ref_code total status created_at')
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    const total = await Order.countDocuments(query);

    res.status(200).json({
      success: true,
      data: tickets.map(ticket => ({
        id: ticket._id,
        ref_code: ticket.ref_code,
        total: ticket.total,
        status: ticket.status,
        date: ticket.created_at
      })),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      },
      period: {
        startDate: startDate,
        endDate: endDate
      }
    });

  } catch (error) {
    console.error('List Tickets Error:', error);
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur lors de la récupération des tickets'
    });
  }
};

// ==================== CONTROLLERS RELEVÉS DE COMPTEURS ====================

module.exports.createMeterReading = async (req, res) => {
    try {
      const { storeId, reading_value, reading_type, notes } = req.body;
      const cashier = res.locals.user;

      if (!storeId || !reading_value || !req.file) {
        return res.status(400).json({
          success: false,
          message: 'Store ID, valeur du relevé et photo sont requis'
        });
      }

      if (!cashier.stores.includes(storeId)) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce magasin'
        });
      }

      if (reading_type === 'start') {
        const hasStartReading = await MeterReading.hasStartReading(
          storeId, 
          cashier._id, 
          new Date()
        );

        if (hasStartReading) {
          return res.status(400).json({
            success: false,
            message: 'Un relevé de début existe déjà pour aujourd\'hui'
          });
        }
      }

      const meterReading = await MeterReading.create({
        store: storeId,
        cashier: cashier._id,
        reading_value: parseFloat(reading_value),
        reading_type,
        photo: `/uploads/meter-readings/${req.file.filename}`,
        notes,
        shift_start: reading_type === 'start' ? new Date() : undefined
      });

      res.status(201).json({
        success: true,
        data: {
          id: meterReading._id,
          reading_value: meterReading.reading_value,
          reading_type: meterReading.reading_type,
          photo: formatImageUrl(meterReading.photo),
          status: meterReading.status,
          created_at: meterReading.createdAt
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' 
          ? error.message 
          : 'Erreur lors de la création du relevé'
      });
    }
  }

// ==================== CONTROLLERS PROFORMATS ====================

/**
 * Crée une nouvelle proformat POS
 */
// ==================== CREATE PROFORMAT ====================
module.exports.createProformat = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('📥 Données reçues createProformat:', req.body);
    
    const { items, storeId, client, validity_days = 30, tax_rate = 0, discount_global_percent = 0, notes } = req.body;
    const cashier = req.user;

    // Validation store avec autorisation
    const store = await Store.findOne({
      _id: storeId,
      is_active: true,
      $or: [
        { employees: cashier._id },
        { supervisor_id: cashier._id }
      ]
    }).populate('company_id.settings.currency');

    if (!store) {
      throw createError.Unauthorized('Accès non autorisé à ce magasin', 'STORE_ACCESS_DENIED');
    }

    console.log('✅ Store trouvé:', store.name);

    // Validation client
    const clientErrors = validateClient(client);
    if (clientErrors.length > 0) {
      throw createError.BadRequest(`Données client invalides: ${clientErrors.join(', ')}`);
    }

    console.log('✅ Client validé');

    // ✅ CORRECTION: Traiter les items AVEC calcul des totaux
    const { processedItems, total: subtotal } = await processItems(
      items, 
      storeId, 
      session, 
      false // pas de vérification stock pour proformat
    );

    console.log('✅ Items traités:', processedItems.length);
    console.log('💰 Subtotal calculé:', subtotal);

    // ✅ CORRECTION: Calculer les totaux AVANT création
    const discount_percent = discount_global_percent || 0;
    const discount_amount = subtotal * (discount_percent / 100);
    const taxableAmount = subtotal - discount_amount;
    const tax_amount = taxableAmount * ((tax_rate || 0) / 100);
    const finalTotal = subtotal - discount_amount + tax_amount;

    // Arrondir à 2 décimales
    const roundedTotal = Math.round(finalTotal * 100) / 100;
    const roundedTaxAmount = Math.round(tax_amount * 100) / 100;
    const roundedDiscountAmount = Math.round(discount_amount * 100) / 100;

    // ✅ CORRECTION: Calculer expires_at AVANT création
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + (validity_days || 30));

    console.log('📊 Totaux calculés:', {
      subtotal,
      discount_amount: roundedDiscountAmount,
      tax_amount: roundedTaxAmount,
      total: roundedTotal,
      expires_at: expirationDate
    });

    // ✅ CORRECTION: Créer le proformat avec TOUTES les valeurs requises
    const proformat = new Proformat({
      cashier: cashier._id,
      store: storeId,
      created_by: cashier._id,
      
      client: {
        name: client.name,
        phone: client.phone || undefined,
        email: client.email || undefined,
        address: client.address || undefined
      },
      
      items: processedItems,
      
      // ✅ CRITIQUE: Fournir les valeurs calculées
      subtotal: subtotal,
      tax_rate: tax_rate || 0,
      tax_amount: roundedTaxAmount,
      discount_percent: discount_percent,
      discount_amount: roundedDiscountAmount,
      total: roundedTotal,
      
      validity_days: validity_days || 30,
      expires_at: expirationDate, // ✅ CRITIQUE
      
      currency: store.company_id?.settings?.currency || 'HTG',
      notes: notes || `Proformat créée le ${new Date().toLocaleDateString()}`
    });

    console.log('💾 Sauvegarde du proformat...');
    await proformat.save({ session });

    await session.commitTransaction();
    console.log('✅ Transaction committée avec succès');

    // Réponse formatée
    const response = {
      id: proformat._id,
      ref_code: proformat.ref_code,
      store: {
        id: store._id,
        name: store.name
      },
      client: proformat.client,
      status: proformat.status,
      
      items: proformat.items.map(item => ({
        product_id: item.product,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        unit: item.unit,
        variant_name: item.variant_name
      })),
      
      subtotal: proformat.subtotal,
      tax_rate: proformat.tax_rate,
      tax_amount: proformat.tax_amount,
      discount_percent: proformat.discount_percent,
      discount_amount: proformat.discount_amount,
      total: proformat.total,
      currency: proformat.currency,
      
      validity_days: proformat.validity_days,
      expires_at: proformat.expires_at,
      days_remaining: proformat.days_remaining,
      
      notes: proformat.notes,
      created_at: proformat.created_at
    };

    console.log('✅ Proformat créée avec succès:', response.ref_code);

    res.status(201).json({
      success: true,
      message: 'Proformat créée avec succès',
      data: response
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Erreur createProformat:', error);
    
    if (error.name === 'ValidationError') {
      return next(createError.BadRequest(error.message));
    }
    
    next(error);
  } finally {
    session.endSession();
  }
};
/**
 * Liste les proformats du caissier
 */
module.exports.listProformats = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      startDate, 
      endDate,
      clientName,
      storeId,
      includeExpired = false
    } = req.query;
    
    const cashier = res.locals.user;

    const query = {
      cashier: cashier._id
    };

    if (status) {
      if (status === 'expired') {
        query.status = 'draft';
        query.expires_at = { $lt: new Date() };
      } else {
        query.status = status;
      }
    } else if (!includeExpired) {
      query.$or = [
        { status: { $ne: 'draft' } },
        { 
          status: 'draft',
          expires_at: { $gte: new Date() }
        }
      ];
    }

    if (storeId) {
      const hasAccess = await Store.exists({
        _id: storeId,
        is_active: true,
        $or: [
          { employees: cashier._id },
          { supervisor_id: cashier._id }
        ]
      });

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          code: 'STORE_ACCESS_DENIED',
          message: 'Accès non autorisé à ce magasin'
        });
      }

      query.store = storeId;
    }

    if (startDate && endDate) {
      query.created_at = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (clientName) {
      query['client.name'] = { $regex: clientName, $options: 'i' };
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { created_at: -1 },
      populate: [
        { path: 'store', select: 'name' },
        { path: 'converted_to_order', select: 'ref_code status total' }
      ]
    };

    const result = await Proformat.paginate(query, options);

    const formattedProformats = result.docs.map(proformat => ({
      id: proformat._id,
      ref_code: proformat.ref_code,
      client: {
        name: proformat.client.name,
        phone: proformat.client.phone
      },
      total: proformat.total,
      currency: proformat.currency,
      status: proformat.status,
      expires_at: proformat.expires_at,
      days_remaining: proformat.days_remaining,
      is_expired: proformat.is_expired,
      store: {
        id: proformat.store._id || proformat.store,
        name: proformat.store.name
      },
      items_count: proformat.item_count,
      converted_order: proformat.converted_to_order ? {
        id: proformat.converted_to_order._id,
        ref_code: proformat.converted_to_order.ref_code,
        total: proformat.converted_to_order.total
      } : null,
      created_at: proformat.created_at,
      can_convert: proformat.status === 'draft' && !proformat.is_expired,
      can_reprint: true,
      can_renew: proformat.is_expired || proformat.status === 'expired',
      can_cancel: proformat.status === 'draft'
    }));

    res.status(200).json({
      success: true,
      data: formattedProformats,
      pagination: {
        total: result.totalDocs,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasNext: result.hasNextPage,
        hasPrev: result.hasPrevPage
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Récupère une proformat spécifique du caissier
 */
module.exports.getProformat = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cashier = res.locals.user;

    const proformat = await Proformat.findOne({
      _id: id,
      cashier: cashier._id
    })
    .populate('store', 'name')
    .populate('converted_to_order', 'ref_code status total created_at');

    if (!proformat) {
      return res.status(404).json({
        success: false,
        code: 'PROFORMAT_NOT_FOUND',
        message: 'Proforma non trouvée'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: proformat._id,
        ref_code: proformat.ref_code,
        store: {
          id: proformat.store._id,
          name: proformat.store.name
        },
        client: proformat.client,
        status: proformat.status,
        is_expired: proformat.is_expired,
        days_remaining: proformat.days_remaining,
        expires_at: proformat.expires_at,
        validity_days: proformat.validity_days,
        
        subtotal: proformat.subtotal,
        discount_percent: proformat.discount_percent,
        discount_amount: proformat.discount_amount,
        tax_rate: proformat.tax_rate,
        tax_amount: proformat.tax_amount,
        total: proformat.total,
        currency: proformat.currency,
        
        items: proformat.items.map(item => ({
          product: {
            id: item.product,
            name: item.product_name,
            type: item.item_type
          },
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          ...(item.unit && { unit: item.unit }),
          ...(item.variant && { 
            variant: item.variant,
            variant_name: item.variant_name 
          })
        })),
        items_count: proformat.item_count,
        
        notes: proformat.notes,
        created_at: proformat.created_at,
        updated_at: proformat.updated_at,
        
        converted_order: proformat.converted_to_order ? {
          id: proformat.converted_to_order._id,
          ref_code: proformat.converted_to_order.ref_code,
          total: proformat.converted_to_order.total,
          created_at: proformat.converted_to_order.created_at
        } : null,
        converted_at: proformat.converted_at,
        
        actions: {
          can_convert: proformat.status === 'draft' && !proformat.is_expired,
          can_reprint: true,
          can_renew: proformat.is_expired || proformat.status === 'expired',
          can_cancel: proformat.status === 'draft',
          can_view_order: !!proformat.converted_to_order
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Convertit une proformat en commande
 */
module.exports.convertProformatToOrder = async (req, res, next) => {
  let session;
  
  try {
    session = await mongoose.startSession();
    await session.startTransaction();
    
    const { id } = req.params;
    const cashier = res.locals.user;

    const proformat = await Proformat.findOne({
      _id: id,
      cashier: cashier._id
    }).session(session);

    if (!proformat) {
      throw {
        name: 'NotFoundError',
        message: 'Proforma non trouvée',
        code: 'PROFORMAT_NOT_FOUND'
      };
    }

    if (proformat.status !== 'draft') {
      throw {
        name: 'ValidationError',
        message: 'Seules les proformas en brouillon peuvent être converties',
        code: 'INVALID_STATUS_FOR_CONVERSION'
      };
    }

    if (proformat.is_expired) {
      throw {
        name: 'ValidationError',
        message: 'Proforma expirée, conversion impossible',
        code: 'PROFORMAT_EXPIRED'
      };
    }

    const itemsForValidation = proformat.items.map(item => ({
      product: item.product,
      quantity: item.quantity,
      amount: item.item_type === 'fuel' ? item.total : undefined,
      variant: item.variant
    }));

    const { processedItems, productUpdates } = await processItems(
      itemsForValidation,
      proformat.store,
      session,
      true
    );

    const order = new Order({
      cashier: cashier._id,
      items: convertProformatItemsToOrder(proformat.items),
      total: proformat.total,
      payment_status: 'paid',
      status: 'completed',
      store: proformat.store,
      created_by: cashier._id
    });

    await order.save({ session });

    if (productUpdates.length > 0) {
      const bulkResult = await Product.bulkWrite(
        productUpdates.map(update => ({
          ...update,
          session: session
        })), 
        { session }
      );

      if (bulkResult.modifiedCount !== productUpdates.length) {
        throw new Error('Certaines mises à jour de stock ont échoué');
      }
    }

    await proformat.markAsConverted(order._id);

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      data: {
        conversion: {
          proformat_id: proformat._id,
          proformat_ref: proformat.ref_code,
          order_id: order._id,
          order_ref: order.ref_code,
          converted_at: new Date()
        },
        order: {
          id: order._id,
          ref_code: order.ref_code,
          total: order.total,
          status: order.status,
          payment_status: order.payment_status,
          items_count: order.items.length,
          created_at: order.created_at
        },
        proformat: {
          id: proformat._id,
          ref_code: proformat.ref_code,
          status: 'converted',
          original_total: proformat.total
        }
      },
      message: 'Proforma convertie en commande avec succès'
    });

  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    next(error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};