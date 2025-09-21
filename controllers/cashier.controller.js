const Product = require('../models/products.models');
const Category = require('../models/category.models');
const Store = require('../models/stores.models');
const Order = require('../models/order.models');
const Proformat = require('../models/proformat.models');
const mongoose = require('mongoose');
const MeterReading = require('../models/meterReading.models');
const { formatImageUrl } = require('../utils/fileUtils');

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



/**
 * Crée un nouveau ticket/commande - VERSION CORRIGÉE
 * @param {Object} req - Requête HTTP
 * @param {Object} res - Réponse HTTP
 */
module.exports.createOrder = async (req, res, next) => {
  let session;
  
  try {
    session = await mongoose.startSession();
    await session.startTransaction();
    
    const { items, storeId } = req.body;
    const cashier = res.locals.user;

    // =================== 1. VALIDATION RENFORCÉE ===================
    
    // Validation storeId
    if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
      throw {
        name: 'ValidationError',
        message: 'ID de magasin invalide',
        code: 'INVALID_STORE'
      };
    }

    // Validation items - CORRECTION DU BUG #1
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw {
        name: 'ValidationError',
        message: 'Au moins un produit est requis',
        code: 'INVALID_ITEMS'
      };
    }

    // NOUVELLE VALIDATION : Vérifier chaque item basiquement
    for (const [index, item] of items.entries()) {
      if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
        throw {
          name: 'ValidationError',
          message: `Item ${index + 1}: ID produit invalide`,
          code: 'INVALID_PRODUCT_ID'
        };
      }

      // Pour les produits carburant : valider 'amount'
      // Pour les autres : valider 'quantity'
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

    // =================== 3. TRAITEMENT SÉCURISÉ DES ITEMS ===================
    
    let total = 0;
    const processedItems = [];
    const productUpdates = [];
    const productIds = items.map(item => item.product);

    // CORRECTION BUG #2 : Récupérer TOUS les produits d'un coup pour éviter les race conditions
    const products = await Product.find({
      _id: { $in: productIds },
      is_active: true
    })
    .session(session)
    .select('name pricing inventory type variants is_active store_id');

    // Vérifier que tous les produits existent
    if (products.length !== productIds.length) {
      const foundIds = products.map(p => p._id.toString());
      const missingIds = productIds.filter(id => !foundIds.includes(id.toString()));
      throw {
        name: 'NotFoundError',
        message: `Produits introuvables: ${missingIds.join(', ')}`,
        code: 'PRODUCTS_NOT_FOUND'
      };
    }

    // Créer un map pour un accès rapide
    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    // =================== 4. VALIDATION ET CALCULS ===================
    
    for (const [index, item] of items.entries()) {
      const product = productMap.get(item.product.toString());
      
      if (!product) {
        throw {
          name: 'NotFoundError',
          message: `Produit ${index + 1}: Introuvable`,
          code: 'PRODUCT_NOT_FOUND'
        };
      }

      // CORRECTION BUG #3 : Vérifier que le produit appartient au bon magasin
      if (product.store_id.toString() !== storeId.toString()) {
        throw {
          name: 'ValidationError',
          message: `Produit ${product.name}: N'appartient pas à ce magasin`,
          code: 'PRODUCT_WRONG_STORE'
        };
      }

      let itemTotal, processedItem;

      if (product.type === 'fuel') {
        // ========= TRAITEMENT CARBURANT =========
        const amount = parseFloat(item.amount);
        
        if (!amount || amount <= 0) {
          throw {
            name: 'ValidationError',
            message: `Carburant ${product.name}: Montant invalide`,
            code: 'INVALID_FUEL_AMOUNT'
          };
        }

        const fuelConfig = product.pricing.fuel_config;
        if (!fuelConfig || !fuelConfig.price_per_unit) {
          throw {
            name: 'ValidationError',
            message: `Carburant ${product.name}: Configuration prix manquante`,
            code: 'FUEL_CONFIG_MISSING'
          };
        }

        const quantity = amount / fuelConfig.price_per_unit;
        itemTotal = amount;

        processedItem = {
          product: product._id,
          quantity: parseFloat(quantity.toFixed(3)),
          unit_price: fuelConfig.price_per_unit,
          total: itemTotal,
          unit: fuelConfig.display_unit || 'L',
          product_name: product.name,
          item_type: 'fuel'
        };

      } else {
        // ========= TRAITEMENT PRODUITS STANDARDS =========
        const quantity = parseFloat(item.quantity);
        
        if (!quantity || quantity <= 0) {
          throw {
            name: 'ValidationError',
            message: `Produit ${product.name}: Quantité invalide`,
            code: 'INVALID_QUANTITY'
          };
        }

        // CORRECTION BUG #2 : VÉRIFICATION STOCK AVANT COMMIT
        if (product.inventory.current < quantity) {
          throw {
            name: 'InventoryError',
            message: `Produit ${product.name}: Stock insuffisant (disponible: ${product.inventory.current}, demandé: ${quantity})`,
            code: 'INSUFFICIENT_STOCK'
          };
        }

        // Gestion des variants
        let variant = null;
        let variantName = null;
        let unitPrice = product.pricing.base_price;
        
        if (item.variant) {
          variant = product.variants.id(item.variant);
          if (!variant) {
            throw {
              name: 'ValidationError',
              message: `Produit ${product.name}: Variant introuvable`,
              code: 'VARIANT_NOT_FOUND'
            };
          }
          variantName = variant.name;
          unitPrice = product.pricing.base_price + (variant.price_offset || 0);
        }

        itemTotal = unitPrice * quantity;

        processedItem = {
          product: product._id,
          quantity: quantity,
          unit_price: unitPrice,
          total: itemTotal,
          product_name: product.name,
          item_type: 'standard',
          ...(variant && { 
            variant: item.variant, 
            variant_name: variantName 
          })
        };

        // Préparation de la mise à jour du stock
        productUpdates.push({
          updateOne: {
            filter: { _id: product._id },
            update: { $inc: { 'inventory.current': -quantity } },
            session: session
          }
        });
      }

      total += itemTotal;
      processedItems.push(processedItem);
    }

    // =================== 5. CRÉATION DE LA COMMANDE ===================
    
    const order = new Order({
      cashier: cashier._id,
      items: processedItems,
      total: Math.round(total * 100) / 100, // Arrondir à 2 décimales
      payment_status: 'paid',
      status: 'completed',
      store: storeId,
      created_by: cashier._id
    });

    await order.save({ session });

    // =================== 6. MISE À JOUR DES STOCKS ===================
    
    // CORRECTION BUG #3 : Mise à jour atomique avec vérification des contraintes
    if (productUpdates.length > 0) {
      try {
        const bulkResult = await Product.bulkWrite(productUpdates, { 
          session,
          ordered: true // Arrêter si une opération échoue
        });

        // Vérifier que toutes les mises à jour ont réussi
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

    // =================== 7. COMMIT TRANSACTION ===================
    
    await session.commitTransaction();

    // =================== 8. RÉPONSE OPTIMISÉE ===================
    
    res.status(201).json({
      success: true,
      data: {
        id: order._id,
        ref_code: order.ref_code,
        store: {
          id: order.store,
          name: store.name // Utiliser les données déjà récupérées
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
    // =================== 9. GESTION D'ERREURS ROBUSTE ===================
    
    // CORRECTION BUG #4 : Rollback sécurisé
    if (session) {
      try {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
    }
    
    console.error('Order Creation Error:', error);

    // Types d'erreurs spécifiques
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
    // =================== 10. NETTOYAGE DES RESSOURCES ===================
    
    if (session) {
      try {
        await session.endSession();
      } catch (sessionError) {
        console.error('Session cleanup failed:', sessionError);
      }
    }
  }
};


module.exports.getCashierReports = async (req, res) => {
  try {
    const { startDate, endDate, storeId } = req.query;
    const cashier = res.locals.user;

    console.log('🔍 DEBUG - Query params:', { startDate, endDate, storeId });
    console.log('🔍 DEBUG - Cashier ID:', cashier._id.toString());
    console.log('🔍 DEBUG - Cashier stores:', cashier.stores);

    // Validation des dates
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Les dates de début et de fin sont requises'
      });
    }

    // CORRECTION TIMEZONE - Utiliser UTC pour toute la journée
    const start = new Date(Date.UTC(
      parseInt(startDate.split('-')[0]),
      parseInt(startDate.split('-')[1]) - 1, // mois 0-based
      parseInt(startDate.split('-')[2]),
      0, 0, 0, 0
    ));

    const end = new Date(Date.UTC(
      parseInt(endDate.split('-')[0]),
      parseInt(endDate.split('-')[1]) - 1,
      parseInt(endDate.split('-')[2]),
      23, 59, 59, 999
    ));

    console.log('🔍 DEBUG - Parsed dates UTC:', { 
      start: start.toISOString(), 
      end: end.toISOString() 
    });

    // Convertir tous les ObjectId proprement
    const cashierObjectId = new mongoose.Types.ObjectId(cashier._id);
    const storeObjectIds = cashier.stores.map(store => 
      new mongoose.Types.ObjectId(store.toString())
    );

    let storeFilter = { store: { $in: storeObjectIds } };
    
    if (storeId) {
      const requestedStoreId = new mongoose.Types.ObjectId(storeId);
      
      // Vérification avec ObjectId.equals() au lieu de string comparison
      if (!storeObjectIds.some(storeId => storeId.equals(requestedStoreId))) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce magasin'
        });
      }
      storeFilter.store = requestedStoreId;
    }

    console.log('🔍 DEBUG - Store filter:', storeFilter);

    // REQUÊTE CORRIGÉE - ObjectId et dates UTC
    const matchStage = {
      ...storeFilter,
      created_at: { 
        $gte: start, 
        $lte: end 
      },
      cashier: cashierObjectId
    };

    console.log('🔍 DEBUG - Match stage:', {
      ...matchStage,
      created_at: {
        $gte: matchStage.created_at.$gte.toISOString(),
        $lte: matchStage.created_at.$lte.toISOString()
      }
    });

    const orders = await Order.aggregate([
      {
        $match: matchStage
      },
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

    console.log('🔍 DEBUG - Aggregation result:', orders);

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
          startDate: startDate, // Utiliser les dates originales pour l'affichage
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

// Controller pour lister les tickets - Version Corrigée
module.exports.listTickets = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 10 } = req.query;
    const cashier = res.locals.user;

    console.log('🔍 DEBUG Tickets - Query params:', { startDate, endDate, page, limit });

    // Validation des dates
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Les dates de début et de fin sont requises'
      });
    }

    // CORRECTION TIMEZONE - Utiliser UTC
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

    console.log('🔍 DEBUG Tickets - Parsed dates UTC:', { 
      start: start.toISOString(), 
      end: end.toISOString() 
    });

    // Construction de la requête - ObjectId et dates UTC
    const query = {
      cashier: new mongoose.Types.ObjectId(cashier._id),
      created_at: { 
        $gte: start, 
        $lte: end 
      }
    };

    console.log('🔍 DEBUG Tickets - Query:', {
      ...query,
      created_at: {
        $gte: query.created_at.$gte.toISOString(),
        $lte: query.created_at.$lte.toISOString()
      }
    });

    // Exécution de la requête avec pagination
    const tickets = await Order.find(query)
      .select('ref_code total status created_at')
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    const total = await Order.countDocuments(query);

    console.log('🔍 DEBUG Tickets - Found:', tickets.length, 'Total:', total);

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
        startDate: startDate, // Dates originales pour l'affichage
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



