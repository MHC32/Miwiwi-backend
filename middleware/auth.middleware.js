const jwt = require("jsonwebtoken");
const userModel = require("../models/user.models");

module.exports.checkUser = async (req, res, next) => {
  const token = req.cookies.jwt;

  if (token) {
    jwt.verify(token, process.env.TOKEN_SECRET, async (err, decodedToken) => {
      if (err) {
        res.locals.user = null;
        res.cookie("jwt", "", { maxAge: 1 });
        next();
      } else {
        try {
          const userId = decodedToken.id;
          console.log("decodedToken ", decodedToken);
          let user = await userModel.findById(userId);
          res.locals.user = user;
          console.log(res.locals.user);
          next();
        } catch (error) {
          res.locals.user = null;
          res.cookie("jwt", "", { maxAge: 1 });
        }
      }
    });
  } else {
    res.locals.user = null;
    next();
  }
};

module.exports.requireAuth = (req, res, next) => {
  const token = req.cookies.jwt;

  if (!token) {
    console.log('Aucun token fourni');
    return res.status(401).json({ message: 'Non autorisé' });
  }

  jwt.verify(token, process.env.TOKEN_SECRET, async (err, decodedToken) => {
    if (err) {
      console.error('Token invalide:', err);
      res.clearCookie('jwt');
      return res.status(401).json({ message: 'Session expirée' });
    }

    try {
      const user = await userModel.findById(decodedToken.id);
      if (!user) {
        res.clearCookie('jwt');
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }

      res.locals.user = user;
      req.user = user;
      next();
    } catch (error) {
      console.error('Erreur DB:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });
};

module.exports.isAdmin = async (req, res, next) => {
    try {
        const user = res.locals.user;
        if(!user || user.role != 'admin'){
            return res.status(403).json({
                message: 'Accès refusé: droits insuffisants'
            })
        }
        next();
    } catch (error) {
        res.status(500).json({ error });
    }
}

module.exports.isOwner = (req, res, next) => {
  try {
    const user = res.locals.user;
    if (!user || user.role != 'owner') {
      return res.status(403).json({
        message: 'Accès refusé: droits insuffisants'
      })
    }
    next()
  } catch (error) {
    res.status(500).json({ error });
  }
};

module.exports.verifyCashierToken = (req, res, next) => {
  const token = req.cookies.jwt || req.headers.authorization?.split(' ')[1];
  
  jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
    if (err || decoded.role !== 'cashier') {
      return res.status(401).json({ message: 'Non autorisé' });
    }
    
    req.user = decoded;
    next();
  });
};

module.exports.isCashier = async (req, res, next) => {
    try {
        const user = res.locals.user;
        
        // Vérifie que l'utilisateur est authentifié ET a le rôle cashier
        if (!user || user.role !== 'cashier') {
            return res.status(403).json({
                success: false,
                code: "ACCESS_DENIED",
                message: "Accès réservé aux caissiers"
            });
        }

        // Vérifie que le compte est actif
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                code: "ACCOUNT_INACTIVE", 
                message: "Votre compte caissier est désactivé"
            });
        }

        next();
    } catch (error) {
        res.status(500).json({
            success: false,
            code: "SERVER_ERROR",
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : "Erreur de vérification des permissions"
        });
    }
};


module.exports.isSupervisor = async (req, res, next) => {
    try {
        const user = res.locals.user;
        
        if (!user || !['supervisor', 'owner', 'admin'].includes(user.role)) {
            return res.status(403).json({
                success: false,
                code: "ACCESS_DENIED",
                message: "Accès réservé aux superviseurs, propriétaires et administrateurs"
            });
        }

        next();
    } catch (error) {
        res.status(500).json({
            success: false,
            code: "SERVER_ERROR",
            error: process.env.NODE_ENV === 'development' 
                ? error.message 
                : "Erreur de vérification des permissions"
        });
    }
};