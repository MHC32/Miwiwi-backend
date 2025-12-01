const Order = require('../models/order.models');
const User = require('../models/user.models');
const Store = require('../models/stores.models'); // Assumant que tu as un modèle Store
const Product = require('../models/products.models');

/**
 * DASHBOARD OWNER CONTROLLER - VERSION MULTI-MAGASINS
 * Gère toutes les statistiques pour TOUS les magasins de l'owner
 */

/**
 * GET /api/owner/dashboard/stats
 * Retourne les statistiques en temps réel pour TOUS les magasins de l'owner
 */
exports.getDailyStats = async (req, res) => {
  try {
    const ownerId = req.user.id; // L'ID de l'owner authentifié

    // 1. Récupérer TOUS les magasins de cet owner
    const stores = await Store.find({ ownerId: ownerId });
    const storeIds = stores.map(store => store._id);

    if (storeIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          connectedCashiers: { count: 0, label: 'Caissiers connectés aujourd\'hui' },
          dailyTickets: { count: 0, variation: '0', label: 'Tickets créés aujourd\'hui' },
          dailySales: { amount: '0.00', variation: '0', completedOrders: 0, label: 'Ventes du jour' },
          currency: 'HTG',
          storesCount: 0
        }
      });
    }

    // Date du début de la journée (00:00:00)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Date de fin de journée (23:59:59)
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Nombre de caissiers connectés aujourd'hui (TOUS les magasins)
    const connectedCashiers = await User.countDocuments({
      role: 'caissier',
      storeId: { $in: storeIds }, // ← CHANGEMENT: tous les magasins
      lastLoginDate: { $gte: startOfDay, $lte: endOfDay },
      isActive: true
    });

    // 2. Nombre de tickets créés aujourd'hui (TOUS les magasins)
    const ticketsCount = await Order.countDocuments({
      storeId: { $in: storeIds }, // ← CHANGEMENT: tous les magasins
      createdAt: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['pending', 'completed', 'validated'] }
    });

    // 3. Montant total des ventes aujourd'hui (TOUS les magasins)
    const salesResult = await Order.aggregate([
      {
        $match: {
          storeId: { $in: storeIds }, // ← CHANGEMENT: tous les magasins
          createdAt: { $gte: startOfDay, $lte: endOfDay },
          status: { $in: ['completed', 'validated'] }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$total_price' },
          totalOrders: { $sum: 1 }
        }
      }
    ]);

    const todaySales = salesResult.length > 0 ? salesResult[0].totalAmount : 0;
    const completedOrders = salesResult.length > 0 ? salesResult[0].totalOrders : 0;

    // Calculer les pourcentages de variation (comparaison avec hier)
    const yesterday = new Date(startOfDay);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // Ventes d'hier (TOUS les magasins)
    const yesterdaySalesResult = await Order.aggregate([
      {
        $match: {
          storeId: { $in: storeIds }, // ← CHANGEMENT: tous les magasins
          createdAt: { $gte: yesterday, $lte: yesterdayEnd },
          status: { $in: ['completed', 'validated'] }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$total_price' }
        }
      }
    ]);

    const yesterdaySales = yesterdaySalesResult.length > 0 ? yesterdaySalesResult[0].totalAmount : 0;
    
    // Calcul du pourcentage de variation
    let salesVariation = 0;
    if (yesterdaySales > 0) {
      salesVariation = ((todaySales - yesterdaySales) / yesterdaySales) * 100;
    } else if (todaySales > 0) {
      salesVariation = 100;
    }

    // Tickets d'hier (TOUS les magasins)
    const yesterdayTickets = await Order.countDocuments({
      storeId: { $in: storeIds }, // ← CHANGEMENT: tous les magasins
      createdAt: { $gte: yesterday, $lte: yesterdayEnd },
      status: { $in: ['pending', 'completed', 'validated'] }
    });

    let ticketsVariation = 0;
    if (yesterdayTickets > 0) {
      ticketsVariation = ((ticketsCount - yesterdayTickets) / yesterdayTickets) * 100;
    } else if (ticketsCount > 0) {
      ticketsVariation = 100;
    }

    res.status(200).json({
      success: true,
      data: {
        connectedCashiers: {
          count: connectedCashiers,
          label: 'Caissiers connectés aujourd\'hui'
        },
        dailyTickets: {
          count: ticketsCount,
          variation: ticketsVariation.toFixed(1),
          label: 'Tickets créés aujourd\'hui'
        },
        dailySales: {
          amount: todaySales.toFixed(2),
          variation: salesVariation.toFixed(1),
          completedOrders: completedOrders,
          label: 'Ventes du jour'
        },
        currency: 'HTG',
        storesCount: storeIds.length // ← NOUVEAU: nombre de magasins
      }
    });

  } catch (error) {
    console.error('Erreur getDailyStats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
};

/**
 * GET /api/owner/dashboard/sales-by-product
 * Retourne la répartition des ventes par produit pour TOUS les magasins
 */
exports.getSalesByProduct = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { period = 'today' } = req.query;

    // Récupérer tous les magasins de l'owner
    const stores = await Store.find({ ownerId: ownerId });
    const storeIds = stores.map(store => store._id);

    if (storeIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: { products: [], totalSales: '0.00', period: period, currency: 'HTG' }
      });
    }

    // Déterminer la plage de dates selon la période
    let startDate = new Date();
    const endDate = new Date();

    switch (period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      default:
        startDate.setHours(0, 0, 0, 0);
    }

    // Agrégation pour obtenir les ventes par produit (TOUS les magasins)
    const salesByProduct = await Order.aggregate([
      {
        $match: {
          storeId: { $in: storeIds }, // ← CHANGEMENT: tous les magasins
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $in: ['completed', 'validated'] }
        }
      },
      {
        $unwind: '$items'
      },
      {
        $group: {
          _id: '$items.product_id',
          productName: { $first: '$items.product_name' },
          totalQuantity: { $sum: '$items.quantity' },
          totalAmount: { $sum: '$items.subtotal' }
        }
      },
      {
        $sort: { totalAmount: -1 }
      },
      {
        $limit: 10 // Top 10 produits
      }
    ]);

    // Calculer le total général
    const totalSales = salesByProduct.reduce((sum, item) => sum + item.totalAmount, 0);

    // Formater les données pour le donut chart
    const chartData = salesByProduct.map(item => ({
      name: item.productName,
      value: item.totalAmount,
      quantity: item.totalQuantity,
      percentage: totalSales > 0 ? ((item.totalAmount / totalSales) * 100).toFixed(1) : '0'
    }));

    // Générer des couleurs pour chaque segment
    const colors = [
      '#FF6B6B', '#4ECDC4', '#FFD93D', '#6BCB77', '#4D96FF',
      '#FF8B94', '#FFA07A', '#9B59B6', '#E67E22', '#1ABC9C'
    ];

    const formattedData = chartData.map((item, index) => ({
      ...item,
      color: colors[index % colors.length]
    }));

    res.status(200).json({
      success: true,
      data: {
        products: formattedData,
        totalSales: totalSales.toFixed(2),
        period: period,
        currency: 'HTG',
        storesCount: storeIds.length
      }
    });

  } catch (error) {
    console.error('Erreur getSalesByProduct:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des ventes par produit',
      error: error.message
    });
  }
};

