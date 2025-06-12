// models/Product.js
const productSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  store_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  type: {
    type: String,
    enum: ['quantity', 'weight', 'volume'],
    default: 'quantity'
  },
  name: {
    type: String,
    required: true
  },
  barcode: {
    type: String,
    unique: true
  },
  inventory: {
    current: {
      type: Number,
      required: true,
      min: 0
    },
    min_stock: {
      type: Number,
      default: 5
    },
    alert_enabled: {
      type: Boolean,
      default: true
    }
  },
  pricing: {
    sell_price: {
      type: Number,
      required: true
    },
    buy_price: Number,
    discount_price: Number
  },
  variants: [{
    name: String,
    price_offset: {
      type: Number,
      default: 0
    }
  }],
  category_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },
  archivedAt: Date,
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });