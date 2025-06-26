const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/user.models');
const Store = require('../models/stores.models');
const Company = require('../models/company.models');

module.exports.createEmployeeForStore = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { phone, last_name, first_name, role, email, password, storeIds, pin_code } = req.body;
        const currentUser = res.locals.user;

        if (currentUser.role !== 'owner') {
            await session.abortTransaction();
            return res.status(403).json({
                success: false,
                message: 'Action réservée aux propriétaires'
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

        if (storeIds?.length > 0) {
            const ownerCompanies = await Company.find({
                owner_id: currentUser._id
            }).session(session);

            const ownerCompanyIds = ownerCompanies.map(c => c._id);

            const validStoresCount = await Store.countDocuments({
                _id: { $in: storeIds },
                company_id: { $in: ownerCompanyIds },
                is_active: true
            }).session(session);

            if (validStoresCount !== storeIds.length) {
                await session.abortTransaction();
                return res.status(403).json({
                    success: false,
                    message: 'Un ou plusieurs magasins ne sont pas dans vos companies ou sont invalides'
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

        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(password, salt);

        const newEmployee = await User.create([{
            phone,
            first_name,
            last_name,
            email,
            password: hashedPassword,
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

            if (role === 'supervisor') {
                if (storeIds.length !== 1) {
                    await session.abortTransaction();
                    return res.status(400).json({
                        success: false,
                        message: 'Un superviseur doit être affecté à exactement un magasin'
                    });
                }

                await Store.findByIdAndUpdate(
                    storeIds[0],
                    { supervisor_id: newEmployee[0]._id },
                    { session }
                );
            }
        }

        await session.commitTransaction();

        const employeeData = newEmployee[0].toObject();
        delete employeeData.password;
        delete employeeData.__v;

        return res.status(201).json({
            success: true,
            data: employeeData,
            message: 'Employé créé avec succès'
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Erreur création employé:', error);
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
 * @description Met à jour un employé avec gestion avancée des rôles et magasins
 * @route PATCH /api/owner/employees/:id
 * @access Private (Owner seulement)
 */
module.exports.updateEmployee = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const updates = req.body;
        const currentUser = res.locals.user;

        // ======================
        // 1. VALIDATIONS INITIALES
        // ======================

        // Vérifier que l'utilisateur est bien un owner
        if (currentUser.role !== 'owner') {
            await session.abortTransaction();
            return res.status(403).json({
                success: false,
                message: 'Action réservée aux propriétaires'
            });
        }

        // Vérifier que l'employé existe
        const employee = await User.findById(id).session(session);
        if (!employee) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Employé non trouvé'
            });
        }

        // ======================
        // 2. VALIDATION DES DONNÉES
        // ======================

        // Valider les rôles autorisés
        if (updates.role && !['cashier', 'supervisor'].includes(updates.role)) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Rôle invalide. Doit être "cashier" ou "supervisor"'
            });
        }

        // Valider les magasins si modification
        if (updates.storeIds) {
            // Récupérer les companies du owner
            const ownerCompanies = await Company.find({
                owner_id: currentUser._id
            }).session(session);

            // Vérifier l'appartenance des magasins
            if (updates.storeIds) {
                const ownerCompanies = await Company.find({
                    owner_id: currentUser._id
                }).session(session);

                const validStoresCount = await Store.countDocuments({
                    _id: { $in: updates.storeIds },
                    company_id: { $in: ownerCompanies.map(c => c._id) },
                    is_active: true
                }).session(session);

                if (validStoresCount !== updates.storeIds.length) {
                    await session.abortTransaction();
                    return res.status(403).json({
                        success: false,
                        message: 'Un ou plusieurs magasins ne vous appartiennent pas'
                    });
                }
            }
            // Validation spécifique pour les superviseurs
            if (updates.role === 'supervisor' && updates.storeIds.length !== 1) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: 'Un superviseur doit être affecté à exactement un magasin'
                });
            }
        }

        // ======================
        // 3. PRÉPARATION DES MODIFICATIONS
        // ======================

        const updateData = { ...updates };
        delete updateData._id; // Empêche la modification de l'ID

        // Hash du mot de passe si fourni
        if (updates.password) {
            const salt = await bcrypt.genSalt();
            updateData.password = await bcrypt.hash(updates.password, salt);
        }

        // ======================
        // 4. GESTION DES RÔLES
        // ======================

        if (updates.role === 'supervisor') {
            // 4a. NETTOYAGE DES ANCIENNES RELATIONS (si changement de rôle)
            if (employee.role !== 'supervisor') {
                await Store.updateMany(
                    { employees: id },
                    { $pull: { employees: id } },
                    { session }
                );

                updateData.stores = []; // Réinitialise le tableau stores
            }

            // 4b. MISE À JOUR COMME SUPERVISEUR
            await Store.findByIdAndUpdate(
                updates.storeIds[0],
                {
                    $addToSet: { employees: id },  // Ajoute aux employés généraux
                    $set: { supervisor_id: id }     // Définit comme superviseur principal
                },
                { session }
            );

            updateData.supervisedStore = updates.storeIds[0]; // Lien bidirectionnel

        } else if (updates.role === 'cashier' && employee.role === 'supervisor') {
            // 4c. NETTOYAGE SI PASSAGE DE SUPERVISEUR À CAISSIER
            await Store.updateMany(
                { supervisor_id: id },
                { $unset: { supervisor_id: "" } },
                { session }
            );

            updateData.supervisedStore = null;
        }

        // ======================
        // 5. MISE À JOUR DE L'EMPLOYÉ
        // ======================

        const updatedEmployee = await User.findByIdAndUpdate(
            id,
            updateData,
            {
                new: true,
                session,
                runValidators: true
            }
        ).select('-password -__v');

        // ======================
        // 6. GESTION DES MAGASINS (cas général)
        // ======================

        if (updates.storeIds && updates.role !== 'supervisor') {
            // Retirer des anciens magasins
            await Store.updateMany(
                { employees: id },
                { $pull: { employees: id } },
                { session }
            );

            // Ajouter aux nouveaux magasins
            await Store.updateMany(
                { _id: { $in: updates.storeIds } },
                { $addToSet: { employees: id } },
                { session }
            );
        }

        await session.commitTransaction();

        // ======================
        // 7. RÉPONSE FINALE
        // ======================

        return res.status(200).json({
            success: true,
            data: updatedEmployee,
            message: 'Employé mis à jour avec succès'
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Erreur mise à jour employé:', error);
        return res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'development'
                ? error.message
                : 'Erreur lors de la mise à jour'
        });
    } finally {
        await session.endSession();
    }
};



