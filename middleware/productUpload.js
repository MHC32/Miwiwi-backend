const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = 'public/uploads/products';

// Créer le répertoire s'il n'existe pas
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'product-' + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Seuls les fichiers JPEG, PNG et WEBP sont autorisés'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

module.exports = {
    upload,
    checkUploadDir: (req, res, next) => {
        fs.access(uploadDir, fs.constants.W_OK, (err) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Le dossier de stockage est inaccessible'
                });
            }
            next();
        });
    }
};