/**
 * GET /api/owner/dashboard/sales-by-month
 * Retourne les ventes mensuelles pour TOUS les magasins
 */
exports.getSalesByMonth = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { year = new Date().getFullYear() } = req.query;

    // Récupérer tous les magasins de l'owner
    const stores = await Store.find({ ownerId: ownerId });
    const storeIds = stores.map(store => store._id);

    if (storeIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          year: year,
          monthlyData: [],
          summary: { totalSales: '0.00', totalOrders: 0, averageMonthlySales: '0.00', yearOverYearGrowth: '0' },
          currency: 'HTG'
        }
      });
    }

    // Date de début de l'année
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);

    // Agrégation pour obtenir les ventes par mois (TOUS les magasins)
    const salesByMonth = await Order.aggregate([
      {
        $match: {
          storeId: { $in: storeIds }, // ← CHANGEMENT: tous les magasins
          createdAt: { $gte: startOfYear, $lte: endOfYear },
          status: { $in: ['completed', 'validated'] }
        }
      },
      {
        $group: {
          _id: { 
            month: { $month: '$createdAt' },
            year: { $year: '$createdAt' }
          },
          totalSales: { $sum: '$total_price' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.month': 1 }
      }
    ]);

    // Créer un tableau avec tous les mois (même ceux sans ventes)
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const monthlyData = months.map((monthName, index) => {
      const monthNumber = index + 1;
      const monthData = salesByMonth.find(item => item._id.month === monthNumber);

      return {
        month: monthName,
        monthNumber: monthNumber,
        sales: monthData ? monthData.totalSales : 0,
        orders: monthData ? monthData.orderCount : 0
      };
    });

    // Calculer les statistiques annuelles
    const totalYearSales = monthlyData.reduce((sum, month) => sum + month.sales, 0);
    const totalYearOrders = monthlyData.reduce((sum, month) => sum + month.orders, 0);
    const averageMonthlySales = totalYearSales / 12;

    // Calculer la croissance par rapport à l'année précédente
    const previousYear = parseInt(year) - 1;
    const previousYearStart = new Date(previousYear, 0, 1);
    const previousYearEnd = new Date(previousYear, 11, 31, 23, 59, 59);

    const previousYearSalesResult = await Order.aggregate([
      {
        $match: {
          storeId: { $in: storeIds }, // ← CHANGEMENT: tous les magasins
          createdAt: { $gte: previousYearStart, $lte: previousYearEnd },
          status: { $in: ['completed', 'validated'] }
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$total_price' }
        }
      }
    ]);

    const previousYearTotal = previousYearSalesResult.length > 0 
      ? previousYearSalesResult[0].totalSales 
      : 0;

    let yearOverYearGrowth = 0;
    if (previousYearTotal > 0) {
      yearOverYearGrowth = ((totalYearSales - previousYearTotal) / previousYearTotal) * 100;
    } else if (totalYearSales > 0) {
      yearOverYearGrowth = 100;
    }

    res.status(200).json({
      success: true,
      data: {
        year: year,
        monthlyData: monthlyData,
        summary: {
          totalSales: totalYearSales.toFixed(2),
          totalOrders: totalYearOrders,
          averageMonthlySales: averageMonthlySales.toFixed(2),
          yearOverYearGrowth: yearOverYearGrowth.toFixed(1)
        },
        currency: 'HTG',
        storesCount: storeIds.length
      }
    });

  } catch (error) {
    console.error('Erreur getSalesByMonth:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des ventes mensuelles',
      error: error.message
    });
  }
};

