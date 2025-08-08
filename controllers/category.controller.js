const mongoose = require('mongoose');
const Category = require('../models/category.models');
const Store = require('../models/stores.models');
const Company = require('../models/company.models')

module.exports.createCategory = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, parent_id, color = '#4CAF50', icon = 'other', storeIds = [], company_id } = req.body;
    const user = res.locals.user;

    // Validation de la catégorie parente
    if (parent_id) {
      const parentExists = await Category.exists({
        _id: parent_id,
        company_id
      }).session(session);

      if (!parentExists) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Catégorie parente invalide ou ne vous appartient pas'
        });
      }
    }

    // Création de la catégorie
    const [newCategory] = await Category.create([{
      name,
      company_id,
      parent_id: parent_id || null,
      color,
      icon,
      stores: storeIds,
      created_by: user._id
    }], { session });

    // Lien avec les magasins (si spécifiés)
    if (storeIds.length > 0) {
      await Store.updateMany(
        { _id: { $in: storeIds } },
        { $addToSet: { categories: newCategory._id } },
        { session }
      );
    }

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      data: {
        id: newCategory._id,
        name: newCategory.name,
        parent_id: newCategory.parent_id,
        stores: newCategory.stores
      }
    });

  } catch (error) {
    await session.abortTransaction();
    
    // Gestion des erreurs spécifiques
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Une catégorie avec ce nom existe déjà dans cette société'
      });
    }

    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur lors de la création de la catégorie'
    });
  } finally {
    session.endSession();
  }
};


exports.listMyCategories = async (req, res) => {
  try {
    const user = res.locals.user;
    const { 
      storeId,
      withProducts = false 
    } = req.query;

    // 1. Trouver l'entreprise de l'owner
    const company = await Company.findOne({ owner_id: user._id });
    if (!company) {
      return res.status(403).json({
        success: false,
        message: "Aucune entreprise associée à votre compte"
      });
    }

    // 2. Construire la requête de base
    const query = { company_id: company._id };
    
    // Filtrage par magasin si spécifié
    if (storeId) {
      if (!user.stores.includes(storeId)) {
        return res.status(403).json({
          success: false,
          message: "Vous n'avez pas accès à ce magasin"
        });
      }
      query.stores = storeId;
    }

    // 3. Requête avec options
    const categories = await Category.find(query)
      .populate({
        path: 'stores',
        select: 'name address',
        match: { is_active: true }
      })
      .lean();

    // 4. Ajout des produits si demandé (évite populate sur gros datasets)
    if (withProducts === 'true') {
      for (const category of categories) {
        category.products = await Product.find({ 
          category_id: category._id,
          is_active: true 
        }).select('name price');
      }
    }

    res.status(200).json({
      success: true,
      data: categories,
      meta: {
        company: company.name,
        totalCategories: categories.length
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
    const { name, color, icon, storeIds, storeRemove } = req.body; // Ajout de storeRemove
    const updater = res.locals.user;

    // 1. Vérification de l'entreprise owner
    const company = await Company.findOne({ 
      owner_id: updater._id 
    }).session(session);

    if (!company) {
      await session.abortTransaction();
      return res.status(403).json({ 
        success: false,
        message: 'Aucune entreprise associée' 
      });
    }

    // 2. Vérification que la catégorie appartient à l'owner
    const category = await Category.findOne({
      _id: id,
      company_id: company._id
    }).session(session);

    if (!category) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        message: 'Catégorie non trouvée ou non autorisée' 
      });
    }

    // 3. Validation des champs
    const updates = {};
    if (name) updates.name = name;
    if (color) updates.color = color;
    if (icon) updates.icon = icon;

    // 4. Gestion des magasins à AJOUTER
    if (storeIds) {
      if (!Array.isArray(storeIds)) {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: 'storeIds doit être un tableau' 
        });
      }

      // Vérifie que les stores appartiennent à l'owner
      const validStores = await Store.countDocuments({
        _id: { $in: storeIds },
        company_id: company._id
      }).session(session);

      if (validStores !== storeIds.length) {
        await session.abortTransaction();
        return res.status(403).json({ 
          message: 'Un ou plusieurs magasins ne vous appartiennent pas' 
        });
      }

      updates.$addToSet = { stores: { $each: storeIds } }; // Ajoute sans doublons
    }

    // 5. Gestion des magasins à RETIRER (NOUVEAU)
    if (storeRemove) {
      if (!Array.isArray(storeRemove)) {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: 'storeRemove doit être un tableau' 
        });
      }

      updates.$pullAll = { stores: storeRemove }; // Retire tous les IDs spécifiés
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
    const owner = res.locals.user;

    // 1. Vérifier l'entreprise de l'owner
    const company = await Company.findOne({ owner_id: owner._id }).session(session);
    if (!company) {
      await session.abortTransaction();
      return res.status(403).json({ 
        success: false,
        message: 'Aucune entreprise associée' 
      });
    }

    // 2. Vérifier que la catégorie appartient à l'owner
    const category = await Category.findOne({
      _id: id,
      company_id: company._id
    }).session(session);

    if (!category) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        message: 'Catégorie non trouvée ou non autorisée' 
      });
    }

    // 3. Désactivation
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { 
        $set: { is_active: false },
        $push: { 
          updatedBy: { 
            user: owner._id, 
            at: new Date(),
            action: 'deactivation' 
          } 
        }
      },
      { new: true, session }
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
    const owner = res.locals.user;

    // 1. Vérifier l'entreprise de l'owner
    const company = await Company.findOne({ owner_id: owner._id }).session(session);
    if (!company) {
      await session.abortTransaction();
      return res.status(403).json({ 
        success: false,
        message: 'Aucune entreprise associée' 
      });
    }

    // 2. Vérifier que la catégorie appartient à l'owner
    const category = await Category.findOne({
      _id: id,
      company_id: company._id
    }).session(session);

    if (!category) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        message: 'Catégorie non trouvée ou non autorisée' 
      });
    }

    // 3. Réactivation
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { 
        $set: { is_active: true },
        $push: { 
          updatedBy: { 
            user: owner._id, 
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