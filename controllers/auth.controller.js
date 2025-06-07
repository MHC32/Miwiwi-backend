const userModel = require('../models/user.models');
const jwt = require('jsonwebtoken'); 

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

