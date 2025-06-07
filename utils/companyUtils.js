const crypto = require('crypto');
const mongoose = require('mongoose');


module.exports = {
  generateCompanyRef: (name) => {
    const prefix = name 
      ? name.slice(0, 3).replace(/\s+/g, '').toUpperCase()
      : 'COM';
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `${prefix}-${suffix}`;
  },

  validateOwner: async (ownerId) => {
    const user = await mongoose.model('User').findById(ownerId);
    return user?.role === 'owner';
  }
};