module.exports.createMeterReading = async (req, res) => {
    try {
      const { storeId, reading_value, reading_type, notes } = req.body;
      const cashier = res.locals.user;

      // Validation
      if (!storeId || !reading_value || !req.file) {
        return res.status(400).json({
          success: false,
          message: 'Store ID, valeur du relevé et photo sont requis'
        });
      }

      // Vérifier que le caissier a accès à ce magasin
      if (!cashier.stores.includes(storeId)) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce magasin'
        });
      }

      // Pour les relevés de début, vérifier qu'il n'y en a pas déjà un aujourd'hui
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

      // Créer le relevé
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


/**
 * Crée une nouvelle proformat POS
 */
module.exports.createProformat = async (req, res, next) => {
  let session;
  
  try {
    session = await mongoose.startSession();
    await session.startTransaction();
    
    const { 
      items, 
      storeId, 
      client, 
      validity_days = 30,
      tax_rate = 0,
      discount_global_percent = 0,
      notes 
    } = req.validatedData || req.body;
    
    const cashier = res.locals.user;

    // 1. VÉRIFICATION AUTORISATION MAGASIN
    const store = await Store.findOne({
      _id: storeId,
      is_active: true,
      $or: [
        { employees: cashier._id },
        { supervisor_id: cashier._id }
      ]
    })
    .populate('company_id', 'settings.currency')
    .session(session);

    if (!store) {
      throw {
        name: 'AuthorizationError',
        message: 'Accès non autorisé à ce magasin',
        code: 'STORE_ACCESS_DENIED'
      };
    }

    // 2. VALIDATION CLIENT
    const clientErrors = validateClient(client);
    if (clientErrors.length > 0) {
      throw {
        name: 'ValidationError',
        message: 'Informations client invalides',
        code: 'INVALID_CLIENT_DATA',
        details: clientErrors
      };
    }

    // 3. TRAITEMENT DES ITEMS (SANS vérification stock pour proformat)
    const { processedItems, total } = await processItems(
      items, 
      storeId, 
      session, 
      false // checkStock = false pour proformat
    );

    // 4. CRÉATION DE LA PROFORMAT
    const currency = store.company_id.settings.currency;
    
    const proformat = new Proformat({
      cashier: cashier._id,
      store: storeId,
      client: {
        name: client.name.trim(),
        phone: client.phone?.trim(),
        email: client.email?.trim(),
        address: client.address?.trim()
      },
      items: processedItems,
      subtotal: total,
      tax_rate: parseFloat(tax_rate) || 0,
      discount_global_percent: parseFloat(discount_global_percent) || 0,
      validity_days: parseInt(validity_days),
      currency: currency,
      notes: notes?.trim(),
      created_by: cashier._id,
      printed_at: new Date(), // Marqué comme imprimé automatiquement
      print_count: 1
    });

    await proformat.save({ session });

    // 5. COMMIT TRANSACTION
    await session.commitTransaction();

    // 6. RÉPONSE FORMATÉE POUR POS
    res.status(201).json({
      success: true,
      data: {
        id: proformat._id,
        ref_code: proformat.ref_code,
        store: {
          id: store._id,
          name: store.name
        },
        client: {
          name: proformat.client.name,
          phone: proformat.client.phone,
          email: proformat.client.email,
          address: proformat.client.address
        },
        status: proformat.status,
        subtotal: proformat.subtotal,
        discount_global_percent: proformat.discount_global_percent,
        discount_global_amount: proformat.discount_global_amount,
        tax_rate: proformat.tax_rate,
        tax_amount: proformat.tax_amount,
        total: proformat.total,
        currency: proformat.currency,
        validity_days: proformat.validity_days,
        expires_at: proformat.expires_at,
        days_remaining: proformat.days_remaining,
        items: proformat.items.map(item => ({
          product: {
            id: item.product,
            name: item.product_name,
            type: item.item_type
          },
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          discount_percent: item.discount_percent || 0,
          ...(item.unit && { unit: item.unit }),
          ...(item.variant && { 
            variant: item.variant,
            variant_name: item.variant_name 
          })
        })),
        items_count: proformat.item_count,
        notes: proformat.notes,
        conditions: proformat.conditions,
        printed_at: proformat.printed_at,
        print_count: proformat.print_count,
        created_at: proformat.created_at
      },
      message: 'Proforma créée avec succès - Prête pour impression'
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

    // CONSTRUCTION de la requête
    const query = {
      cashier: cashier._id
    };

    // Filtrage par statut avec gestion automatique des expirées
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

    // EXÉCUTION avec pagination
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

    // Formater pour interface POS
    const formattedProformats = result.docs.map(proformat => ({
      id: proformat._id,
      ref_code: proformat.ref_code,
      client: {
        name: proformat.client.name,
        phone: proformat.client.phone
      },
      total: proformat.total,
      currency: proformat.currency,
      status: proformat.display_status,
      expires_at: proformat.expires_at,
      days_remaining: proformat.days_remaining,
      is_expired: proformat.is_expired,
      store: {
        id: proformat.store._id || proformat.store,
        name: proformat.store.name
      },
      items_count: proformat.item_count,
      print_count: proformat.print_count,
      converted_order: proformat.converted_to_order ? {
        id: proformat.converted_to_order._id,
        ref_code: proformat.converted_to_order.ref_code,
        total: proformat.converted_to_order.total
      } : null,
      created_at: proformat.created_at,
      // Actions possibles selon statut
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

    // Format détaillé pour POS
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
        status: proformat.display_status,
        is_expired: proformat.is_expired,
        days_remaining: proformat.days_remaining,
        expires_at: proformat.expires_at,
        validity_days: proformat.validity_days,
        
        // Détails financiers
        subtotal: proformat.subtotal,
        discount_global_percent: proformat.discount_global_percent,
        discount_global_amount: proformat.discount_global_amount,
        tax_rate: proformat.tax_rate,
        tax_amount: proformat.tax_amount,
        total: proformat.total,
        currency: proformat.currency,
        
        // Items détaillés
        items: proformat.items.map(item => ({
          product: {
            id: item.product,
            name: item.product_name,
            type: item.item_type
          },
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          discount_percent: item.discount_percent || 0,
          ...(item.unit && { unit: item.unit }),
          ...(item.variant && { 
            variant: item.variant,
            variant_name: item.variant_name 
          })
        })),
        items_count: proformat.item_count,
        
        // Métadonnées
        notes: proformat.notes,
        conditions: proformat.conditions,
        print_count: proformat.print_count,
        printed_at: proformat.printed_at,
        created_at: proformat.created_at,
        updated_at: proformat.updated_at,
        
        // Conversion
        converted_order: proformat.converted_to_order ? {
          id: proformat.converted_to_order._id,
          ref_code: proformat.converted_to_order.ref_code,
          total: proformat.converted_to_order.total,
          created_at: proformat.converted_to_order.created_at
        } : null,
        converted_at: proformat.converted_at,
        
        // Actions possibles
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

    // 1. RÉCUPÉRER la proformat
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

    // 2. VÉRIFICATIONS
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

    // 3. VÉRIFIER les stocks
    const itemsForValidation = proformat.items.map(item => ({
      product: item.product,
      quantity: item.quantity,
      amount: item.item_type === 'fuel' ? item.total : undefined,
      variant: item.variant
    }));

    const { processedItems, total, productUpdates } = await processItems(
      itemsForValidation,
      proformat.store,
      session,
      true // checkStock = true pour conversion
    );

    // 4. CRÉER la commande
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

    // 5. METTRE À JOUR les stocks
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

    // 6. MARQUER la proformat comme convertie
    await proformat.convertToOrder(order._id);

    // 7. COMMIT
    await session.commitTransaction();

    // 8. RÉPONSE POS
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
