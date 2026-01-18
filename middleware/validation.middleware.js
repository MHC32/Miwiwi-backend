// middleware/validation.middleware.js

const mongoose = require('mongoose');
const Joi = require('joi');

/**
 * Middleware de validation pour create-ticket
 * Valide la structure des données avant traitement
 */
module.exports.validateCreateOrder = (req, res, next) => {
  try {
    // Schéma de validation Joi
    const itemSchema = Joi.object({
      product: Joi.string()
        .hex()
        .length(24)
        .required()
        .messages({
          'string.hex': 'L\'ID produit doit être un ObjectId valide',
          'string.length': 'L\'ID produit doit faire exactement 24 caractères',
          'any.required': 'L\'ID produit est requis'
        }),

      // Pour les produits standards
      quantity: Joi.number()
        .positive()
        .precision(3)
        .when('type', {
          is: Joi.not('fuel'),
          then: Joi.required(),
          otherwise: Joi.optional()
        })
        .messages({
          'number.positive': 'La quantité doit être positive',
          'number.precision': 'Maximum 3 décimales pour la quantité'
        }),

      // Pour les produits carburant
      amount: Joi.number()
        .positive()
        .precision(2)
        .when('type', {
          is: 'fuel',
          then: Joi.required(),
          otherwise: Joi.optional()
        })
        .messages({
          'number.positive': 'Le montant carburant doit être positif',
          'number.precision': 'Maximum 2 décimales pour le montant'
        }),

      // Variant optionnel
      variant: Joi.string()
        .hex()
        .length(24)
        .optional()
        .messages({
          'string.hex': 'L\'ID variant doit être un ObjectId valide',
          'string.length': 'L\'ID variant doit faire exactement 24 caractères'
        }),

      // Type de produit (peut être fourni par le client pour validation)
      type: Joi.string()
        .valid('quantity', 'weight', 'volume', 'fuel')
        .optional(),

      // Données supplémentaires optionnelles
      notes: Joi.string().max(500).optional()
    });

    const mainSchema = Joi.object({
      storeId: Joi.string()
        .hex()
        .length(24)
        .required()
        .messages({
          'string.hex': 'L\'ID magasin doit être un ObjectId valide',
          'string.length': 'L\'ID magasin doit faire exactement 24 caractères',
          'any.required': 'L\'ID magasin est requis'
        }),

      items: Joi.array()
        .items(itemSchema)
        .min(1)
        .max(100) // Limite raisonnable
        .required()
        .messages({
          'array.min': 'Au moins un produit est requis',
          'array.max': 'Maximum 100 produits par commande',
          'any.required': 'La liste des produits est requise'
        }),

      // Métadonnées optionnelles
      notes: Joi.string().max(1000).optional(),
      payment_method: Joi.string()
        .valid('cash', 'card', 'mobile')
        .default('cash')
        .optional()
    });

    // Validation
    const { error, value } = mainSchema.validate(req.body, {
      abortEarly: false, // Retourner toutes les erreurs
      stripUnknown: true, // Supprimer les champs non définis
      convert: true // Convertir les types automatiquement
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Données invalides',
        errors: errorDetails
      });
    }

    // Validation supplémentaire : cohérence des données
    const validationErrors = [];

    for (const [index, item] of value.items.entries()) {
      // Vérifier cohérence quantity/amount selon le type
      if (item.type === 'fuel' && !item.amount) {
        validationErrors.push({
          field: `items[${index}].amount`,
          message: 'Le montant est requis pour les produits carburant'
        });
      }

      if (item.type !== 'fuel' && !item.quantity) {
        validationErrors.push({
          field: `items[${index}].quantity`,
          message: 'La quantité est requise pour les produits non-carburant'
        });
      }

      // Vérifier que les IDs sont des ObjectIds valides
      if (!mongoose.Types.ObjectId.isValid(item.product)) {
        validationErrors.push({
          field: `items[${index}].product`,
          message: 'ID produit invalide'
        });
      }

      if (item.variant && !mongoose.Types.ObjectId.isValid(item.variant)) {
        validationErrors.push({
          field: `items[${index}].variant`,
          message: 'ID variant invalide'
        });
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Erreurs de cohérence détectées',
        errors: validationErrors
      });
    }

    // Ajouter les données validées à la requête
    req.validatedData = value;

    next();

  } catch (error) {
    console.error('Validation middleware error:', error);
    res.status(500).json({
      success: false,
      code: 'VALIDATION_MIDDLEWARE_ERROR',
      message: 'Erreur interne de validation'
    });
  }
};

/**
 * Middleware de sanitisation des données
 * Nettoie et normalise les données entrantes
 */
module.exports.sanitizeCreateOrder = (req, res, next) => {
  try {
    if (!req.body) {
      return next();
    }

    // Nettoyage des chaînes de caractères
    const sanitizeString = (str) => {
      if (typeof str !== 'string') return str;
      return str.trim()
        .replace(/[<>]/g, '') // Supprimer < et >
        .substring(0, 1000); // Limiter la longueur
    };

    // Sanitisation récursive
    const sanitizeObject = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
      }

      if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
      }

      if (typeof obj === 'string') {
        return sanitizeString(obj);
      }

      return obj;
    };

    req.body = sanitizeObject(req.body);
    next();

  } catch (error) {
    console.error('Sanitization error:', error);
    res.status(500).json({
      success: false,
      code: 'SANITIZATION_ERROR',
      message: 'Erreur de nettoyage des données'
    });
  }
};

