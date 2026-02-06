const userModel = require('../models/user.models');
const companyModel = require('../models/company.models.js');
const {generateCompanyRef} = require('../utils/companyUtils');
const Store = require('../models/stores.models');
const Company = require('../models/company.models');
const User = require('../models/user.models');
const Product = require('../models/products.models.js');
const Category = require('../models/category.models.js');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');


module.exports.createUser = async (req, res) => {
    console.log(req.body);
    const {phone, password, last_name, first_name, role} = req.body;
    
    try {
        if(!['owner', 'supervisor', 'cashier']){
            return res.status(400).json({
                message: 'Rôle invalide'
            });
        }

        const newUser = await userModel.create({
            phone,
            password,
            first_name,
            last_name,
            role,
            createdBy: res.locals.user._id
        })
        res.status(201).json({
            message: 'Utilisateur créé avec succès',
            userId: newUser._id
        })
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}


module.exports.listAllUsers = async (req, res) => {
    try {
        const {page=1, limit=10, role} = req.query;
        const currentUserId = res.locals.user._id;

        
        const filter = {
            _id: { $ne: currentUserId }
        };
        if(role) filter.role = role;
        const users = await userModel
            .find(filter)
            .select('-password -__v -refreshToken')
            .sort({createdAt: -1})
            .limit(limit * 1)
            .skip((page -1 ) * limit)
            .lean()
            
        
        const count = await userModel.countDocuments(filter)
        res.status(200).json({
            success: true,
            data: users,
            pagination: {
                total: count,
                page: +page,
                limit: +limit,
                totalPages: Math.ceil(count / limit)
            }
        })
    } catch (error) {
        res.status(500).json({ 
      success: false,
      message: 'Erreur serveur',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
    }
}

module.exports.updateUser = async (req, res) => {
    const {id} = req.params;
    const updates = req.body;
    const currentAdminId = res.locals.user._id;
    
    try {
        const allowedUpdates = ['first_name', 'last_name', 'role', 'is_active', 'phone'];
        const invalidUpdates = Object.keys(updates).filter(
            field => !allowedUpdates.includes(field)
        );

         if (invalidUpdates.length > 0) {
      return res.status(400).json({
        message: `Champs interdits: ${invalidUpdates.join(', ')}`,
        allowedFields: allowedUpdates
      });
    }

     if (id === currentAdminId.toString()) {
      return res.status(403).json({ 
        message: 'Utilisez le profil utilisateur pour modifier votre propre compte' 
      });
    }


    const updatedUser = await userModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { 
        new: true,
        runValidators: true,
        select: '-password -__v -refreshToken'
      }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    res.status(200).json({
      success: true,
      data: updatedUser,
      message: 'Utilisateur mis à jour avec succès'
    });
    } catch (error) {
          res.status(400).json({ 
      success: false,
      error: error.message 
    });
    }
}


module.exports.deactivateUser = async (req, res) => {
  const { id } = req.params;
  const currentAdmin = res.locals.user;

  try {
    if (id === currentAdmin._id.toString()) {
      return res.status(403).json({ 
        message: 'Utilisez votre profil pour désactiver votre compte' 
      });
    }


    const user = await userModel.findByIdAndUpdate(
      id,
      { 
        $set: { 
          is_active: false,
          deactivatedBy: currentAdmin._id,
          deactivatedAt: new Date() 
        } 
      },
      { new: true, select: '-password -__v' }
    );

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

 
    console.log(`Admin ${currentAdmin._id} a désactivé l'utilisateur ${id}`);
    
    res.status(200).json({
      success: true,
      message: 'Utilisateur désactivé',
      data: {
        _id: user._id,
        phone: user.phone,
        is_active: user.is_active
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

module.exports.reactivateUser = async (req, res) => {
  const { id } = req.params;
  const currentAdmin = res.locals.user;

  try {
    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (user.is_active) {
      return res.status(400).json({ 
        message: 'Cet utilisateur est déjà actif' 
      });
    }

    const reactivatedUser = await userModel.findByIdAndUpdate(
      id,
      { 
        $set: { is_active: true },
        $unset: { 
          deactivatedBy: "",
          deactivatedAt: "" 
        }
      },
      { 
        new: true,
        select: '-password -__v -refreshToken'
      }
    );

    console.log(`Admin ${currentAdmin._id} a réactivé l'utilisateur ${id}`);

    res.status(200).json({
      success: true,
      message: 'Compte réactivé avec succès',
      data: {
        _id: reactivatedUser._id,
        phone: reactivatedUser.phone,
        is_active: reactivatedUser.is_active,
        role: reactivatedUser.role
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

module.exports. createCompanyForOwner = async (req, res) => {
    try {
      const { name, owner_id, settings } = req.body;

      const existingCompany = await companyModel.findOne({ owner_id: owner_id })
      if(existingCompany){
        return  res.status(400).json({ message: 'Cet utilisateur possède déjà une entreprise' });
      }

      const company = await companyModel.create({
        name,
        owner_id,
        settings,
        ref_code: generateCompanyRef(name),
        created_by: res.locals.user._id,
      });

      res.status(201).json({
        success: true,
        data: {
          id: company._id,
          ref_code: company.ref_code,
          owner_id: company.owner_id,
          created_by: company.created_by
        }
      });

    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

module.exports.updateCompanyForOwner = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const currentUser = res.locals.user;

  try {
 
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ message: 'Données de mise à jour invalides' });
    }



    if (company.owner_id.toString() !== currentUser._id.toString() 
        && currentUser.role !== 'admin') {
      return res.status(403).json({ message: 'Permission denied' });
    }

    const allowedUpdates = ['name', 'ref_code'];
    const allowedSettings = ['currency', 'tax_rate'];
    const filteredUpdates = { updatedBy: currentUser._id };

    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    if (updates.settings) {
      Object.keys(updates.settings).forEach(key => {
        if (allowedSettings.includes(key)) {
          filteredUpdates[`settings.${key}`] = updates.settings[key];
        }
      });
    }

    const updatedCompany = await companyModel.findByIdAndUpdate(
      id,
      { $set: filteredUpdates },
      { new: true, runValidators: true, select: '-__v -created_by' }
    );

    res.status(200).json({
      success: true,
      data: {
        id: updatedCompany._id,
        name: updatedCompany.name,
        owner_id: updatedCompany.owner_id,
        settings: updatedCompany.settings,
        updatedBy: updatedCompany.updatedBy
      }
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur de mise à jour'
    });
  }
};

module.exports.deleteCompanyForOwner = async (req, res) => {
  const { id } = req.params;
  const currentAdmin = res.locals.user;

  try {
    if (currentAdmin.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Action réservée aux administrateurs' 
      });
    }
    const deletedCompany = await companyModel.findByIdAndUpdate(
      id,
      { 
        $set: { 
          is_active: false,
          deletedAt: new Date(),
          deletedBy: currentAdmin._id 
        } 
      },
      { new: true }
    );

    // Alternative pour suppression physique :
    // await companyModel.findByIdAndDelete(id);

    console.log(`Admin ${currentAdmin._id} a désactivé la company ${id}`);

    res.status(200).json({
      success: true,
      message: 'Entreprise désactivée avec succès',
      data: {
        id: deletedCompany._id,
        name: deletedCompany.name,
        owner_id: deletedCompany.owner_id,
        is_active: false
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

module.exports.reactivateCompanyForOwner = async (req, res) => {
  const { id } = req.params;
  const currentAdmin = res.locals.user;

  try {
    const company = await companyModel.findById(id);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Entreprise non trouvée'
      });
    }

    if (company.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Cette entreprise est déjà active'
      });
    }

    const reactivatedCompany = await companyModel.findByIdAndUpdate(
      id,
      {
        $set: { is_active: true },
        $unset: {
          deletedBy: "",
          deletedAt: ""
        }
      },
      {
        new: true,
        select: '-__v -created_by'
      }
    );

    console.log(`Admin ${currentAdmin._id} a réactivé l'entreprise ${id}`);

    res.status(200).json({
      success: true,
      message: 'Entreprise réactivée avec succès',
      data: {
        _id: reactivatedCompany._id,
        name: reactivatedCompany.name,
        is_active: reactivatedCompany.is_active,
        owner_id: reactivatedCompany.owner_id
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

module.exports.listAllCompany = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { is_active, owner_id } = req.query;

    const filter = {};
    
    if (is_active !== undefined) {
      filter.is_active = is_active === 'true';
    }
    
    if (owner_id) {
      filter.owner_id = owner_id;
    }

    const companies = await companyModel.find(filter)
      .select('-__v ') 
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await companyModel.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);


    res.status(200).json({
      success: true,
      data: companies,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages
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



module.exports.createStoreByAdmin = async (req, res) => {
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            if (req.user.role !== 'admin') {
                await session.abortTransaction();
                return res.status(403).json({
                    success: false,
                    message: 'Action réservée aux administrateurs'
                });
            }

            const { name, contact, companyId, supervisorId } = req.body;

            if (!name || !contact?.phone || !contact?.address?.city || !companyId) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: 'Nom, téléphone, ville et entreprise sont obligatoires'
                });
            }

            const company = await Company.findById(companyId).session(session);
            if (!company) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: 'Entreprise non trouvée'
                });
            }

            if (supervisorId) {
                const supervisor = await User.findById(supervisorId).session(session);
                if (!supervisor || supervisor.role !== 'supervisor') {
                    await session.abortTransaction();
                    return res.status(400).json({
                        success: false,
                        message: 'Le superviseur doit avoir le rôle approprié'
                    });
                }
            }

            const newStore = await Store.create([{
                name,
                contact: {
                    phone: contact.phone,
                    address: {
                        city: contact.address.city,
                        country: contact.address.country || 'Haïti'
                    }
                },
                company_id: companyId,
                supervisor_id: supervisorId,
                created_by: req.user._id,
                is_active: true
            }], { session });

            if (supervisorId) {
                await User.findByIdAndUpdate(
                    supervisorId,
                    { $set: { supervisedStore: newStore[0]._id } },
                    { session }
                );
            }

            await session.commitTransaction();

            res.status(201).json({
                success: true,
                data: {
                    id: newStore[0]._id,
                    name: newStore[0].name,
                    company: company.name,
                    supervisor: supervisorId || null
                }
            });

        } catch (error) {
            await session.abortTransaction();
            res.status(500).json({
                success: false,
                error: process.env.NODE_ENV === 'development' 
                    ? error.message 
                    : 'Erreur serveur'
            });
        } finally {
            session.endSession();
        }
    
}


module.exports.listAllStores = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { is_active, company_id } = req.query;

    const filter = {};

    if (is_active !== undefined) {
      filter.is_active = is_active === 'true';
    }

    if (company_id) {
      filter.company_id = company_id
    }

    const stores = await Store.find(filter)
      .select('-__v ')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Store.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: stores,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development'
        ? error.message
        : 'Erreur serveur'
    });
  }
}




module.exports.updateStoreForOwner = async (req, res) => {
    const { id } = req.params;
    const updates = req.body; 
    const currentUser = res.locals.user; 

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        if (currentUser.role !== 'admin') {
            await session.abortTransaction();
            return res.status(403).json({
                success: false,
                message: 'Action réservée aux administrateurs'
            });
        }

        const store = await Store.findById(id).session(session);
        if (!store) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Magasin non trouvé'
            });
        }

        const allowedUpdates = {
            name: { type: 'string', maxLength: 50 },
            'contact.phone': { type: 'string', pattern: /^[0-9]{8,15}$/ },
            'contact.address.city': { type: 'string' },
            'contact.address.country': { type: 'string', enum: ['Haïti'] },
            supervisor_id: { 
                type: 'ObjectId', 
                ref: 'User',
                validate: async (v) => {
                    if (!v) return true;
                    const user = await User.findById(v).session(session);
                    return user?.role === 'supervisor';
                }
            },
            is_active: { type: 'boolean' }
        };

        const filteredUpdates = {};
        const errors = [];

        Object.keys(updates).forEach(key => {
            if (allowedUpdates[key]) {
                if (typeof updates[key] !== allowedUpdates[key].type) {
                    errors.push(`Le champ ${key} doit être de type ${allowedUpdates[key].type}`);
                    return;
                }

                if (key === 'contact.phone' && !allowedUpdates[key].pattern.test(updates[key])) {
                    errors.push('Numéro de téléphone invalide');
                    return;
                }

                filteredUpdates[key] = updates[key];
            }
        });

        if (errors.length > 0) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                errors
            });
        }
        let oldSupervisorId = null;
        if ('supervisor_id' in filteredUpdates) {
            oldSupervisorId = store.supervisor_id;

            if (filteredUpdates.supervisor_id !== oldSupervisorId?.toString()) {
                // Retirer l'ancien superviseur
                if (oldSupervisorId) {
                    await User.findByIdAndUpdate(
                        oldSupervisorId,
                        { $unset: { supervisedStore: "" } },
                        { session }
                    );
                }

                if (filteredUpdates.supervisor_id) {
                    await User.findByIdAndUpdate(
                        filteredUpdates.supervisor_id,
                        { $set: { supervisedStore: id } },
                        { session }
                    );
                }
            }
        }


        const updatedStore = await Store.findByIdAndUpdate(
            id,
            { $set: filteredUpdates },
            { 
                new: true,
                runValidators: true,
                session
            }
        ).populate('company_id', 'name');

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            data: {
                id: updatedStore._id,
                name: updatedStore.name,
                company: updatedStore.company_id.name,
                contact: updatedStore.contact,
                is_active: updatedStore.is_active,
                supervisor_id: updatedStore.supervisor_id
            }
        });

    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Erreur serveur'
        });
    } finally {
        session.endSession();
    }
};


