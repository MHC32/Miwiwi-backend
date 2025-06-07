// models/Store.js
const storeSchema = new mongoose.Schema({
  company_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company', 
    required: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  contact: {
    phone: String,
    address: {
      city: String,
      country: { 
        type: String, 
        default: 'HaÏti' }
    }
  },
  supervisor_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  employees: [
    { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    }
  ]
});