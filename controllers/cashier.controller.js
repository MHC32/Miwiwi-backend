const Product = require('../models/products.models');
const Category = require('../models/category.models');
const Store = require('../models/stores.models');
const Order = require('../models/order.models');
const mongoose = require('mongoose');
const MeterReading = require('../models/meterReading.models');
const { formatImageUrl } = require('../utils/fileUtils');


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
 * Crée un nouveau ticket/commande
 * @param {Object} req - Requête HTTP
 * @param {Object} res - Réponse HTTP
 */
module.exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();
    
    const { items, storeId } = req.body;
    const cashier = res.locals.user;

    // 1. Validation des données d'entrée
    if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
      throw {
        name: 'ValidationError',
        message: 'ID de magasin invalide',
        code: 'INVALID_STORE'
      };
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw {
        name: 'ValidationError',
        message: 'Au moins un produit est requis',
        code: 'INVALID_ITEMS'
      };
    }

    // Vérifier que le caissier a accès au magasin
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

    // 2. Traitement des articles et vérification des stocks
    let total = 0;
    const processedItems = [];
    const productUpdates = [];

    for (const [index, item] of items.entries()) {
      try {
        if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
          throw {
            name: 'ValidationError',
            message: `Produit ${index + 1}: ID invalide`,
            code: 'INVALID_PRODUCT_ID'
          };
        }

        // Récupérer le produit avec verrouillage de session
        const product = await Product.findById(item.product)
          .session(session)
          .select('name pricing inventory type variants is_active');

        if (!product || !product.is_active) {
          throw {
            name: 'NotFoundError',
            message: `Produit ${index + 1}: Introuvable ou inactif`,
            code: 'PRODUCT_NOT_FOUND'
          };
        }

        // VÉRIFICATION DU STOCK AVANT TOUT (IMPORTANT)
        if (product.type !== 'fuel') {
          if (product.inventory.current < item.quantity) {
            throw {
              name: 'InventoryError',
              message: `Produit ${product.name}: Stock insuffisant`,
              code: 'INSUFFICIENT_STOCK'
            };
          }
        }

        let itemTotal, processedItem;

        if (product.type === 'fuel') {
          // Cas spécial pour le carburant
          if (!item.amount || item.amount <= 0 || isNaN(item.amount)) {
            throw {
              name: 'ValidationError',
              message: `Carburant ${index + 1}: Montant invalide`,
              code: 'INVALID_FUEL_AMOUNT'
            };
          }

          const fuelConfig = product.pricing.fuel_config;
          const quantity = item.amount / fuelConfig.price_per_unit;
          itemTotal = item.amount;

          processedItem = {
            product: product._id,
            quantity: parseFloat(quantity.toFixed(3)),
            unit_price: fuelConfig.price_per_unit,
            total: itemTotal,
            unit: fuelConfig.display_unit,
            product_name: product.name
          };
        } else {
          // Produits standard
          if (!item.quantity || item.quantity <= 0 || isNaN(item.quantity)) {
            throw {
              name: 'ValidationError',
              message: `Produit ${index + 1}: Quantité invalide`,
              code: 'INVALID_QUANTITY'
            };
          }

          // Gestion des variants
          let variant = null;
          let variantName = null;
          
          if (item.variant) {
            variant = product.variants.id(item.variant);
            if (!variant) {
              throw {
                name: 'ValidationError',
                message: `Produit ${index + 1}: Variant introuvable`,
                code: 'VARIANT_NOT_FOUND'
              };
            }
            variantName = variant.name;
          }

          const unitPrice = variant ? 
            product.pricing.base_price + variant.price_offset : 
            product.pricing.base_price;

          itemTotal = unitPrice * item.quantity;

          processedItem = {
            product: product._id,
            quantity: item.quantity,
            unit_price: unitPrice,
            total: itemTotal,
            product_name: product.name,
            ...(variant && { 
              variant: item.variant, 
              variant_name: variantName 
            })
          };

          // Ajouter la mise à jour du stock pour les produits non-carburant
          productUpdates.push({
            updateOne: {
              filter: { _id: product._id },
              update: { $inc: { 'inventory.current': -item.quantity } },
              session: session
            }
          });
        }

        total += itemTotal;
        processedItems.push(processedItem);

      } catch (error) {
        error.itemIndex = index;
        throw error;
      }
    }

    // 3. Création de la commande
    const order = new Order({
      cashier: cashier._id,
      items: processedItems,
      total: total,
      payment_status: 'paid',
      status: 'completed',
      store: storeId,
      created_by: cashier._id
    });

    await order.save({ session });

    // 4. Mise à jour des stocks en une seule opération
    if (productUpdates.length > 0) {
      await Product.bulkWrite(productUpdates, { session });
    }

    // 5. Commit de la transaction
    await session.commitTransaction();

    // 6. Réponse réussie
    res.status(201).json({
      success: true,
      data: {
        id: order._id,
        ref_code: order.ref_code,
        store: order.store,
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
            name: item.product_name
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
        created_at: order.created_at
      }
    });

  } catch (error) {
    // Rollback en cas d'erreur
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    
    console.error('Order Creation Error:', error);

    const errorTypes = {
      ValidationError: { status: 400, code: error.code || 'VALIDATION_ERROR' },
      AuthorizationError: { status: 403, code: error.code || 'AUTH_ERROR' },
      NotFoundError: { status: 404, code: error.code || 'NOT_FOUND' },
      InventoryError: { status: 400, code: error.code || 'INVENTORY_ERROR' },
      default: { status: 500, code: 'SERVER_ERROR' }
    };

    const errorType = errorTypes[error.name] || errorTypes.default;
    
    const response = {
      success: false,
      code: errorType.code,
      message: error.message || 'Erreur serveur',
      ...(error.itemIndex !== undefined && { itemIndex: error.itemIndex })
    };

    if (process.env.NODE_ENV === 'development') {
      response.stack = error.stack;
    }

    res.status(errorType.status).json(response);
  } finally {
    await session.endSession();
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
