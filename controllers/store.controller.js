const Store = require('../models/stores.models');
const Company = require('../models/company.models');
const mongoose = require('mongoose');


module.exports.createStore = async (req, res) => {
  try {
    const { name, contact, supervisor_id } = req.body;
    const currentUser = res.locals.user;

    if (currentUser.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Action réservée aux propriétaires'
      });
    }

    const company = await Company.findOne({ owner_id: currentUser._id });
    if (!company) {
      return res.status(400).json({
        success: false,
        message: 'Aucune entreprise associée à votre compte'
      });
    }

    if (!name || !contact?.phone || !contact?.address?.city) {
      return res.status(400).json({
        success: false,
        message: 'Nom, téléphone et ville sont obligatoires'
      });
    }

    const newStore = await Store.create({
      name,
      company_id: company._id,
      contact: {
        phone: contact.phone,
        address: {
          city: contact.address.city,
          country: contact.address.country || 'Haïti'
        }
      },
      supervisor_id,
      created_by: currentUser._id
    });

    res.status(201).json({
      success: true,
      data: {
        id: newStore._id,
        name: newStore.name,
        company_id: newStore.company_id,
        contact: newStore.contact
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur serveur'
    });
  }
};


module.exports.updateStore = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const currentUser = res.locals.user;

  try {
    if (currentUser.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Action réservée aux propriétaires'
      });
    }

    const store = await Store.findById(id).populate('company_id', 'owner_id');
    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store non trouvé'
      });
    }

    if (store.company_id.owner_id.toString() !== currentUser._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Vous ne possédez pas ce store'
      });
    }

    const allowedUpdates = {
      name: { type: 'string', maxLength: 50 },
      'contact.phone': { type: 'string', pattern: /^[0-9]{8,15}$/ },
      'contact.address.city': { type: 'string' },
      'contact.address.country': { type: 'string', enum: ['Haïti'] },
      supervisor_id: { type: 'ObjectId', ref: 'User' },
      is_active: { type: 'boolean' }
    };

    const updateObj = {};
    const errors = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'contact') {
        if (value.phone && allowedUpdates['contact.phone']) {
          if (!allowedUpdates['contact.phone'].pattern.test(value.phone)) {
            errors.push('Numéro de téléphone invalide');
          } else {
            updateObj['contact.phone'] = value.phone;
          }
        }

        if (value.address) {
          if (value.address.city && allowedUpdates['contact.address.city']) {
            updateObj['contact.address.city'] = value.address.city;
          }
          if (value.address.country && allowedUpdates['contact.address.country']) {
            if (!allowedUpdates['contact.address.country'].enum.includes(value.address.country)) {
              errors.push('Pays non valide');
            } else {
              updateObj['contact.address.country'] = value.address.country;
            }
          }
        }
      } else if (allowedUpdates[key]) {
        if (typeof value !== allowedUpdates[key].type) {
          errors.push(`Le champ ${key} doit être de type ${allowedUpdates[key].type}`);
        } else {
          updateObj[key] = value;
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors
      });
    }

    const updatedStore = await Store.findByIdAndUpdate(
      id,
      { $set: updateObj },
      {
        new: true,
        runValidators: true,
        select: '-__v -created_at -updated_at'
      }
    );

    res.status(200).json({
      success: true,
      data: {
        id: updatedStore._id,
        name: updatedStore.name,
        contact: updatedStore.contact,
        is_active: updatedStore.is_active,
        supervisor_id: updatedStore.supervisor_id
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development'
        ? error.message
        : 'Erreur serveur'
    });
  }
};