module.exports.deleteStoreForOwner = async (req, res) => {
  const { id } = req.params;
  const currentUser = res.locals.user;
  const session = await mongoose.startSession();

  try {
    session.startTransaction()

    if (currentUser.role !== 'admin') {
      await session.abortTransaction()
      return res.status(403).json({
        success: false,
        message: 'Action réservée aux administrateurs'
      });
    }

    const store = await Store.findById(id)
      .populate('company_id', 'name')
      .populate('supervisor_id', '_id')
      .populate('employees', '_id')
      .session(session);

    if (!store) {
      session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Magasin non trouvé'
      });
    }

    await Store.findByIdAndUpdate(
      id,
      {
        $set: {
          deletedAt: new Date(),
          deletedBy: currentUser._id,
          isActive: false,
        }
      }
    );

    if (store.employees.length > 0) {
      await User.updateMany(
        { _id: { $in: store.employees.map(e => e._id) } },
        { $pull: { stores: id } },
        { session }
      );
    }


    if (store.employees.length > 0) {
      await User.updateMany(
        { _id: { $in: store.employees.map(e => e._id) } },
        { $pull: { stores: id } },
        { session }
      );
    }


    await Product.updateMany(
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

    await Category.updateMany(
      { stores: id },
      { $pull: { stores: id } },
      { session }
    );

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      data: {
        id: store._id,
        name: store.name,
        deleted_at: new Date(),
        affected_employees: store.employees.length,
        affected_products: await Product.countDocuments({ store_id: id })
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


module.exports.reactivateStoreForOwner = async (req, res) => {
  const { id } = req.params;
  const currentUser = res.locals.user;
  const session = await mongoose.startSession();


  try {
    session.startTransaction();

    if (currentUser.role !== 'admin') {
      res.status(403).message({
        success: false,
        message: 'Action réservée aux administrateurs'
      });
    }

    const store = await Store.findByOne({
      _id: id,
      deletedAt: { $exists: true }
    })

    if (!store) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Magasin non trouvé ou déjà actif'
      });
    }

    const reactivatedStore = await Store.findByIdAndUpdate(
      id,
      {
        $unset: { deletedAt: "", deletedBy: "" },
        $set: { isActive: true }
      },

      {
        new: true,
        sessions,
        runValidators: true
      }
    ).populate('company_id', 'name');

    await Product.updateMany(
      { store_id: id, is_active: false },
      {
        $set: { is_active: true },
        $unset: { archivedAt: "", archivedBy: "" }
      },
      { session }
    );
    await session.commitTransaction();

    res.status(200).json({
      success: true,
      data: {
        id: reactivatedStore._id,
        name: reactivatedStore.name,
        company: reactivatedStore.company_id.name,
        is_active: reactivatedStore.is_active,
        reactivated_at: new Date(),
        reactivated_by: currentUser._id
      }
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development'
        ? error.message
        : 'Erreur lors de la réactivation du magasin'
    });
  } finally {
    session.endSession();
  }
}

