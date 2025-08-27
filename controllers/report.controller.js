// Créer le fichier report.controller.js dans /controllers
const mongoose = require('mongoose');
const Order = require('../models/order.models');
const User = require('../models/user.models');
const Store = require('../models/stores.models');
const Product = require('../models/products.models');
const Company = require('../models/company.models');

/**
 * @description Rapport général pour un owner (tous ses magasins)
 * @route GET /api/owner/reports/overview
 * @access Private (Owner seulement)
 */
exports.getOwnerOverview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const ownerId = req.user._id;

    // Trouver toutes les companies du owner
    const companies = await Company.find({ owner_id: ownerId });
    const companyIds = companies.map(c => c._id);

    // Trouver tous les stores de ces companies
    const stores = await Store.find({ company_id: { $in: companyIds } });
    const storeIds = stores.map(s => s._id);

    const filter = {
      created_at: { 
        $gte: new Date(startDate), 
        $lte: new Date(endDate) 
      },
      status: 'completed',
      store: { $in: storeIds }
    };

    // Chiffre d'affaires total
    const revenueData = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 }
        }
      }
    ]);

    // Ventes par magasin
    const salesByStore = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$store',
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'stores',
          localField: '_id',
          foreignField: '_id',
          as: 'storeInfo'
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        totalRevenue: revenueData[0]?.totalRevenue || 0,
        totalOrders: revenueData[0]?.totalOrders || 0,
        stores: salesByStore,
        period: `${startDate} à ${endDate}`
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération du rapport'
    });
  }
};

/**
 * @description Rapport détaillé pour un magasin spécifique
 * @route GET /api/owner/reports/store/:storeId
 * @access Private (Owner seulement)
 */
exports.getStoreReport = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { startDate, endDate } = req.query;

    // Vérifier que le store appartient au owner
    const store = await Store.findById(storeId).populate('company_id');
    if (!store || store.company_id.owner_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce magasin'
      });
    }

    const filter = {
      store: storeId,
      created_at: { 
        $gte: new Date(startDate), 
        $lte: new Date(endDate) 
      },
      status: 'completed'
    };

    // Données du rapport
    const reportData = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          averageOrder: { $avg: '$total' }
        }
      }
    ]);

    // Produits les plus vendus
    const topProducts = await Order.aggregate([
      { $match: filter },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalSold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo'
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        store: store.name,
        period: `${startDate} à ${endDate}`,
        revenue: reportData[0]?.totalRevenue || 0,
        orders: reportData[0]?.totalOrders || 0,
        averageOrder: reportData[0]?.averageOrder || 0,
        topProducts: topProducts
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération du rapport'
    });
  }
};