module.exports.listOwnerStores = async (req, res) => {
  const currentUser = res.locals.user;
  const { 
    page = 1, 
    limit = 10, 
    search, 
    is_active,
    sortBy = 'name', 
    sortOrder = 'asc' 
  } = req.query;

  try {
   
    if (currentUser.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Réservé aux propriétaires'
      });
    }

    const company = await Company.findOne({ owner_id: currentUser._id });
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Aucune entreprise associée à votre compte'
      });
    }

    const query = { company_id: company._id };

    if (is_active !== undefined) {
      query.is_active = is_active === 'true';
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'contact.phone': { $regex: search, $options: 'i' } },
        { 'contact.address.city': { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const stores = await Store.find(query)
      .populate('supervisor_id', 'first_name last_name phone')
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('-__v -created_at -updated_at -company_id');

    const total = await Store.countDocuments(query);

    const response = {
      success: true,
      data: stores.map(store => ({
        id: store._id,
        name: store.name,
        contact: {
          phone: store.contact.phone,
          address: {
            city: store.contact.address.city,
            country: store.contact.address.country
          }
        },
        supervisor: store.supervisor_id ? {
          name: `${store.supervisor_id.first_name} ${store.supervisor_id.last_name}`,
          phone: store.supervisor_id.phone
        } : null,
        is_active: store.is_active,
        employees_count: store.employees?.length || 0
      })),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      },
      company_info: {
        name: company.name,
        total_stores: total
      }
    };

    res.status(200).json(response);

  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur serveur'
    });
  }
};

module.exports.deleteStore = async (req, res) => {
  const { id } = req.params;
  const currentUser = res.locals.user;
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();

    if (currentUser.role !== 'owner') {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: 'Action réservée aux propriétaires'
      });
    }

    const store = await Store.findById(id)
      .populate('company_id', 'owner_id')
      .session(session);

    if (!store) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Magasin non trouvé'
      });
    }

    if (store.company_id.owner_id.toString() !== currentUser._id.toString()) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: 'Vous ne possédez pas ce magasin'
      });
    }

    if (store.deletedAt) {
      await session.abortTransaction();
      return res.status(410).json({
        success: false,
        message: 'Ce magasin a déjà été supprimé'
      });
    }

    await Store.findByIdAndUpdate(
      id,
      {
        $set: {
          deletedAt: new Date(),
          deletedBy: currentUser._id,
          is_active: false
        }
      },
      { new: true, session }
    );


    await mongoose.model('User').updateMany(
      { _id: { $in: store.employees } },
      { $pull: { stores: id } },
      { session }
    );


    if (store.supervisor_id) {
      await mongoose.model('User').findByIdAndUpdate(
        store.supervisor_id,
        { $unset: { supervisedStore: "" } },
        { session }
      );
    }

    await mongoose.model('Product').updateMany(
      { store_id: id },
      {
        $set: {
          is_active: false,
          archivedAt: new Date(),
          archivedBy: currentUser._id
        }
      },
      { session }
    );

    await mongoose.model('Category').updateMany(
      { stores: id },
      { $pull: { stores: id } },
      { session }
    );

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: 'Magasin supprimé et références nettoyées avec succès',
      data: {
        id: store._id,
        name: store.name,
        deleted_at: new Date()
      }
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur lors de la suppression du magasin'
    });
  } finally {
    session.endSession();
  }
};

module.exports.deactivateStore = async (req, res) => {
  const { id } = req.params;
  const currentUser = res.locals.user;

  try {
    // Trouver le store avec les informations de l'entreprise et du superviseur
    const store = await Store.findById(id)
      .populate('company_id', 'owner_id')
      .populate('supervisor_id', '_id');

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store non trouvé'
      });
    }

    // Vérifier les permissions
    if (currentUser.role === 'owner') {
      // Seul le propriétaire de l'entreprise peut désactiver
      if (store.company_id.owner_id.toString() !== currentUser._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Vous ne possédez pas ce store'
        });
      }
    } else if (currentUser.role === 'supervisor') {
      // Le superviseur ne peut désactiver que son propre store
      if (!store.supervisor_id || store.supervisor_id._id.toString() !== currentUser._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas le superviseur de ce store'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'Action non autorisée pour votre rôle'
      });
    }

    // Désactiver le store
    const updatedStore = await Store.findByIdAndUpdate(
      id,
      { $set: { is_active: false } },
      { new: true, runValidators: true }
    )
    .populate('supervisor_id', 'first_name last_name phone')
    .select('-__v -created_at -updated_at');

    res.status(200).json({
      success: true,
      data: {
        id: updatedStore._id,
        name: updatedStore.name,
        contact: updatedStore.contact,
        is_active: updatedStore.is_active,
        supervisor: updatedStore.supervisor_id ? {
          name: `${updatedStore.supervisor_id.first_name} ${updatedStore.supervisor_id.last_name}`,
          phone: updatedStore.supervisor_id.phone
        } : null,
        employees_count: updatedStore.employees?.length || 0
      },
      message: 'Store désactivé avec succès'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur lors de la désactivation du store'
    });
  }
};