/**
 * Middleware de validation des business rules
 * Vérifie les règles métier spécifiques
 */
module.exports.validateBusinessRules = async (req, res, next) => {
  try {
    const { storeId, items } = req.validatedData || req.body;
    const cashier = res.locals.user;
    const errors = [];

    // Vérification des limites métier
    const totalItems = items.reduce((sum, item) => {
      return sum + (item.quantity || 1);
    }, 0);

    if (totalItems > 1000) {
      errors.push({
        field: 'items',
        message: 'Nombre total d\'articles trop élevé (max: 1000)'
      });
    }

    // Vérification des montants
    let estimatedTotal = 0;
    for (const item of items) {
      if (item.amount && item.amount > 10000) { // 10,000 dans la devise locale
        errors.push({
          field: 'items',
          message: `Montant trop élevé pour un article (max: 10,000)`
        });
      }
      estimatedTotal += item.amount || (item.quantity * 100); // Estimation grossière
    }

    if (estimatedTotal > 100000) { // 100,000 dans la devise locale
      errors.push({
        field: 'total',
        message: 'Montant total estimé trop élevé'
      });
    }

    // Vérification de la cohérence temporelle
    const now = new Date();
    const businessHours = {
      start: 6, // 6h00
      end: 22   // 22h00
    };

    const currentHour = now.getHours();
    if (currentHour < businessHours.start || currentHour > businessHours.end) {
      // Log mais ne bloque pas (peut être configuré selon les besoins)
      console.warn(`Commande créée hors heures ouvrables: ${currentHour}h`);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        code: 'BUSINESS_RULES_VIOLATION',
        message: 'Violation des règles métier',
        errors: errors
      });
    }

    next();

  } catch (error) {
    console.error('Business rules validation error:', error);
    res.status(500).json({
      success: false,
      code: 'BUSINESS_VALIDATION_ERROR',
      message: 'Erreur de validation métier'
    });
  }
};

/**
 * Middleware de logging des requêtes create-ticket
 * Enregistre les tentatives de création pour audit
 */
module.exports.logCreateOrderAttempt = (req, res, next) => {
  const startTime = Date.now();
  const cashier = res.locals.user;
  const { storeId, items } = req.body;

  // Log de début
  console.log(`CREATE_ORDER_ATTEMPT`, {
    cashier_id: cashier?._id,
    store_id: storeId,
    items_count: Array.isArray(items) ? items.length : 0,
    timestamp: new Date().toISOString(),
    ip: req.ip,
    user_agent: req.get('user-agent')
  });

  // Intercepter la réponse pour logger le résultat
  const originalSend = res.json;
  res.json = function (data) {
    const duration = Date.now() - startTime;

    console.log(`CREATE_ORDER_RESULT`, {
      cashier_id: cashier?._id,
      store_id: storeId,
      success: data.success,
      code: data.code,
      duration_ms: duration,
      order_id: data.data?.id,
      total: data.data?.total,
      timestamp: new Date().toISOString()
    });

    return originalSend.call(this, data);
  };

  next();
};

const signUpSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .required()
    .messages({
      'string.pattern.base': 'Le téléphone doit contenir 10 à 15 chiffres',
      'any.required': 'Le téléphone est requis'
    }),

  first_name: Joi.string()
    .min(2)
    .max(50)
    .required()
    .messages({
      'string.min': 'Le prénom doit contenir au moins 2 caractères',
      'string.max': 'Le prénom ne doit pas dépasser 50 caractères',
      'any.required': 'Le prénom est requis'
    }),

  last_name: Joi.string()
    .min(2)
    .max(50)
    .required()
    .messages({
      'string.min': 'Le nom doit contenir au moins 2 caractères',
      'string.max': 'Le nom ne doit pas dépasser 50 caractères',
      'any.required': 'Le nom est requis'
    }),

  password: Joi.string()
    .min(6)
    .max(128)
    .required()
    .messages({
      'string.min': 'Le mot de passe doit contenir au moins 6 caractères',
      'string.max': 'Le mot de passe ne doit pas dépasser 128 caractères',
      'any.required': 'Le mot de passe est requis'
    }),

  role: Joi.string()
    .valid('owner', 'supervisor', 'cashier', 'customer', 'admin')
    .default('owner')
});

exports.validateSignUp = (req, res, next) => {
  const { error, value } = signUpSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path[0],
      message: detail.message
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation échouée',
      errors
    });
  }

  req.validatedData = value;
  next();
};


const loginSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[0-9]{8,15}$/) // ✅ 8-15 chiffres au lieu de 10-15
    .required()
    .messages({
      'string.pattern.base': 'Le téléphone doit contenir 8 à 15 chiffres',
      'any.required': 'Le téléphone est requis'
    }),
  password: Joi.string()
    .min(6)
    .max(128)
    .required()
    .messages({
      'string.min': 'Le mot de passe doit contenir au moins 6 caractères',
      'string.max': 'Le mot de passe ne doit pas dépasser 128 caractères',
      'any.required': 'Le mot de passe est requis'
    })
});

exports.validateLogin = (req, res, next) => {
  const { error, value } = loginSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path[0],
      message: detail.message
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation échouée',
      errors
    });
  }

  req.validatedData = value;
  next();
};