/**
 * @description Liste tous les employés du owner (filtrés par store si besoin)
 * @route GET /api/owner/employees
 * @access Private (Owner seulement)
 */
module.exports.listOwnerEmployees = async (req, res) => {
  try {
    const currentUser = res.locals.user;
    const { storeId, role, is_active, page = 1, limit = 10 } = req.query;

    // 1. Trouver toutes les companies du owner
    const ownerCompanies = await Company.find({ 
      owner_id: currentUser._id 
    }).select('_id');

    // 2. Construire la requête de base
    const query = {
      createdBy: currentUser._id,
      role: { $in: ['cashier', 'supervisor'] },
      ...(role && { role }),
      ...(is_active && { is_active: is_active === 'true' })
    };

    // 3. Filtrage par store si spécifié
    if (storeId) {
      // Vérifier que le store appartient bien au owner
      const validStore = await Store.findOne({
        _id: storeId,
        company_id: { $in: ownerCompanies.map(c => c._id) }
      });

      if (!validStore) {
        return res.status(403).json({
          success: false,
          message: 'Magasin non autorisé'
        });
      }

      query._id = { $in: validStore.employees };
    }

    // 4. Récupération paginée
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: '-password -__v',
      populate: [
        {
          path: 'stores',
          select: 'name contact.address.city',
          match: { is_active: true }
        },
        {
          path: 'supervisedStore',
          select: 'name'
        }
      ],
      sort: { createdAt: -1 }
    };

    const employees = await User.paginate(query, options);

    // 5. Formater la réponse
    const response = {
      success: true,
      data: employees.docs,
      pagination: {
        total: employees.totalDocs,
        page: employees.page,
        limit: employees.limit,
        totalPages: employees.totalPages
      },
      ...(storeId && { storeFilter: storeId })
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Erreur liste employés owner:', error);
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur serveur'
    });
  }
};