module.exports.activateStore = async (req, res) => {
  const { id } = req.params;
  const currentUser = res.locals.user;

  try {
    // Trouver le store avec les informations de l'entreprise
    const store = await Store.findById(id)
      .populate('company_id', 'owner_id');

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store non trouvé'
      });
    }

    // Seul le propriétaire peut réactiver un store
    if (currentUser.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Action réservée aux propriétaires'
      });
    }

    // Vérifier que le propriétaire possède bien ce store
    if (store.company_id.owner_id.toString() !== currentUser._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Vous ne possédez pas ce store'
      });
    }

    // Réactiver le store
    const updatedStore = await Store.findByIdAndUpdate(
      id,
      { $set: { is_active: true } },
      { new: true, runValidators: true }
    )
    .populate('supervisor_id', 'first_name last_name phone')
    .select('-__v -created_at -updated_at');

    res.status(200).json({
      success: true,
      data: {
        id: updatedStore._id,
        name: updatedStore.name,
        contact: updatedStore.contact,
        is_active: updatedStore.is_active,
        supervisor: updatedStore.supervisor_id ? {
          name: `${updatedStore.supervisor_id.first_name} ${updatedStore.supervisor_id.last_name}`,
          phone: updatedStore.supervisor_id.phone
        } : null,
        employees_count: updatedStore.employees?.length || 0
      },
      message: 'Store réactivé avec succès'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur lors de la réactivation du store'
    });
  }
};


module.exports.getStoreDetails = async (req, res) => {
  const { id } = req.params;
  const currentUser = res.locals.user;

  try {
    // Trouver le store avec les informations complètes
    const store = await Store.findById(id)
      .populate('company_id', 'owner_id name')
      .populate('supervisor_id', 'first_name last_name phone role')
      .populate('employees', 'first_name last_name phone role')
      .select('-__v -created_at -updated_at');

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store non trouvé'
      });
    }

    // Vérifier les permissions
    if (currentUser.role === 'owner') {
      // Le propriétaire ne peut voir que les stores de son entreprise
      if (store.company_id.owner_id.toString() !== currentUser._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce store'
        });
      }
    } else if (currentUser.role === 'supervisor') {
      // Le superviseur ne peut voir que son propre store
      if (!store.supervisor_id || store.supervisor_id._id.toString() !== currentUser._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce store'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'Rôle non autorisé'
      });
    }

    // Formater la réponse
    const response = {
      id: store._id,
      name: store.name,
      company: {
        id: store.company_id._id,
        name: store.company_id.name
      },
      contact: {
        phone: store.contact.phone,
        address: {
          city: store.contact.address.city,
          country: store.contact.address.country
        }
      },
      supervisor: store.supervisor_id ? {
        id: store.supervisor_id._id,
        name: `${store.supervisor_id.first_name} ${store.supervisor_id.last_name}`,
        phone: store.supervisor_id.phone,
        role: store.supervisor_id.role
      } : null,
      employees: store.employees.map(emp => ({
        id: emp._id,
        name: `${emp.first_name} ${emp.last_name}`,
        phone: emp.phone,
        role: emp.role
      })),
      is_active: store.is_active,
      created_by: store.created_by,
      deletedAt: store.deletedAt
    };

    res.status(200).json({
      success: true,
      data: response
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur lors de la récupération des détails du store'
    });
  }
};