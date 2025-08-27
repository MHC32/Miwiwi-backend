// models/meterReading.models.js
const mongoose = require('mongoose');

const meterReadingSchema = new mongoose.Schema({
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  cashier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reading_value: {
    type: Number,
    required: true,
    min: 0
  },
  reading_type: {
    type: String,
    enum: ['start', 'end', 'adjustment'],
    default: 'start'
  },
  photo: {
    type: String,
    required: true
  },
  notes: {
    type: String,
    maxlength: 500
  },
  verified_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verified_at: Date,
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  shift_start: {
    type: Date,
    default: Date.now
  },
  shift_end: Date
}, {
  timestamps: true
});

// Index pour les requêtes fréquentes
meterReadingSchema.index({ store: 1, cashier: 1, createdAt: -1 });
meterReadingSchema.index({ status: 1 });

// Méthode pour vérifier si un relevé de début existe déjà pour ce shift
meterReadingSchema.statics.hasStartReading = async function(storeId, cashierId, shiftStart) {
  const startOfDay = new Date(shiftStart);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(shiftStart);
  endOfDay.setHours(23, 59, 59, 999);

  return await this.exists({
    store: storeId,
    cashier: cashierId,
    reading_type: 'start',
    createdAt: {
      $gte: startOfDay,
      $lte: endOfDay
    }
  });
};

module.exports = mongoose.model('MeterReading', meterReadingSchema);