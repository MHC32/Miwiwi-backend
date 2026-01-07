const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Crée un middleware d'upload générique
 * @param {string} folder - Dossier de destination (ex: 'stores', 'products')
 * @param {string} prefix - Préfixe pour le nom de fichier (ex: 'store-', 'product-')
 * @param {number} maxFileSize - Taille maximale en octets (défaut: 5MB)
 * @returns {Object} Middleware d'upload avec `upload` et `checkUploadDir`
 */
const createUploadMiddleware = (folder, prefix, maxFileSize = 5 * 1024 * 1024) => {
  const uploadDir = `public/uploads/${folder}`;

  // Créer le répertoire s'il n'existe pas
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`📁 Dossier upload créé: ${uploadDir}`);
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Vérifier l'accès en écriture
      fs.access(uploadDir, fs.constants.W_OK, (err) => {
        if (err) {
          console.error(`❌ Dossier inaccessible: ${uploadDir}`, err);
          return cb(new Error('Dossier de stockage inaccessible'));
        }
        cb(null, uploadDir);
      });
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, prefix + uniqueSuffix + ext);
    }
  });

  const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Type de fichier non autorisé. Seuls ${allowedTypes.join(', ')} sont acceptés`), false);
    }
  };

  const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
      fileSize: maxFileSize,
      files: 1
    }
  });

  const checkUploadDir = (req, res, next) => {
    fs.access(uploadDir, fs.constants.W_OK, (err) => {
      if (err) {
        console.error('❌ Erreur accès dossier upload:', err);
        return res.status(500).json({
          success: false,
          message: 'Erreur serveur: dossier de stockage indisponible'
        });
      }
      next();
    });
  };

  return {
    upload,
    checkUploadDir
  };
};

// Export des middlewares pré-configurés
module.exports = {
  // Pour les magasins
  storeUpload: createUploadMiddleware('stores', 'store-'),
  
  // Pour les produits
  productUpload: createUploadMiddleware('products', 'product-'),
  
  // Pour les relevés de compteurs
  meterUpload: createUploadMiddleware('meter-readings', 'meter-'),
  
  // Version générique pour d'autres types d'upload
  createUploadMiddleware
};