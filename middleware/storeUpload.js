const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Chemin du dossier de destination
const uploadDir = 'public/uploads/stores';

// Création récursive des dossiers si inexistants
const ensureUploadDirExists = () => {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`Dossier upload créé : ${uploadDir}`);
  } catch (err) {
    console.error(`Erreur création dossier upload : ${err.message}`);
    throw new Error('Impossible de créer le dossier de stockage');
  }
};

// Vérification/création au démarrage
ensureUploadDirExists();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Re-vérifie que le dossier existe à chaque upload
    fs.access(uploadDir, fs.constants.W_OK, (err) => {
      if (err) {
        console.error(`Dossier inaccessible : ${uploadDir}`, err);
        return cb(new Error('Dossier de stockage inaccessible'));
      }
      cb(null, uploadDir);
    });
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'store-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Seuls JPEG, PNG et WEBP sont acceptés'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1 // 1 fichier par upload
  }
});

// Middleware de vérification supplémentaire
const checkUploadDir = (req, res, next) => {
  fs.access(uploadDir, fs.constants.W_OK, (err) => {
    if (err) {
      console.error('Erreur accès dossier upload:', err);
      return res.status(500).json({
        success: false,
        message: 'Erreur serveur: dossier de stockage indisponible'
      });
    }
    next();
  });
};

module.exports = {
  upload,
  checkUploadDir
};