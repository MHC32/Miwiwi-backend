const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  owner_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    validate: {
      validator: async function(v) {
        const user = await mongoose.model('User').findById(v);
        return user?.role === 'owner';
      },
      message: 'L\'utilisateur doit être un owner'
    }
  },
  ref_code: {
    type: String,
    unique: true,
    default: function() {
      return require('../utils/companyUtils').generateCompanyRef(this.name);
    }
  },
  settings: {
    currency: {
      type: String,
      enum: ['HTG', 'USD', 'EUR'],
      default: 'HTG'
    },
    tax_rate: {
      type: Number,
      min: 0,
      max: 30,
      default: 0
    }
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
   updatedBy: { // Nouveau champ
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
}, { timestamps: true });

module.exports = mongoose.model('Company', companySchema);