module.exports.createEmployeeForStore = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { phone, last_name, first_name, role, email, password, storeIds, pin_code } = req.body;
    const currentUser = res.locals.user;

    if (currentUser.role !== 'admin') {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: 'Action réservée aux administrateurs'
      });
    }

    const requiredFields = ['phone', 'first_name', 'last_name', 'password', 'role'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Champs manquants: ${missingFields.join(', ')}`
      });
    }

    const allowedRoles = ['cashier', 'supervisor'];
    if (!allowedRoles.includes(role)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Rôle invalide. Doit être "cashier" ou "supervisor"'
      });
    }

    if (role === "supervisor" && storeIds?.length > 1) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Un superviseur ne peut être affecté qu\'à un seul magasin'
      });
    }

    if (storeIds?.length > 0) {
      const existingStoresCount = await Store.countDocuments({
        _id: { $in: storeIds },
        is_active: true,
        deletedAt: { $exists: false }
      }).session(session);

      if (existingStoresCount !== storeIds.length) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Un ou plusieurs magasins sont invalides ou inactifs'
        });
      }
    }

    const existingUser = await User.findOne({ phone }).session(session);
    if (existingUser) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Ce numéro de téléphone est déjà utilisé'
      });
    }

    // ✅ FIX: Ne pas hasher ici, le hook pre('save') du modèle User le fera automatiquement
    // Cela évite le double hashage qui rendait le mot de passe invalide
    const newEmployee = await User.create([{
      phone,
      first_name,
      last_name,
      email,
      password, // ✅ Passer le mot de passe en clair, le hook le hashera
      role,
      pin_code,
      stores: storeIds || [],
      createdBy: currentUser._id,
      is_active: true
    }], { session });

    if (storeIds?.length > 0) {
      await Store.updateMany(
        { _id: { $in: storeIds } },
        { $addToSet: { employees: newEmployee[0]._id } },
        { session }
      );
    }

    if (role === 'supervisor' && storeIds?.length === 1) {
      await Store.findByIdAndUpdate(
        storeIds[0],
        { supervisor_id: newEmployee[0]._id },
        { session }
      );
    }

    await session.commitTransaction();

    const employeeData = newEmployee[0].toObject();
    delete employeeData.password;
    delete employeeData.__v;

    return res.status(201).json({
      success: true,
      data: employeeData
    });

  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development'
        ? error.message
        : 'Erreur lors de la création de l\'employé'
    });
  } finally {
    await session.endSession();
  }
};


/**
 * @description Met à jour les informations d'un employé
 * @route PATCH /admin/employees/:id
 * @access Private (Admin seulement)
 */
module.exports.updateEmployee = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const updates = req.body;
    const currentUser = res.locals.user;

    // Vérification des champs obligatoires
    if (!id) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'ID employé manquant' 
      });
    }

    // Vérification que l'utilisateur existe
    const employee = await User.findById(id).session(session);
    if (!employee) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false, 
        message: 'Employé non trouvé' 
      });
    }

    // Validation des rôles
    const allowedRoles = ['cashier', 'supervisor'];
    if (updates.role && !allowedRoles.includes(updates.role)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'Rôle invalide. Doit être "cashier" ou "supervisor"' 
      });
    }

    // Validation spécifique pour les superviseurs
    if (updates.role === 'supervisor' && updates.storeIds?.length > 1) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'Un superviseur ne peut être affecté qu\'à un seul magasin' 
      });
    }

    // Vérification des magasins
    if (updates.storeIds?.length > 0) {
      const existingStoresCount = await Store.countDocuments({
        _id: { $in: updates.storeIds },
        is_active: true,
        deletedAt: { $exists: false }
      }).session(session);

      if (existingStoresCount !== updates.storeIds.length) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false, 
          message: 'Un ou plusieurs magasins sont invalides ou inactifs' 
        });
      }
    }

    // Mise à jour de l'employé
    const updatedEmployee = await User.findByIdAndUpdate(
      id,
      { 
        ...updates,
        updatedBy: currentUser._id 
      },
      { 
        new: true, 
        session,
        runValidators: true 
      }
    ).select('-password -__v');

    // Gestion des magasins si storeIds est fourni
    if (updates.storeIds) {
      // 1. Retirer l'employé des anciens magasins
      await Store.updateMany(
        { employees: id },
        { $pull: { employees: id } },
        { session }
      );

      // 2. Ajouter aux nouveaux magasins
      await Store.updateMany(
        { _id: { $in: updates.storeIds } },
        { $addToSet: { employees: id } },
        { session }
      );

      // 3. Gestion spécifique des superviseurs
      if (updates.role === 'supervisor' && updates.storeIds.length === 1) {
        await Store.findByIdAndUpdate(
          updates.storeIds[0],
          { supervisor_id: id },
          { session }
        );
      }
    }

    await session.commitTransaction();

    return res.status(200).json({ 
      success: true, 
      data: updatedEmployee 
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Erreur mise à jour employé:', error);
    return res.status(500).json({ 
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur lors de la mise à jour de l\'employé' 
    });
  } finally {
    await session.endSession();
  }
};




module.exports.addEmployeeToStores = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { storeIds } = req.body;


    if (!storeIds?.length) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'Liste de magasins requise' 
      });
    }


    const employee = await User.findById(id).session(session);
    if (!employee) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false, 
        message: 'Employé non trouvé' 
      });
    }


    const existingStores = await Store.countDocuments({
      _id: { $in: storeIds },
      is_active: true
    }).session(session);

    if (existingStores !== storeIds.length) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'Un ou plusieurs magasins invalides' 
      });
    }


    await Store.updateMany(
      { _id: { $in: storeIds } },
      { $addToSet: { employees: id } },
      { session }
    );

  
    await User.findByIdAndUpdate(
      id,
      { $addToSet: { stores: { $each: storeIds } } },
      { session, new: true }
    );

    await session.commitTransaction();
    
    return res.status(200).json({ 
      success: true, 
      message: 'Employé ajouté aux magasins avec succès' 
    });

  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    await session.endSession();
  }
};



module.exports.removeEmployeeFromStores = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { storeIds } = req.body;

    if (!storeIds?.length) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'Liste de magasins requise' 
      });
    }

    await Store.updateMany(
      { _id: { $in: storeIds } },
      { $pull: { employees: id } },
      { session }
    );

    await User.findByIdAndUpdate(
      id,
      { $pull: { stores: { $in: storeIds } } },
      { session }
    );


    await Store.updateMany(
      { _id: { $in: storeIds }, supervisor_id: id },
      { $unset: { supervisor_id: "" } },
      { session }
    );

    await session.commitTransaction();
    
    return res.status(200).json({ 
      success: true, 
      message: 'Employé retiré des magasins avec succès' 
    });

  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    await session.endSession();
  }
};



module.exports.listAllEmployees = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      role, 
      storeId, 
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      is_active 
    } = req.query;

    let query = { 
      role: { $in: ['cashier', 'supervisor'] } 
    };

    if (role) {
      query.role = role;
    }

    if (is_active !== undefined) {
      query.is_active = is_active === 'true';
    }

    if (storeId) {
      query.stores = storeId;
    }

    if (search) {
      query.$or = [
        { first_name: { $regex: search, $options: 'i' } },
        { last_name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const employees = await User.find(query)
      .select('-password -__v')
      .populate({
        path: 'stores',
        select: 'name contact.address.city',
        match: { is_active: true }
      })
      .populate({
        path: 'supervisedStore',
        select: 'name contact.address.city'
      })
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await User.countDocuments(query);

    const response = {
      success: true,
      data: employees,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error listing employees:', error);
    res.status(500).json({ 
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur lors de la récupération des employés' 
    });
  }
};


module.exports.deactivateEmployee = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const currentUser = res.locals.user;

    const employee = await User.findById(id).session(session);
    if (!employee) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false, 
        message: 'Employé non trouvé' 
      });
    }

    if (employee.role === 'admin' && currentUser.role !== 'admin') {
      await session.abortTransaction();
      return res.status(403).json({ 
        success: false, 
        message: 'Action non autorisée' 
      });
    }

    await User.findByIdAndUpdate(
      id,
      { 
        is_active: false,
        deactivatedAt: new Date(),
        deactivatedBy: currentUser._id
      },
      { session }
    );

    await Store.updateMany(
      { employees: id },
      { 
        $pull: { employees: id },
        $unset: { supervisor_id: 1 } // Si c'était un superviseur
      },
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({ 
      success: true, 
      message: 'Employé désactivé avec succès' 
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Erreur désactivation employé:', error);
    return res.status(500).json({ 
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur lors de la désactivation' 
    });
  } finally {
    await session.endSession();
  }
};


module.exports.reactivateEmployee = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const currentUser = res.locals.user;

    const employee = await User.findOne({
      _id: id,
      is_active: false
    }).session(session);

    if (!employee) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Employé non trouvé ou déjà actif'
      });
    }

    const reactivatedEmployee = await User.findByIdAndUpdate(
      id,
      {
        is_active: true,
        $unset: {
          deactivatedAt: "",
          deactivatedBy: ""
        },
        reactivatedBy: currentUser._id,
        reactivatedAt: new Date()
      },
      { 
        new: true,
        session 
      }
    ).select('-password -__v');

    if (employee.stores?.length > 0) {
      // Réaffectation aux magasins
      await Store.updateMany(
        { _id: { $in: employee.stores } },
        { $addToSet: { employees: id } },
        { session }
      );

      if (employee.role === 'supervisor') {
        await Store.findByIdAndUpdate(
          employee.supervisedStore,
          { supervisor_id: id },
          { session }
        );
      }
    }

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      data: reactivatedEmployee,
      message: 'Employé réactivé avec succès'
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Erreur réactivation employé:', error);
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development'
        ? error.message
        : 'Erreur lors de la réactivation'
    });
  } finally {
    await session.endSession();
  }
};



module.exports.getEmployeeStores = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id)
      .populate('stores', 'name contact.address.city');
    
    if (!employee) {
      return res.status(404).json({ 
        success: false, 
        message: 'Employé non trouvé' 
      });
    }

    res.status(200).json({ 
      success: true, 
      data: employee.stores 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};


exports.listAllCategories = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10,
      companyId,
      withStores = false,
      withStats = false
    } = req.query;

    const pipeline = [];
    
    // Filtrage optionnel par entreprise
    if (companyId) {
      pipeline.push({
        $match: { company_id: new mongoose.Types.ObjectId(companyId) }
      });
    }

    // Jointure avec les stores si demandé
    if (withStores === 'true') {
      pipeline.push({
        $lookup: {
          from: 'stores',
          localField: 'stores',
          foreignField: '_id',
          as: 'stores'
        }
      });
    }

    // Statistiques produits si demandé
    if (withStats === 'true') {
      pipeline.push({
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'category_id',
          as: 'products'
        }
      });
      pipeline.push({
        $addFields: {
          productsCount: { $size: "$products" },
          activeProducts: {
            $size: {
              $filter: {
                input: "$products",
                as: "product",
                cond: { $eq: ["$$product.is_active", true] }
              }
            }
          }
        }
      });
    }

    // Pagination
    const paginationStage = [
      { $skip: (parseInt(page) - 1) * parseInt(limit) },
      { $limit: parseInt(limit) }
    ];

    const [categories, total] = await Promise.all([
      Category.aggregate([...pipeline, ...paginationStage]),
      Category.aggregate([...pipeline, { $count: "total" }])
    ]);

    res.status(200).json({
      success: true,
      data: categories,
      pagination: {
        total: total[0]?.total || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil((total[0]?.total || 0) / parseInt(limit))
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

exports.updateCategory = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { name, color, icon, storeIds, companyId, storesToRemove } = req.body; // Ajout de storesToRemove
    const updater = res.locals.user;

    // 1. Vérification de la catégorie existante
    const category = await Category.findById(id).session(session);
    if (!category) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        message: 'Catégorie non trouvée' 
      });
    }

    // 2. Validation pour les champs
    const updates = {};
    if (name) updates.name = name;
    if (color) updates.color = color;
    if (icon) updates.icon = icon;

    // 3. Gestion du changement d'entreprise (admin seulement)
    if (companyId) {
      const companyExists = await Company.exists({ _id: companyId }).session(session);
      if (!companyExists) {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: 'Entreprise cible invalide' 
        });
      }
      updates.company_id = companyId;
    }

    // 4. Gestion des magasins à AJOUTER
    if (storeIds) {
      if (!Array.isArray(storeIds)) {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: 'storeIds doit être un tableau' 
        });
      }

      const validStores = await Store.countDocuments({
        _id: { $in: storeIds },
        company_id: companyId || category.company_id
      }).session(session);

      if (validStores !== storeIds.length) {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: 'Un ou plusieurs magasins sont invalides' 
        });
      }

      updates.$addToSet = { stores: { $each: storeIds } }; // Ajoute sans doublons
    }

    // 5. Gestion des magasins à RETIRER (NOUVEAU)
    if (storesToRemove) {
      if (!Array.isArray(storesToRemove)) {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: 'storesToRemove doit être un tableau' 
        });
      }

      updates.$pullAll = { stores: storesToRemove };
    }

    // 6. Mise à jour
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { 
        ...updates, // Combine $set, $addToSet et $pullAll
        $push: { updatedBy: { user: updater._id, at: new Date() } }
      },
      { 
        new: true,
        session,
        runValidators: true 
      }
    ).populate('stores', 'name');

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      data: updatedCategory,
      message: 'Catégorie mise à jour avec succès'
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur lors de la mise à jour'
    });
  } finally {
    session.endSession();
  }
};

// Désactivation
exports.deactivateCategory = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const admin = res.locals.user;

    // 1. Trouver la catégorie
    const category = await Category.findById(id).session(session);
    if (!category) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        message: 'Catégorie non trouvée' 
      });
    }

    // 2. Désactivation
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { 
        $set: { is_active: false },
        $push: { 
          updatedBy: { 
            user: admin._id, 
            at: new Date(),
            action: 'deactivation' 
          } 
        }
      },
      { new: true, session }
    );

    // 3. Désactiver tous les produits associés (optionnel)
    await Product.updateMany(
      { category_id: id },
      { $set: { is_active: false } },
      { session }
    );

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      data: updatedCategory,
      message: 'Catégorie désactivée avec succès'
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur lors de la désactivation'
    });
  } finally {
    session.endSession();
  }
};

// Réactivation
exports.reactivateCategory = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const admin = res.locals.user;

    // 1. Trouver la catégorie
    const category = await Category.findById(id).session(session);
    if (!category) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        message: 'Catégorie non trouvée' 
      });
    }

    // 2. Réactivation
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { 
        $set: { is_active: true },
        $push: { 
          updatedBy: { 
            user: admin._id, 
            at: new Date(),
            action: 'reactivation' 
          } 
        }
      },
      { new: true, session }
    );

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      data: updatedCategory,
      message: 'Catégorie réactivée avec succès'
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur lors de la réactivation'
    });
  } finally {
    session.endSession();
  }
};


/**
 * @description Crée un nouveau produit
 * @route POST /admin/products
 * @access Private (Admin seulement)
 */

module.exports.createProduct = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        session.startTransaction();
        
        const { 
            name,
            barcode,
            type,
            unit,
            companyId,
            storeId,
            categoryId,
            inventory,
            pricing,
            variants
        } = req.body;

        // Conversion des données JSON
        let inventoryData, pricingData, variantsData;
        try {
            inventoryData = typeof inventory === 'string' ? JSON.parse(inventory) : inventory;
            pricingData = typeof pricing === 'string' ? JSON.parse(pricing) : pricing;
            variantsData = typeof variants === 'string' ? JSON.parse(variants) : (variants || []);
        } catch (parseError) {
            await session.abortTransaction();
            await session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Format JSON invalide dans les données'
            });
        }

        // Validation des données
        if (!name || !type || !companyId || !storeId) {
            await session.abortTransaction();
            await session.endSession();
            cleanUpUploadedFiles(req.files);
            return res.status(400).json({
                success: false,
                message: 'Nom, type, entreprise et magasin sont obligatoires'
            });
        }

        // Vérification des références
        let company, store, category;
        try {
            [company, store, category] = await Promise.all([
                Company.findById(companyId).session(session),
                Store.findById(storeId).session(session),
                categoryId ? Category.findById(categoryId).session(session) : Promise.resolve(null)
            ]);
        } catch (dbError) {
            await session.abortTransaction();
            await session.endSession();
            cleanUpUploadedFiles(req.files);
            return res.status(500).json({
                success: false,
                message: 'Erreur de base de données lors de la vérification des références'
            });
        }

        if (!company || !store) {
            await session.abortTransaction();
            await session.endSession();
            cleanUpUploadedFiles(req.files);
            return res.status(404).json({
                success: false,
                message: 'Entreprise ou magasin non trouvé'
            });
        }

        // Validation spécifique carburant
        if (type === 'fuel') {
            const fuelConfig = pricingData?.fuel_config;
            if (!fuelConfig?.price_per_unit || !fuelConfig?.display_unit) {
                await session.abortTransaction();
                await session.endSession();
                cleanUpUploadedFiles(req.files);
                return res.status(400).json({
                    success: false,
                    message: 'Configuration carburant incomplète'
                });
            }
        }

        // Création du produit
        const productData = {
            name,
            barcode,
            type,
            unit,
            company: companyId,
            store_id: storeId,
            category_id: categoryId,
            inventory: {
                current: inventoryData?.current || 0,
                min_stock: inventoryData?.min_stock || 5,
                alert_enabled: inventoryData?.alert_enabled !== false
            },
            pricing: pricingData || { mode: 'fixed', base_price: 0 },
            variants: variantsData,
            createdBy: req.user._id
        };

        // Gestion des images
        if (req.files?.length > 0) {
            productData.images = req.files.map((file, index) => ({
                url: `/uploads/products/${file.filename}`,
                is_main: index === 0,
                uploadedAt: new Date()
            }));
        }

        // Création et mise à jour en transaction
        let newProduct;
        try {
            newProduct = await Product.create([productData], { session });
            
            if (categoryId) {
                await Category.findByIdAndUpdate(
                    categoryId,
                    { $addToSet: { products: newProduct[0]._id } },
                    { session }
                );
            }
            
            await session.commitTransaction();
        } catch (transactionError) {
            await session.abortTransaction();
            await session.endSession();
            cleanUpUploadedFiles(req.files);
            throw transactionError;
        }

        // Réponse
      const response = {
        id: newProduct[0]._id,
        name: newProduct[0].name,
        type: newProduct[0].type,
        company: company.name,
        store: store.name,
        createdBy: {              
          id: req.user._id,
          name: req.user.first_name + ' ' + req.user.last_name
        }
      };

        if (newProduct[0].images?.length > 0) {
            response.images = newProduct[0].images.map(img => ({
                url: img.url,
                is_main: img.is_main
            }));
            response.main_image = newProduct[0].images.find(img => img.is_main)?.url;
        }

        res.status(201).json({
            success: true,
            data: response
        });

    } catch (error) {
        console.error("Erreur création produit:", error);
        
        let status = 500;
        let errorMessage = 'Erreur lors de la création du produit';
        
        if (error.code === 11000) {
            status = 400;
            errorMessage = error.keyPattern?.barcode 
                ? 'Ce code-barres existe déjà' 
                : 'Duplication de données';
        } else if (error.name === 'ValidationError') {
            status = 400;
            errorMessage = error.message;
        }

        res.status(status).json({
            success: false,
            error: process.env.NODE_ENV === 'development' 
                ? { message: errorMessage, stack: error.stack } 
                : errorMessage
        });
    } finally {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        await session.endSession();
    }
};


/**
 * @description Liste tous les produits avec pagination et filtres
 * @route GET /admin/products
 * @access Private (Admin seulement)
 */
module.exports.listAllProducts = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10,
            companyId,
            storeId,
            categoryId,
            type,
            search,
            sortBy = 'name',
            sortOrder = 'asc'
        } = req.query;

        // Construction de la requête
        const query = {};
        
        if (companyId) query.company = companyId;
        if (storeId) query.store_id = storeId;
        if (categoryId) query.category_id = categoryId;
        if (type) query.type = type;

        // Recherche textuelle
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { barcode: { $regex: search, $options: 'i' } }
            ];
        }

        // Options de tri
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Exécution de la requête avec populate
        const products = await Product.find(query)
            .select('-__v -history')
            .populate('company', 'name')
            .populate('store_id', 'name')
            .populate('category_id', 'name')
            .sort(sortOptions)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        // Compte total pour la pagination
        const total = await Product.countDocuments(query);

        res.status(200).json({
            success: true,
            data: products,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Erreur lors de la récupération des produits'
        });
    }
};

/**
 * @description Récupère les détails d'un produit spécifique
 * @route GET /admin/products/:id
 * @access Private (Admin seulement)
 */
module.exports.getProductDetails = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('company', 'name')
            .populate('store_id', 'name')
            .populate('category_id', 'name')
            .populate('createdBy', 'first_name last_name');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Produit non trouvé'
            });
        }

        res.status(200).json({
            success: true,
            data: product
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Erreur lors de la récupération du produit'
        });
    }
};

/**
 * @description Met à jour un produit existant
 * @route PATCH /admin/products/:id
 * @access Private (Admin seulement)
 */
module.exports.updateProduct = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.startTransaction();
        const { id } = req.params;
        const currentUser = req.user;

        // 1. Vérifier que le produit existe
        const product = await Product.findById(id).session(session);
        if (!product) {
            await session.abortTransaction();
            cleanUpUploadedFiles(req.files);
            return res.status(404).json({
                success: false,
                message: 'Produit non trouvé'
            });
        }

        // 2. Préparation des updates
        const updates = {};
        const allowedUpdates = [
            'name', 'barcode', 'type', 'unit', 'category_id',
            'inventory', 'pricing', 'variants', 'images'
        ];

        // Gestion des données JSON pour les champs complexes
        ['inventory', 'pricing', 'variants'].forEach(field => {
            if (req.body[field] && typeof req.body[field] === 'string') {
                try {
                    updates[field] = JSON.parse(req.body[field]);
                } catch (e) {
                    throw new Error(`Format JSON invalide pour le champ ${field}`);
                }
            } else if (req.body[field]) {
                updates[field] = req.body[field];
            }
        });

        // Filtrage des updates
        Object.keys(req.body).forEach(key => {
            if (allowedUpdates.includes(key) && !['inventory', 'pricing', 'variants'].includes(key)) {
                updates[key] = req.body[key];
            }
        });

        // 3. Gestion des images uploadées
        if (req.files && req.files.length > 0) {
            updates.$push = {
                images: {
                    $each: req.files.map(file => ({
                        url: `/uploads/products/${file.filename}`,
                        is_main: false,
                        uploadedAt: new Date()
                    }))
                }
            };
        }

        // 4. Validation spécifique carburant
        if ((updates.type === 'fuel' || product.type === 'fuel') && updates.pricing) {
            const fuelConfig = updates.pricing.fuel_config;
            if (!fuelConfig?.price_per_unit || !fuelConfig?.display_unit) {
                await session.abortTransaction();
                cleanUpUploadedFiles(req.files);
                return res.status(400).json({
                    success: false,
                    message: 'Configuration carburant incomplète pour les produits fuel'
                });
            }
        }

        // 5. Gestion de la catégorie
        if (updates.category_id) {
            const newCategory = await Category.findById(updates.category_id).session(session);
            if (!newCategory) {
                await session.abortTransaction();
                cleanUpUploadedFiles(req.files);
                return res.status(404).json({
                    success: false,
                    message: 'Nouvelle catégorie non trouvée'
                });
            }

            // Retirer de l'ancienne catégorie
            if (product.category_id) {
                await Category.findByIdAndUpdate(
                    product.category_id,
                    { $pull: { products: product._id } },
                    { session }
                );
            }

            // Ajouter à la nouvelle catégorie
            await Category.findByIdAndUpdate(
                updates.category_id,
                { $addToSet: { products: product._id } },
                { session }
            );
        }

        // 6. Mise à jour du produit
        const updatePayload = {
            $set: updates,
            $push: { 
                history: {
                    field: 'update',
                    changedBy: currentUser._id,
                    at: new Date(),
                    details: Object.keys(updates)
                }
            }
        };

        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            updatePayload,
            { 
                new: true,
                session,
                runValidators: true 
            }
        ).populate('category_id', 'name');

        await session.commitTransaction();

        // 7. Préparation de la réponse
        const response = updatedProduct.toObject();
        
        // Gestion des images dans la réponse
        if (updatedProduct.images) {
            response.images = updatedProduct.images.map(img => ({
                url: img.url,
                is_main: img.is_main,
                uploadedAt: img.uploadedAt
            }));
            response.main_image = updatedProduct.images.find(img => img.is_main)?.url;
        }

        res.status(200).json({
            success: true,
            data: response
        });

    } catch (error) {
        await session.abortTransaction();
        cleanUpUploadedFiles(req.files);

        let status = 500;
        let errorMessage = 'Erreur lors de la mise à jour du produit';

        if (error.code === 11000) {
            status = 400;
            errorMessage = error.keyPattern?.barcode 
                ? 'Ce code-barres est déjà utilisé' 
                : 'Duplication de données détectée';
        } else if (error.message.includes('JSON invalide')) {
            status = 400;
            errorMessage = error.message;
        }

        res.status(status).json({
            success: false,
            error: process.env.NODE_ENV === 'development'
                ? { message: errorMessage, stack: error.stack }
                : errorMessage
        });
    } finally {
        await session.endSession();
    }
};

// Fonction utilitaire pour nettoyer les fichiers uploadés
function cleanUpUploadedFiles(files = []) {
    if (!files || files.length === 0) return;
    
    files.forEach(file => {
        try {
            const filePath = path.join(__dirname, '..', 'public', 'uploads', 'products', file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Fichier nettoyé: ${file.filename}`);
            }
        } catch (cleanupError) {
            console.error('Erreur lors du nettoyage des fichiers:', cleanupError);
        }
    });
}

