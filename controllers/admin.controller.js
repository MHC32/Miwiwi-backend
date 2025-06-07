const userModel = require('../models/user.models');
const companyModel = require('../models/company.models.js');
const {generateCompanyRef} = require('../utils/companyUtils');


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

    // 2. Filtrage
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

    // 3. Mise à jour
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

    // 4. Calcul du total
    const total = await companyModel.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    // 5. Réponse formatée
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