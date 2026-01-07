const mongoose = require('mongoose');
const Product = require('../models/products.models');
const Company = require('../models/company.models');
const Store = require('../models/stores.models');
const Category = require('../models/category.models');
const path = require('path');
const fs = require('fs');


/**
 * @description Crée un nouveau produit pour un magasin du owner
 * @route POST /api/owner/products
 * @access Private (Owner seulement)
 */
module.exports.createProduct = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.startTransaction();
        const ownerId = req.user._id;
        
        const { 
            name,
            barcode,
            type,
            unit,
            storeId,
            categoryId,
            inventory,
            pricing,
            variants
        } = req.body;

        // Validation des données
        if (!name || !type || !storeId) {
            await session.abortTransaction();
            if (req.files) cleanUpUploadedFiles(req.files);
            return res.status(400).json({
                success: false,
                message: 'Nom, type et magasin sont obligatoires'
            });
        }

        // 1. Vérifier que le magasin existe
        const store = await Store.findById(storeId).session(session);
        if (!store) {
            await session.abortTransaction();
            if (req.files) cleanUpUploadedFiles(req.files);
            return res.status(404).json({
                success: false,
                message: 'Magasin non trouvé'
            });
        }

        // 2. Vérifier que la company du store appartient au owner
        const company = await Company.findOne({
            _id: store.company_id,
            owner_id: ownerId
        }).session(session);

        if (!company) {
            await session.abortTransaction();
            if (req.files) cleanUpUploadedFiles(req.files);
            return res.status(403).json({
                success: false,
                message: 'Vous n\'êtes pas autorisé à ajouter des produits à ce magasin'
            });
        }

        // 3. Vérification de la catégorie si fournie
        if (categoryId) {
            const category = await Category.findOne({
                _id: categoryId,
                company_id: store.company_id
            }).session(session);

            if (!category) {
                await session.abortTransaction();
                if (req.files) cleanUpUploadedFiles(req.files);
                return res.status(403).json({
                    success: false,
                    message: 'Catégorie non autorisée'
                });
            }
        }

        // Création de l'objet produit
        const productData = {
            name,
            barcode,
            type,
            unit,
            company: store.company_id,
            store_id: storeId,
            category_id: categoryId,
            inventory: {
                current: inventory?.current || 0,
                min_stock: inventory?.min_stock || 5,
                alert_enabled: inventory?.alert_enabled !== false
            },
            pricing: {
                mode: pricing?.mode || 'fixed',
                base_price: pricing?.base_price || 0,
                buy_price: pricing?.buy_price,
                fuel_config: pricing?.fuel_config,
                variable_price_rules: pricing?.variable_price_rules || []
            },
            variants: variants || [],
            createdBy: ownerId
        };

        // Gestion des images uploadées
        if (req.files?.length > 0) {
            productData.images = req.files.map((file, index) => ({
                url: `/uploads/products/${file.filename}`,
                is_main: index === 0
            }));
        }

        // Création du produit
        const [newProduct] = await Product.create([productData], { session });

        // Mise à jour de la catégorie si nécessaire
        if (categoryId) {
            await Category.findByIdAndUpdate(
                categoryId,
                { $addToSet: { products: newProduct._id } },
                { session }
            );
        }

        await session.commitTransaction();
        
        // Construction de la réponse
        const response = {
            id: newProduct._id,
            name: newProduct.name,
            type: newProduct.type,
            store: store.name,
            company: company.name
        };

        // Ajout de l'image principale si elle existe
        if (newProduct.images?.length > 0) {
            response.main_image = newProduct.images.find(img => img.is_main)?.url || 
                               newProduct.images[0].url;
        }

        res.status(201).json({
            success: true,
            data: response
        });

    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        if (req.files) cleanUpUploadedFiles(req.files);

        let status = 500;
        let message = 'Erreur lors de la création du produit';

        if (error.code === 11000 && error.keyPattern?.barcode) {
            status = 400;
            message = 'Ce code-barres existe déjà';
        } else if (error.name === 'ValidationError') {
            status = 400;
            message = error.message;
        }

        res.status(status).json({
            success: false,
            message,
            error: process.env.NODE_ENV === 'development' ? error : undefined
        });
    } finally {
        await session.endSession();
    }
};


