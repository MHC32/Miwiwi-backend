const mongoose = require('mongoose');
const Store = require('../models/stores.models');

module.exports = {
    // Vérifie que l'utilisateur est bien un caissier
    verifyCashier: (req, res, next) => {
        const user = res.locals.user;
        
        if (!user || user.role !== 'cashier') {
            return res.status(403).json({
                success: false,
                code: "UNAUTHORIZED",
                message: "Accès réservé aux caissiers"
            });
        }
        
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                code: "ACCOUNT_INACTIVE",
                message: "Votre compte est désactivé"
            });
        }
        
        next();
    },

    // Vérifie que le caissier a accès au magasin spécifié
    checkStoreAccess: async (req, res, next) => {
        const { storeId } = req.query || req.params;
        const cashier = res.locals.user;
        
        if (!storeId) {
            return next(); // Pas de storeId spécifié, on continue
        }

        if (!mongoose.Types.ObjectId.isValid(storeId)) {
            return res.status(400).json({
                success: false,
                code: "INVALID_STORE_ID",
                message: "ID de magasin invalide"
            });
        }

        try {
            // Vérifie que le magasin existe et que le caissier y est affecté
            const store = await Store.findOne({
                _id: storeId,
                is_active: true,
                employees: cashier._id
            });

            if (!store) {
                return res.status(403).json({
                    success: false,
                    code: "STORE_ACCESS_DENIED",
                    message: "Accès non autorisé à ce magasin"
                });
            }

            // On attache le magasin à la requête pour usage ultérieur
            req.store = store;
            next();
        } catch (error) {
            res.status(500).json({
                success: false,
                code: "SERVER_ERROR",
                message: "Erreur de vérification des permissions"
            });
        }
    },

    // Vérifie que le caissier est en session active (si vous gérez des sessions)
    checkActiveSession: async (req, res, next) => {
        // Implémentez votre logique de vérification de session ici
        // Par exemple vérification dans Redis ou base de données
        next();
    }
};