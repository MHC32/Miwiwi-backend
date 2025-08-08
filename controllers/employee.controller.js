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
      owner_id: currentUser._id,
      is_active: true 
    }).select('_id');

    if (ownerCompanies.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0
        }
      });
    }

    const companyIds = ownerCompanies.map(c => c._id);

    // 2. Trouver tous les stores de ces companies
    const ownerStores = await Store.find({
      company_id: { $in: companyIds },
      is_active: true
    }).select('_id employees supervisor_id');

    // 3. Collecter TOUS les employés (des stores + superviseurs)
    let allEmployeeIds = [];
    
    // Ajouter tous les employés des stores
    ownerStores.forEach(store => {
      if (store.employees && store.employees.length > 0) {
        allEmployeeIds.push(...store.employees);
      }
      // Ajouter le superviseur s'il existe
      if (store.supervisor_id) {
        allEmployeeIds.push(store.supervisor_id);
      }
    });

    // Supprimer les doublons
    allEmployeeIds = [...new Set(allEmployeeIds.map(id => id.toString()))];

    if (allEmployeeIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0
        }
      });
    }

    // 4. Construire la requête pour récupérer les employés
    const query = {
      _id: { $in: allEmployeeIds },
      role: { $in: ['cashier', 'supervisor'] },
      ...(role && { role }),
      ...(is_active !== undefined && { is_active: is_active === 'true' })
    };

    // 5. Filtrage par store spécifique si demandé
    if (storeId) {
      // Vérifier que le store appartient bien au owner
      const validStore = ownerStores.find(store => store._id.toString() === storeId);
      
      if (!validStore) {
        return res.status(403).json({
          success: false,
          message: 'Magasin non autorisé'
        });
      }

      // Filtrer pour ce store uniquement
      const storeEmployeeIds = [];
      if (validStore.employees && validStore.employees.length > 0) {
        storeEmployeeIds.push(...validStore.employees);
      }
      if (validStore.supervisor_id) {
        storeEmployeeIds.push(validStore.supervisor_id);
      }

      query._id = { $in: storeEmployeeIds };
    }

    // 6. Récupération paginée avec populate enrichi
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: '-password -__v',
      populate: [
        {
          path: 'stores',
          select: 'name contact phone company_id',
          populate: {
            path: 'company_id',
            select: 'name ref_code'
          },
          match: { 
            is_active: true,
            company_id: { $in: companyIds } // Seulement les stores du owner
          }
        },
        {
          path: 'supervisedStore',
          select: 'name contact phone company_id',
          populate: {
            path: 'company_id',
            select: 'name ref_code'
          },
          match: { 
            is_active: true,
            company_id: { $in: companyIds } // Seulement les stores du owner
          }
        },
        {
          path: 'createdBy',
          select: 'first_name last_name role'
        }
      ],
      sort: { createdAt: -1 }
    };

    const employees = await User.paginate(query, options);

    // 7. Enrichir les données avec les informations des stores
    const enrichedEmployees = employees.docs.map(employee => {
      const employeeObj = employee.toObject();
      
      // Ajouter les informations de store assignment
      const assignedStores = [];
      
      // Vérifier dans quels stores cet employé est assigné
      ownerStores.forEach(store => {
        const isEmployee = store.employees && store.employees.some(
          empId => empId.toString() === employee._id.toString()
        );
        const isSupervisor = store.supervisor_id && 
          store.supervisor_id.toString() === employee._id.toString();
        
        if (isEmployee || isSupervisor) {
          assignedStores.push({
            storeId: store._id,
            role: isSupervisor ? 'supervisor' : 'employee'
          });
        }
      });

      return {
        ...employeeObj,
        assignedStores,
        totalStoresAssigned: assignedStores.length
      };
    });

    // 8. Formater la réponse finale
    const response = {
      success: true,
      data: enrichedEmployees,
      pagination: {
        total: employees.totalDocs,
        page: employees.page,
        limit: employees.limit,
        totalPages: employees.totalPages
      },
      meta: {
        totalCompanies: ownerCompanies.length,
        totalStores: ownerStores.length,
        ...(storeId && { storeFilter: storeId })
      }
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

module.exports.activateEmployee = async (req, res) => {
  const { id } = req.params;
  const currentUser = res.locals.user;

  try {
    // Vérifier les permissions
    if (!['owner', 'admin'].includes(currentUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Action réservée aux propriétaires et administrateurs'
      });
    }

    // Trouver l'employé
    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employé non trouvé'
      });
    }

    // Vérifier que l'employé n'est pas déjà actif
    if (employee.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Employé déjà actif'
      });
    }

    // Activer l'employé
    const updatedEmployee = await User.findByIdAndUpdate(
      id,
      { 
        $set: { is_active: true },
        $unset: { deactivatedAt: "", deactivatedBy: "" }
      },
      { new: true }
    ).select('-password -__v');

    res.status(200).json({
      success: true,
      data: {
        id: updatedEmployee._id,
        first_name: updatedEmployee.first_name,
        last_name: updatedEmployee.last_name,
        phone: updatedEmployee.phone,
        role: updatedEmployee.role,
        is_active: updatedEmployee.is_active,
        stores: updatedEmployee.stores,
        supervisedStore: updatedEmployee.supervisedStore
      },
      message: 'Employé réactivé avec succès'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development'
        ? error.message
        : 'Erreur lors de la réactivation de l\'employé'
    });
  }
};

