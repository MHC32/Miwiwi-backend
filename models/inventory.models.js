// models/InventoryLog.js
const logSchema = new mongoose.Schema({
  product_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  change: { 
    type: Number, 
    required: true 
}, // +50 ou -2
  new_stock: { 
    type: Number, 
    required: true 
},
  reason: { 
    type: String, 
    enum: ['sale', 'restock', 'adjustment'] 
  }
}, { timestamps: true });