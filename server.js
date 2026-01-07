// server.js - Fichier principal de l'application

// 1. IMPORTATIONS ================================================
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const { checkUser, requireAuth } = require('./middleware/auth.middleware');
const userRoutes = require('./routes/user.routes');
const adminRoutes = require('./routes/admin.routes');
const companyRoutes = require('./routes/company.routes.js');
const storeRoutes = require('./routes/store.routes');
const employeeRoutes = require('./routes/employee.routes');
const categoryRoutes = require('./routes/category.routes.js');
const productRoutes = require('./routes/product.routes.js');
const cashierRoutes = require('./routes/cashier.routes.js');
const meterReadingRoutes = require('./routes/meterReading.routes.js');
const reportRoutes = require('./routes/report.routes');
const proformatRoutes = require('./routes/proformat.routes.js');
const ownerDashboardRoutes = require('./routes/ownerDashboard.routes.js');
// 2. INITIALISATION =============================================
const app = express();

// 3. MIDDLEWARES DE BASE ========================================
app.use(morgan('dev')); // Logger des requêtes
app.use(cors({
  origin: process.env.CLIENT_URL || 'https://kesbiz.net' , //'http://localhost:3000'
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 4. CONNEXION BASE DE DONNÉES ==================================
const connectDB = require('./config/db');
connectDB(); 

// 5. MIDDLEWARE D'AUTHENTIFICATION ==============================
app.use((req, res, next) => {
  // Applique checkUser sur toutes les routes API et /jwtid
  if (req.path.startsWith('/api') || req.path === '/jwtid') {
    return checkUser(req, res, next);
  }
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.jpg') || filePath.endsWith('.png') || filePath.endsWith('.webp')) {
      res.set('Cache-Control', 'public, max-age=31536000');
    }
  }
}));

// 6. ROUTES =====================================================
app.set('baseUrl', process.env.BASE_URL || `https://kesbiz.net :${process.env.PORT}`); //http://192.168.1.205 
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/owner', companyRoutes);
app.use('/api/owner/', storeRoutes);
app.use('/api/owner/', employeeRoutes);
app.use('/api/owner/', categoryRoutes);
app.use('/api/owner/', productRoutes);
app.use('/api/owner/', meterReadingRoutes);
app.use('/api/owner/', reportRoutes);
app.use('/api/cashier/', cashierRoutes);
app.use('/api/owner/', proformatRoutes);
app.use('/api/owner/dashboard', ownerDashboardRoutes);
// Route de test d'authentification
app.get('/api/protected', requireAuth, (req, res) => {
  res.json({ 
    message: 'Route protégée',
    user: {
      id: res.locals.user._id,
      role: res.locals.user.role
    }
  });
});

// Route pour récupérer l'ID utilisateur via JWT
app.get('/jwtid', requireAuth, (req, res) => {
  res.status(200).json({ userId: res.locals.user._id });
});

// 7. GESTION DES ERREURS ========================================
app.use((err, req, res, next) => {
  console.error('Erreur:', err.stack);
  res.status(500).json({ 
    error: 'Erreur serveur',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 8. ROUTE 404 =================================================
app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint non trouvé' });
});

// 9. DÉMARRAGE SERVEUR =========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n--- Serveur démarré ---`);
  console.log(`Port: ${PORT}`);
  console.log(`Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`URL Client: ${process.env.CLIENT_URL}`);
  console.log(`URL API: ${process.env.BASE_URL || `http://localhost:${PORT}`}\n`);
});
