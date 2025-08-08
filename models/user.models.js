// models/User.js
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const { isEmail } = require('validator');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true
  },
  first_name: {
    type: String,
    required: true,
    minLength: 3,
    maxLength: 55,
  },
  last_name: {
    type: String,
    required: true,
    minLength: 3,
    maxLength: 55,
  },
  email: {
    type: String,
    validate: [isEmail],
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    max: 1024,
    minLength: 6,
  },
  role: {
    type: String,
    enum: ['owner', 'supervisor', 'cashier', 'customer', 'admin'],
    default: 'owner'
  },
  pin_code: {
    type: Number
  },
  is_active: {
    type: Boolean,
    default: true
  },
  stores: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store'
  }],
  supervisedStore: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deactivatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deactivatedAt: Date,
},

  { timestamps: true });

userSchema.pre("save", async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});


userSchema.statics.login = async function (phone, password) {
  if (!phone || !password) {
    throw Error('Tous les champs sont requis');
  }

  const user = await this.findOne({ phone });
  if (!user) {
    throw Error('Numéro de téléphone incorrect');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw Error('Mot de passe incorrect');
  }

  if (!user.is_active) {
    throw Error('Compte désactivé');
  }

  return user;
};

userSchema.plugin(mongoosePaginate)
module.exports = mongoose.model('User', userSchema);

