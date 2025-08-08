const userModel = require('../models/user.models');
const jwt = require('jsonwebtoken'); 
const companyModel = require('../models/company.models');
const storeModel = require('../models/stores.models');
const bcrypt = require('bcrypt');
const {formatImageUrl} = require('../utils/fileUtils');



const maxAge = 3 * 24 * 60 * 60 * 1000;

const createToken = (id) => {
  return jwt.sign(
    { id }, 
    process.env.TOKEN_SECRET, 
    { expiresIn: maxAge }
  );
};



module.exports.signUp = async (req, res) => {
    console.log(req.body);
    const {phone, first_name, last_name, password, role} = req.body;

    try {
        const user = userModel.create({phone, first_name, last_name, password, role})
        res.status(201).json({user:user._id})
    } catch (error) {
        res.status(400).send(error)
    }
}


module.exports.signIn = async (req, res) => {
  const { phone, password } = req.body;

  try {
    if (!password || password.length < 6) {
      return res.status(400).json({ 
        error: 'Le mot de passe doit contenir au moins 6 caractères' 
      });
    }

    const user = await userModel.login(phone, password);
    const token = createToken(user._id);
    
    res.cookie('jwt', token, { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Important pour HTTPS
      maxAge,
      sameSite: 'strict' // Protection contre CSRF
    });
    
    res.status(200).json({ 
      userId: user._id,
      role: user.role // Si vous voulez utiliser les rôles côté client
    });

  } catch (error) {
    console.error('Erreur de connexion:', error.message);
    res.status(401).json({ 
      error: 'Authentification échouée : ' + error.message 
    });
  }
};


// Dans auth.controller.js
module.exports.logout = (req, res) => {
  try {
    if (!req.cookies.jwt) {
      return res.status(400).json({ message: 'Aucune session active' });
    }

    res.clearCookie('jwt', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/' // Important pour effacer le cookie sur tout le domaine
    });

    // Optionnel : Log l'action
    console.log(`Utilisateur déconnecté : ${res.locals.user?._id || 'guest'}`);

    res.status(200).json({ 
      success: true,
      message: 'Déconnexion réussie' 
    });

  } catch (error) {
    console.error('Erreur logout:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la déconnexion' 
    });
  }
};


module.exports.loginOwner = async (req, res) => {
  const { phone, password } = req.body;

  try {
    const user = await userModel.login(phone, password);
    
    if (!['owner', 'supervisor'].includes(user.role)) {
      return res.status(403).json({ 
        error: "Accès réservé aux propriétaires et superviseurs",
        code: "ROLE_NOT_ALLOWED" 
      });
    }

    const token = createToken(user._id);
    
    res.cookie('jwt', token, { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3 * 24 * 60 * 60 * 1000 // 3 jours
    });

    res.status(200).json({
      userId: user._id,
      role: user.role,
      firstName: user.first_name 
    });

  } catch (error) {
    res.status(401).json({ 
      error: error.message,
      code: "LOGIN_FAILED" 
    });
  }
};


module.exports.getOwnerData = async (req, res) => {
  try {
    const user = res.locals.user;
    
    if (!['owner', 'supervisor'].includes(user.role)) {
      return res.status(403).json({ 
        error: "Accès non autorisé",
        code: "FORBIDDEN" 
      });
    }

    const ownerData = await userModel.findById(user._id)
      .select('-password -__v')
      .populate({
        path: 'stores',
        select: 'name contact.address.city is_active',
        populate: {
          path: 'employees',
          select: 'first_name last_name role',
          match: { is_active: true }
        }
      })
      .populate({
        path: 'supervisedStore',
        select: 'name employees'
      });

    if (!ownerData) {
      return res.status(404).json({ 
        error: "Utilisateur non trouvé",
        code: "USER_NOT_FOUND" 
      });
    }

    let companies = [];
    if (user.role === 'owner') {
      companies = await companyModel.find({ owner_id: user._id })
        .select('name ref_code settings is_active ');
    }

    res.status(200).json({
      user: {
        id: ownerData._id,
        firstName: ownerData.first_name,
        lastName: ownerData.last_name,
        phone: ownerData.phone,
        email: ownerData.email,
        role: ownerData.role
      },
      companies,
      stores: ownerData.stores || [],
      supervisedStore: ownerData.supervisedStore || null
    });

  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      code: "SERVER_ERROR" 
    });
  }
};


