// models/Transaction.js
const transactionSchema = new mongoose.Schema({
  store_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Store', 
    required: true 
  },
  cashier_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  items: [{
    product_id: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Product' 
    },
    quantity: Number,
    weight: Number,
    unit_price: Number
  }],
  payment: {
    method: { 
        type: String,
        enum: ['cash', 'card', 'credit'] },
    amount: Number,
    change_given: Number
  }
}, { timestamps: true });