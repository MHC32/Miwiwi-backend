const express = require('express');
const router = express.Router();
const ownerDashboardController = require('../controllers/ownerDashboard.controller');
const { requireAuth, isOwner } = require('../middleware/auth.middleware');// Ton middleware d'authentification

/**
 * ROUTES DASHBOARD OWNER
 * Toutes ces routes nécessitent une authentification et le rôle 'owner'
 */

// Middleware de protection - toutes les routes nécessitent authentification et rôle owner


/**
 * @route   GET /api/owner/dashboard/stats
 * @desc    Obtenir les statistiques du jour (caissiers connectés, tickets, ventes)
 * @access  Private/Owner
 */
router.get('/stats',requireAuth, isOwner, ownerDashboardController.getDailyStats);

/**
 * @route   GET /api/owner/dashboard/sales-by-product
 * @desc    Obtenir la répartition des ventes par produit (Donut Chart)
 * @query   period=today|week|month|year
 * @access  Private/Owner
 */
router.get('/sales-by-product',requireAuth, isOwner, ownerDashboardController.getSalesByProduct);

/**
 * @route   GET /api/owner/dashboard/sales-by-month
 * @desc    Obtenir les ventes mensuelles pour une année (Line Chart)
 * @query   year=2024
 * @access  Private/Owner
 */
router.get('/sales-by-month',requireAuth, isOwner, ownerDashboardController.getSalesByMonth);

/**
 * @route   GET /api/owner/dashboard/top-products
 * @desc    Obtenir les produits les plus vendus (optionnel)
 * @query   limit=5
 * @access  Private/Owner
 */
router.get('/top-products',requireAuth, isOwner, ownerDashboardController.getTopProducts);

/**
 * @route   GET /api/owner/dashboard/sales-trends
 * @desc    Obtenir les tendances de ventes quotidiennes (optionnel)
 * @query   days=30
 * @access  Private/Owner
 */
router.get('/sales-trends',requireAuth, isOwner, ownerDashboardController.getSalesTrends);

module.exports = router;