/**
 * @description Désactive un produit (soft delete)
 * @route DELETE /admin/products/:id
 * @access Private (Admin seulement)
 */
module.exports.deactivateProduct = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const currentUser = res.locals.user;

        const product = await Product.findByIdAndUpdate(
            id,
            { 
                $set: { 
                    is_active: false,
                    archivedAt: new Date(),
                    archivedBy: currentUser._id
                }
            },
            { 
                new: true,
                session 
            }
        );

        if (!product) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Produit non trouvé'
            });
        }

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: 'Produit désactivé avec succès',
            data: {
                id: product._id,
                name: product.name,
                is_active: false
            }
        });

    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Erreur lors de la désactivation du produit'
        });
    } finally {
        session.endSession();
    }
};

/**
 * @description Réactive un produit précédemment désactivé
 * @route PATCH /admin/products/:id/reactivate
 * @access Private (Admin seulement)
 */
module.exports.reactivateProduct = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const currentUser = res.locals.user;

        const product = await Product.findByIdAndUpdate(
            id,
            { 
                $set: { 
                    is_active: true 
                },
                $unset: { 
                    archivedAt: "",
                    archivedBy: "" 
                },
                $push: {
                    history: {
                        field: 'reactivation',
                        changedBy: currentUser._id,
                        at: new Date()
                    }
                }
            },
            { 
                new: true,
                session 
            }
        );

        if (!product) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Produit non trouvé'
            });
        }

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: 'Produit réactivé avec succès',
            data: {
                id: product._id,
                name: product.name,
                is_active: true
            }
        });

    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Erreur lors de la réactivation du produit'
        });
    } finally {
        session.endSession();
    }
};