/**
 * GET /api/owner/dashboard/stats-by-store
 * NOUVEAU: Retourne les statistiques détaillées par magasin
 */
exports.getStatsByStore = async (req, res) => {
  try {
    const ownerId = req.user.id;

    // Récupérer tous les magasins de l'owner
    const stores = await Store.find({ ownerId: ownerId });

    // Date du début de la journée
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Statistiques par magasin
    const storeStats = await Promise.all(stores.map(async (store) => {
      // Caissiers connectés pour ce magasin
      const connectedCashiers = await User.countDocuments({
        role: 'caissier',
        storeId: store._id,
        lastLoginDate: { $gte: startOfDay, $lte: endOfDay },
        isActive: true
      });

      // Tickets créés pour ce magasin
      const ticketsCount = await Order.countDocuments({
        storeId: store._id,
        createdAt: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['pending', 'completed', 'validated'] }
      });

      // Ventes du jour pour ce magasin
      const salesResult = await Order.aggregate([
        {
          $match: {
            storeId: store._id,
            createdAt: { $gte: startOfDay, $lte: endOfDay },
            status: { $in: ['completed', 'validated'] }
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$total_price' },
            totalOrders: { $sum: 1 }
          }
        }
      ]);

      const todaySales = salesResult.length > 0 ? salesResult[0].totalAmount : 0;

      return {
        storeId: store._id,
        storeName: store.name,
        storeLocation: store.location || 'Non spécifié',
        connectedCashiers,
        ticketsCount,
        todaySales: todaySales.toFixed(2)
      };
    }));

    res.status(200).json({
      success: true,
      data: {
        stores: storeStats,
        totalStores: stores.length
      }
    });

  } catch (error) {
    console.error('Erreur getStatsByStore:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques par magasin',
      error: error.message
    });
  }
};

/**
 * GET /api/owner/dashboard/top-products
 * Retourne les produits les plus vendus (TOUS les magasins)
 */
exports.getTopProducts = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { limit = 5 } = req.query;

    // Récupérer tous les magasins de l'owner
    const stores = await Store.find({ ownerId: ownerId });
    const storeIds = stores.map(store => store._id);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const topProducts = await Order.aggregate([
      {
        $match: {
          storeId: { $in: storeIds }, // ← CHANGEMENT: tous les magasins
          createdAt: { $gte: startOfMonth },
          status: { $in: ['completed', 'validated'] }
        }
      },
      {
        $unwind: '$items'
      },
      {
        $group: {
          _id: '$items.product_id',
          productName: { $first: '$items.product_name' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.subtotal' }
        }
      },
      {
        $sort: { totalRevenue: -1 }
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        topProducts: topProducts,
        period: 'current_month',
        storesCount: storeIds.length
      }
    });

  } catch (error) {
    console.error('Erreur getTopProducts:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des top produits',
      error: error.message
    });
  }
};

/**
 * GET /api/owner/dashboard/sales-trends
 * Retourne les tendances de ventes (TOUS les magasins)
 */
exports.getSalesTrends = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { days = 30 } = req.query;

    // Récupérer tous les magasins de l'owner
    const stores = await Store.find({ ownerId: ownerId });
    const storeIds = stores.map(store => store._id);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);

    const dailySales = await Order.aggregate([
      {
        $match: {
          storeId: { $in: storeIds }, // ← CHANGEMENT: tous les magasins
          createdAt: { $gte: startDate },
          status: { $in: ['completed', 'validated'] }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          totalSales: { $sum: '$total_price' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        dailySales: dailySales,
        period: `${days} days`,
        currency: 'HTG',
        storesCount: storeIds.length
      }
    });

  } catch (error) {
    console.error('Erreur getSalesTrends:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des tendances',
      error: error.message
    });
  }
};

module.exports = exports;