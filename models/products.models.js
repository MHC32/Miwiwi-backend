const mongoose = require('mongoose');
const math = require('mathjs');

// Sous-schéma pour l'historique des modifications
const historySchema = new mongoose.Schema({
  field: String,         // Champ modifié (ex: "pricing.sell_price")
  old_value: mongoose.Schema.Types.Mixed,  // Ancienne valeur
  new_value: mongoose.Schema.Types.Mixed,  // Nouvelle valeur
  changedBy: {          // Qui a fait la modification ?
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Sous-schéma pour les promotions
const promotionSchema = new mongoose.Schema({
  name: String,        // Nom de la promo (ex: "Remise été 2023")
  type: {              // Type de réduction
    type: String,
    enum: ['percentage', 'fixed', 'bundle'],
    required: true
  },
  value: Number,       // Valeur (ex: 10 pour 10% ou 10€)
  condition: {         // Conditions d'application
    min_quantity: Number,  // Quantité minimum
    valid_until: Date      // Date d'expiration
  }
});

// Schéma principal du produit
const productSchema = new mongoose.Schema({
  // Références
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  store_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  category_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },

  // Identification
  name: {
    type: String,
    required: true,
    index: true
  },
  barcode: {
    type: String,
    unique: true,
    index: true
  },

  // NOUVEAU : Type étendu pour inclure 'fuel'
  type: {
    type: String,
    enum: ['quantity', 'weight', 'volume', 'fuel'], // Ajout de 'fuel'
    default: 'quantity'
  },
  // NOUVEAU : Unité étendue pour carburant
  unit: {
    type: String,
    enum: ['g', 'kg', 'L', 'mL', 'unit', 'gallon'], // Ajout de 'gallon'
    required: function () { return this.type !== 'quantity'; }
  },

  // Gestion des stocks
  inventory: {
    current: {
      type: Number,
      required: true,
      min: 0
    },
    min_stock: {
      type: Number,
      default: 5
    },
    alert_enabled: {
      type: Boolean,
      default: true
    }
  },

  // NOUVEAU : Pricing optimisé pour carburant
  pricing: {
    mode: { // Remplace is_fixed
      type: String,
      enum: ['fixed', 'perUnit', 'dynamic', 'fuel'], // Ajout de 'fuel'
      default: 'fixed'
    },
    base_price: Number,
    // NOUVEAU : Spécifique carburant
    fuel_config: {
      price_per_unit: Number, // Ex: 600 pour 600 gourdes/gallon
      display_unit: String // Ex: 'gallon' ou 'L'
    },
    variable_price_rules: [{
      name: String,
      formula: String
    }],
    buy_price: Number,
    promotions: [promotionSchema]
  },

  variants: [{
    name: String,
    price_offset: {
      type: Number,
      default: 0
    }
  }],


  images: [{
    url: {
      type: String,
      required: true
    },
    is_main: {
      type: Boolean,
      default: false
    },
    uploaded_at: {
      type: Date,
      default: Date.now
    }
  }],

  is_active: {
    type: Boolean,
    default: true,
    index: true
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  archivedAt: Date,
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  history: [historySchema]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// NOUVEAU : Méthode spécifique pour carburant
productSchema.methods.calculateFuelTransaction = function (amountPaid) {
  if (this.type !== 'fuel') {
    throw new Error('Cette méthode est réservée aux produits de type fuel');
  }

  return {
    amount: amountPaid,
    quantity: parseFloat((amountPaid / this.pricing.fuel_config.price_per_unit).toFixed(3)),
    unit: this.pricing.fuel_config.display_unit
  };
};

// Index composé pour optimiser les requêtes fréquentes
productSchema.index({ company: 1, name: 1 });

// Méthode pour calculer le prix en fonction de la quantité
productSchema.methods.calculatePrice = function (quantityOrWeight) {
  if (this.pricing.mode === 'fixed' || this.pricing.mode === 'fuel') {
    return this.pricing.base_price;
  } else {
    try {
      const scope = {
        basePrice: this.pricing.base_price,
        quantity: quantityOrWeight,
        weight: quantityOrWeight
      };

      // Pour une règle comme "basePrice * quantity * 0.9" (10% de réduction)
      const rule = this.pricing.variable_price_rules[0];
      return math.evaluate(rule.formula, scope);
    } catch (error) {
      console.error('Erreur calcul prix:', error);
      return this.pricing.base_price; // Fallback au prix de base
    }
  }
};

productSchema.virtual('main_image').get(function () {
  const main = this.images.find(img => img.is_main);
  return main ? main.url : (this.images[0]?.url || null);
});

// Export du modèle
module.exports = mongoose.model('Product', productSchema);