// server.js - Fichier principal de l'application

// 1. IMPORTATIONS ================================================
require('dotenv').config({ path: './config/.env' });
const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const cors = require('cors');
const { checkUser, requireAuth } = require('./middleware/auth.middleware');
const userRoutes = require('./routes/user.routes');
const adminRoutes = require('./routes/admin.routes')
const companyRoutes = require('./routes/company.routes.js');
const storeRoutes = require('./routes/store.routes')

// 2. INITIALISATION =============================================
const app = express();

// 3. MIDDLEWARES DE BASE ========================================
app.use(morgan('dev')); // Logger des requêtes
// app.use(cors({
//   origin: process.env.CLIENT_URL || 'http://localhost:3000',
//   credentials: true
// }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 4. CONNEXION BASE DE DONNÉES ==================================
require('./config/db');

// 5. MIDDLEWARE D'AUTHENTIFICATION ==============================
app.use((req, res, next) => {
  // Applique checkUser sur toutes les routes API et /jwtid
  if (req.path.startsWith('/api') || req.path === '/jwtid') {
    return checkUser(req, res, next);
  }
  next();
});

// 6. ROUTES =====================================================
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/store/', storeRoutes);
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
//   console.log(`URL Client: ${process.env.CLIENT_URL || 'http://localhost:3000'}\n`);
});

