const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  company_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  color: {
    type: String,
    default: '#4CAF50',
    validate: {
      validator: v => /^#([0-9A-F]{3}){1,2}$/i.test(v),
      message: 'Couleur hex invalide'
    }
  },
  icon: {
    type: String,
    enum: ['shopping-basket', 'local-drink', 'food', 'cleaning', 'other'],
    default: 'other'
  },
  stores: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store'
  }],
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
   is_active: {
      type: Boolean,
      default: true
    },
    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
}, { 
  timestamps: true,
  toJSON: { virtuals: true } 
});

// Index pour performances
categorySchema.index({ company_id: 1, name: 1 });
categorySchema.index({ parent_id: 1 });

// Virtual pour les sous-catégories
categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent_id'
});

module.exports = mongoose.model('Category', categorySchema);