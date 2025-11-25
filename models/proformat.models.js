// models/proformat.models.js - VERSION CORRIGÉE

const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const proformatSchema = new mongoose.Schema({
  ref_code: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomPart = Math.floor(10000 + Math.random() * 90000);
      return `PRO-${datePart}-${randomPart}`;
    }
  },
  
  cashier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  
  // CLIENT INFO
  client: {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    phone: {
      type: String,
      validate: {
        validator: v => !v || /^[0-9]{8,15}$/.test(v),
        message: 'Numéro de téléphone invalide'
      }
    },
    email: {
      type: String,
      validate: {
        validator: v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Email invalide'
      }
    },
    address: {
      type: String,
      maxlength: 200
    }
  },
  
  // ITEMS
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    product_name: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.001
    },
    unit_price: {
      type: Number,
      required: true,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    },
    unit: String,
    variant: {
      type: mongoose.Schema.Types.ObjectId
    },
    variant_name: String
  }],

  // TOTAUX
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  
  tax_rate: {
    type: Number,
    default: 0,
    min: 0,
    max: 50
  },
  
  tax_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  discount_percent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  discount_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  total: {
    type: Number,
    required: true,
    min: 0
  },

  // STATUS
  status: {
    type: String,
    required: true,
    enum: ['draft', 'converted', 'expired', 'cancelled'],
    default: 'draft',
    index: true
  },
  
  // VALIDITÉ
  validity_days: {
    type: Number,
    default: 30,
    min: 1,
    max: 365
  },
  
  expires_at: {
    type: Date,
    required: true, // ✅ On garde required car calculé dans controller
  },
  
  // NOTES
  notes: {
    type: String,
    maxlength: 1000
  },
  
  // DEVISE
  currency: {
    type: String,
    enum: ['HTG', 'USD', 'EUR'],
    default: 'HTG'
  },
  
  // CONVERSION
  converted_to_order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  
  converted_at: Date,
  
  // AUDIT
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }

}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== INDEX ====================
proformatSchema.index({ store: 1, status: 1 });
proformatSchema.index({ cashier: 1, created_at: -1 });
proformatSchema.index({ expires_at: 1 });
proformatSchema.index({ ref_code: 'text', 'client.name': 'text' });

// ==================== VIRTUALS ====================
proformatSchema.virtual('item_count').get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

proformatSchema.virtual('is_expired').get(function () {
  return new Date() > this.expires_at;
});

proformatSchema.virtual('days_remaining').get(function () {
  const now = new Date();
  const diffTime = this.expires_at - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
});

// ==================== MIDDLEWARE ====================
// ✅ SUPPRIMÉ: Le middleware pre('save') qui calculait expires_at et total
// Car ces valeurs sont maintenant calculées dans le controller AVANT création

// ==================== MÉTHODES ====================
proformatSchema.methods.markAsConverted = function(orderId) {
  this.status = 'converted';
  this.converted_to_order = orderId;
  this.converted_at = new Date();
  return this.save();
};

proformatSchema.methods.markAsExpired = function() {
  this.status = 'expired';
  return this.save();
};

proformatSchema.methods.cancel = function() {
  this.status = 'cancelled';
  return this.save();
};

// Plugin
proformatSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Proformat', proformatSchema);