// Fonction utilitaire pour nettoyer les fichiers uploadés
function cleanUpUploadedFiles(files) {
    files.forEach(file => {
        const filePath = path.join('public/uploads/products', file.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });
}

/**
 * @description Liste les produits des magasins du owner
 * @route GET /api/owner/products
 * @access Private (Owner seulement)
 */
module.exports.listOwnerProducts = async (req, res) => {
    try {
        const ownerId = req.user._id;
        const { 
            page = 1, 
            limit = 10,
            storeId,
            categoryId,
            type,
            search,
            sortBy = 'name',
            sortOrder = 'asc'
        } = req.query;

        // 1. Trouver les companies du owner
        const companies = await Company.find({ owner_id: ownerId });
        const companyIds = companies.map(c => c._id);

        // 2. Construire la requête de base
        const query = { 
            company: { $in: companyIds } 
        };

        // 3. Appliquer les filtres
        if (storeId) {
            // Vérifier que le store appartient au owner
            const store = await Store.findOne({
                _id: storeId,
                company_id: { $in: companyIds }
            });
            if (!store) {
                return res.status(403).json({
                    success: false,
                    message: 'Magasin non autorisé'
                });
            }
            query.store_id = storeId;
        }

        if (categoryId) query.category_id = categoryId;
        if (type) query.type = type;
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { barcode: { $regex: search, $options: 'i' } }
            ];
        }

        // 4. Exécuter la requête
        const products = await Product.find(query)
            .select('-__v -history')
            .populate('store_id', 'name')
            .populate('category_id', 'name')
            .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

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
 * @description Met à jour un produit du owner
 * @route PATCH /api/owner/products/:id
 * @access Private (Owner seulement)
 */
module.exports.updateProduct = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.startTransaction();
        const ownerId = req.user._id;
        const { id } = req.params;
        const updates = req.body;

        // Vérifier que le produit appartient au owner
        const product = await Product.findOne({
            _id: id,
            company: { $in: await Company.find({ owner_id: ownerId }).distinct('_id') }
        }).session(session);

        if (!product) {
            await session.abortTransaction();
            if (req.files) {
                cleanUpUploadedFiles(req.files);
            }
            return res.status(404).json({
                success: false,
                message: 'Produit non trouvé ou non autorisé'
            });
        }

        // Champs autorisés (incluant maintenant les images)
        const allowedUpdates = [
            'name',
            'barcode',
            'type',
            'unit',
            'category_id',
            'inventory',
            'pricing',
            'variants',
            'images'
        ];

        // Filtrage des mises à jour
        const filteredUpdates = {};
        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                filteredUpdates[key] = updates[key];
            }
        });

        // Gestion des nouvelles images uploadées
        if (req.files && req.files.length > 0) {
            filteredUpdates.$push = {
                images: {
                    $each: req.files.map(file => ({
                        url: `/uploads/products/${file.filename}`,
                        is_main: false
                    }))
                }
            };
        }

        // Gestion de la catégorie
        if (filteredUpdates.category_id) {
            const newCategory = await Category.findOne({
                _id: filteredUpdates.category_id,
                company_id: product.company
            }).session(session);

            if (!newCategory) {
                await session.abortTransaction();
                if (req.files) {
                    cleanUpUploadedFiles(req.files);
                }
                return res.status(403).json({
                    success: false,
                    message: 'Catégorie non autorisée'
                });
            }

            // Retirer l'ancienne catégorie
            if (product.category_id) {
                await Category.findByIdAndUpdate(
                    product.category_id,
                    { $pull: { products: product._id } },
                    { session }
                );
            }

            // Ajouter à la nouvelle catégorie
            await Category.findByIdAndUpdate(
                filteredUpdates.category_id,
                { $addToSet: { products: product._id } },
                { session }
            );
        }

        // Mise à jour du produit
        const updatePayload = {
            $set: filteredUpdates,
            $push: { 
                history: {
                    field: 'update',
                    changedBy: ownerId,
                    at: new Date()
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

        // Préparation de la réponse
        const response = updatedProduct.toObject();
        
        // Ajout de l'image principale
        if (updatedProduct.images?.length > 0) {
            response.main_image = updatedProduct.images.find(img => img.is_main)?.url || 
                                updatedProduct.images[0].url;
        }

        res.status(200).json({
            success: true,
            data: response
        });

    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        
        if (req.files) {
            cleanUpUploadedFiles(req.files);
        }

        if (error.code === 11000 && error.keyPattern?.barcode) {
            return res.status(400).json({
                success: false,
                message: 'Ce code-barres est déjà utilisé'
            });
        }

        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Erreur lors de la mise à jour du produit'
        });
    } finally {
        await session.endSession();
    }
};

/**
 * @description Désactive un produit (soft delete)
 * @route DELETE /api/owner/products/:id
 * @access Private (Owner seulement)
 */
module.exports.deactivateProduct = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.startTransaction();
        const ownerId = req.user._id;
        const { id } = req.params;

        // 1. Vérifier que le produit appartient au owner
        const product = await Product.findOneAndUpdate(
            {
                _id: id,
                company: { $in: await Company.find({ owner_id: ownerId }).distinct('_id') }
            },
            { 
                $set: { 
                    is_active: false,
                    archivedAt: new Date(),
                    archivedBy: ownerId
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
                message: 'Produit non trouvé ou non autorisé'
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
        if (session.inTransaction()) await session.abortTransaction();
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Erreur lors de la désactivation du produit'
        });
    } finally {
        await session.endSession();
    }
};

/**
 * @description Réactive un produit désactivé
 * @route PATCH /api/owner/products/:id/reactivate
 * @access Private (Owner seulement)
 */
module.exports.reactivateProduct = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.startTransaction();
        const ownerId = req.user._id;
        const { id } = req.params;

        // 1. Vérifier que le produit existe, est archivé ET appartient au owner
        const product = await Product.findOne({
            _id: id,
            archivedAt: { $exists: true },
            company: { $in: await Company.find({ owner_id: ownerId }).distinct('_id') }
        }).session(session);

        if (!product) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Produit non trouvé, non archivé ou non autorisé'
            });
        }

        // 2. Réactiver le produit
        const reactivatedProduct = await Product.findByIdAndUpdate(
            id,
            {
                $unset: { 
                    archivedAt: "",
                    archivedBy: "" 
                },
                $set: { 
                    is_active: true,
                    updatedAt: new Date() 
                },
                $push: {
                    history: {
                        field: 'reactivation',
                        changedBy: ownerId,
                        at: new Date(),
                        details: {
                            from_status: 'archived',
                            to_status: 'active'
                        }
                    }
                }
            },
            { 
                new: true,
                session 
            }
        ).populate('company', 'name');

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            data: {
                id: reactivatedProduct._id,
                name: reactivatedProduct.name,
                status: 'active',
                company: reactivatedProduct.company.name
            }
        });

    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'development' 
                ? { 
                    message: error.message,
                    stack: error.stack 
                  } 
                : 'Erreur lors de la réactivation'
        });
    } finally {
        await session.endSession();
    }
};