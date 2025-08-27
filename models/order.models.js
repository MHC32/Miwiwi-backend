const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const orderSchema = new mongoose.Schema({
  ref_code: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomPart = Math.floor(10000 + Math.random() * 90000);
      return `ORD-${datePart}-${randomPart}`;
    }
  },
  cashier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    validate: {
      validator: async function (v) {
        const user = await mongoose.model('User').findById(v);
        return user && user.role === 'cashier';
      },
      message: 'Le caissier doit être un utilisateur valide avec le rôle cashier'
    }
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'cancelled', 'refunded'],
    default: 'pending',
    index: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.001
    },
    total: {
      type: Number,
      required: true
    }
  }],

  total: {
    type: Number,
    required: true,
    min: 0
  },

  payment_status: {
    type: String,
    enum: ['pending', 'paid', 'partially_paid', 'failed'],
    default: 'pending'
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
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

// Index composé pour les requêtes fréquentes
orderSchema.index({ store: 1, status: 1 });
orderSchema.index({ created_at: -1 });
orderSchema.index({ ref_code: 'text' });

// Virtual pour le calcul du nombre d'articles
orderSchema.virtual('item_count').get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// Middleware pour calculer les totaux avant sauvegarde
orderSchema.pre('save', function (next) {
  this.items.forEach(item => {
    item.total = (item.unit_price * item.quantity) * (1 - (item.discount / 100));
  });

  this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
  this.total = this.subtotal + this.tax - this.discount;

  next();
});

// Plugin de pagination
orderSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Order', orderSchema);