/**
 * @description Récupère les détails complets d'un employé
 * @route GET /api/employees/:id
 * @access Private (Owner/Admin/Supervisor concerné)
 */
module.exports.getEmployeeDetails = async (req, res) => {
  const { id } = req.params;
  const currentUser = res.locals.user;

  try {
    // Trouver l'employé avec les informations complètes
    const employee = await User.findById(id)
      .populate('stores', 'name contact company_id')
      .populate('supervisedStore', 'name contact company_id')
      .populate('createdBy', 'first_name last_name role')
      .select('-password -__v')
      .lean();

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employé non trouvé'
      });
    }

    // Vérifier les permissions
    let hasAccess = false;

    // Owner/Admin ont toujours accès
    if (['owner', 'admin'].includes(currentUser.role)) {
      hasAccess = true;
    } 
    // Un superviseur peut voir ses employés directs
    else if (currentUser.role === 'supervisor' && currentUser.supervisedStore) {
      const store = await Store.findById(currentUser.supervisedStore);
      if (store && store.employees.includes(id)) {
        hasAccess = true;
      }
    }
    // Un employé peut voir ses propres infos
    else if (currentUser._id.toString() === id) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ces informations'
      });
    }

    // Formater la réponse
    const response = {
      id: employee._id,
      first_name: employee.first_name,
      last_name: employee.last_name,
      phone: employee.phone,
      email: employee.email,
      role: employee.role,
      is_active: employee.is_active,
      pin_code: employee.pin_code,
      stores: employee.stores?.map(store => ({
        id: store._id,
        name: store.name,
        phone: store.contact?.phone,
        company_id: store.company_id
      })) || [],
      supervisedStore: employee.supervisedStore ? {
        id: employee.supervisedStore._id,
        name: employee.supervisedStore.name,
        phone: employee.supervisedStore.contact?.phone,
        company_id: employee.supervisedStore.company_id
      } : null,
      createdBy: employee.createdBy ? {
        id: employee.createdBy._id,
        name: `${employee.createdBy.first_name} ${employee.createdBy.last_name}`,
        role: employee.createdBy.role
      } : null,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt
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
        : 'Erreur lors de la récupération des détails de l\'employé'
    });
  }
};

/**
 * @description Désactive un employé actif
 * @route PATCH /api/employees/:id/deactivate
 * @access Private (Owner/Admin seulement)
 */
module.exports.deactivateEmployee = async (req, res) => {
  const { id } = req.params;
  const currentUser = res.locals.user;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ======================
    // 1. VALIDATIONS INITIALES
    // ======================

    // Vérifier les permissions
    if (!['owner', 'admin'].includes(currentUser.role)) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: 'Action réservée aux propriétaires et administrateurs'
      });
    }

    // Trouver l'employé (sans besoin de peupler les relations)
    const employee = await User.findById(id).session(session);

    if (!employee) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Employé non trouvé'
      });
    }

    // Vérifier que l'employé n'est pas déjà désactivé
    if (!employee.is_active) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Employé déjà désactivé'
      });
    }

    // ======================
    // 2. MISE À JOUR DE L'EMPLOYÉ (UNIQUEMENT LE STATUT)
    // ======================

    const updatedEmployee = await User.findByIdAndUpdate(
      id,
      { 
        $set: { 
          is_active: false,
          deactivatedAt: new Date(),
          deactivatedBy: currentUser._id
        }
        // On ne touche pas aux relations (pas de $unset)
      },
      { 
        new: true,
        session,
        select: '-password -__v',
        populate: [
          {
            path: 'stores',
            select: 'name _id'
          },
          {
            path: 'supervisedStore',
            select: 'name _id'
          }
        ]
      }
    );

    await session.commitTransaction();

    // ======================
    // 3. RÉPONSE FINALE
    // ======================

    res.status(200).json({
      success: true,
      data: {
        id: updatedEmployee._id,
        first_name: updatedEmployee.first_name,
        last_name: updatedEmployee.last_name,
        phone: updatedEmployee.phone,
        email: updatedEmployee.email,
        role: updatedEmployee.role,
        is_active: updatedEmployee.is_active,
        stores: updatedEmployee.stores, // On conserve les magasins
        supervisedStore: updatedEmployee.supervisedStore, // On conserve le magasin supervisé
        deactivatedAt: updatedEmployee.deactivatedAt,
        deactivatedBy: updatedEmployee.deactivatedBy
      },
      message: 'Employé désactivé avec succès'
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Erreur désactivation employé:', error);
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development'
        ? error.message
        : 'Erreur lors de la désactivation de l\'employé'
    });
  } finally {
    await session.endSession();
  }
};