// Étape 1 : Authentification initiale
module.exports.loginCashierStep1 = async (req, res) => {
  const { phone, password } = req.body;

  try {
    // 1. Validation des entrées
    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        code: "MISSING_CREDENTIALS",
        message: "Téléphone et mot de passe requis"
      });
    }

    // 2. Recherche de l'utilisateur
    const user = await userModel.findOne({ phone, role: 'cashier' });
    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "Identifiants invalides ou compte désactivé"
      });
    }

    // 4. Récupération des magasins accessibles
    const accessibleStores = await storeModel.find({
      $and: [
        { is_active: true },
        { 
          $or: [
            { employees: user._id },
            { supervisor_id: user._id }
          ]
        }
      ]
    })
    .select('_id name photo company_id')
    .lean();

    if (accessibleStores.length === 0) {
      return res.status(403).json({
        success: false,
        code: "NO_STORES",
        message: "Aucun magasin actif assigné"
      });
    }

    // 5. Préparation de la réponse
    const response = {
      success: true,
      tempAuthToken: jwt.sign(
        { userId: user._id, step: 'partial' },
        process.env.TOKEN_SECRET,
        { expiresIn: '5m' } // Token temporaire valide 5 minutes
      ),
      user: {
        id: user._id,
        firstName: user.first_name,
        requiresPin: !!user.pin_code
      },
      stores: accessibleStores.map(store => ({
        id: store._id,
        name: store.name,
        photo: formatImageUrl(store.photo),
      }))
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Login Step 1 Error:', error);
    res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "Erreur serveur"
    });
  }
};

// Étape 2 : Sélection du magasin et génération du JWT final
module.exports.loginCashierStep2 = async (req, res) => {
  const { tempAuthToken, storeId } = req.body;

  try {
    // 1. Vérification du token temporaire
    const decoded = jwt.verify(tempAuthToken, process.env.TOKEN_SECRET);
    if (decoded.step !== 'partial') {
      return res.status(401).json({
        success: false,
        code: "INVALID_TOKEN",
        message: "Token invalide"
      });
    }

    const userId = decoded.userId;

    // 2. Récupération complète des données
    const user = await userModel.findById(userId)
      .select('first_name last_name phone pin_code')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "Utilisateur non trouvé"
      });
    }

    // 3. Vérification des permissions sur le magasin
    const store = await storeModel.findOne({
      _id: storeId,
      is_active: true,
      $or: [
        { employees: userId },
        { supervisor_id: userId }
      ]
    })
    .populate('company_id', 'name settings.currency logo');

    if (!store) {
      return res.status(403).json({
        success: false,
        code: "STORE_ACCESS_DENIED",
        message: "Accès refusé à ce magasin"
      });
    }

    // 4. Génération du token final
    const authToken = jwt.sign(
      {
        userId,
        storeId: store._id,
        companyId: store.company_id._id,
        role: 'cashier'
      },
      process.env.TOKEN_SECRET,
      { expiresIn: '8h' }
    );

    // 5. Réponse finale avec toutes les infos
    res.status(200).json({
      success: true,
      authToken,
      user: {
        id: userId,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        pinCode: user.pin_code,
        store: {
          id: store._id,
          name: store.name,
          address: store.address,
          photo: formatImageUrl(store.photo),
          company: {
            id: store.company_id._id,
            name: store.company_id.name,
            logo: formatImageUrl(store.company_id.logo),
            currency: store.company_id.settings.currency
          }
        }
      }
    });

  } catch (error) {
    console.error('Login Step 2 Error:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: "TOKEN_EXPIRED",
        message: "Session temporaire expirée"
      });
    }
    res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "Erreur serveur"
    });
  }
};

module.exports.logoutCashier = async (req, res) => {
  try {
    

    res.clearCookie('jwt', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    // Réponse cohérente avec votre style
    res.status(200).json({
      success: true,
      code: "LOGOUT_SUCCESS",
      message: "Déconnexion réussie"
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "Erreur lors de la déconnexion"
    });
  }
};