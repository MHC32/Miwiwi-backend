const userModel = require('../models/user.models');
const jwt = require('jsonwebtoken'); 
const companyModel = require('../models/company.models');

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