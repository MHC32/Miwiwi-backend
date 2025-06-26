const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  company_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  photo: {
    type: String, // On stocke le chemin ou l'URL de l'image
    default: null,
    validate: {
      validator: v => {
        if (!v) return true;
        return /\.(jpe?g|png|gif|webp)$/i.test(v);
      },
      message: 'Le format de la photo doit être JPEG, PNG, GIF ou WebP'
    }
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  contact: {
    phone: {
      type: String,
      required: true,
      validate: {
        validator: v => /^[0-9]{8,15}$/.test(v),
        message: 'Numéro de téléphone invalide'
      }
    },
    address: {
      city: {
        type: String,
        required: true,
        trim: true
      },
      country: {
        type: String,
        default: 'Haïti',
        enum: ['Haïti']
      }
    }
  },
  supervisor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    validate: {
      validator: async function (v) {
        if (!v) return true;
        const user = await mongoose.model('User').findById(v);
        return user?.role === 'supervisor';
      },
      message: 'Le superviseur doit avoir le rôle approprié'
    }
  },
  employees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
}, { timestamps: true });

module.exports = mongoose.model('Store', storeSchema)