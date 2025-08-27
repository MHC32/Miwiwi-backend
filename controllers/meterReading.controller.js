// controllers/meterReading.controller.js
const MeterReading = require('../models/meterReading.models');
const { formatImageUrl } = require('../utils/fileUtils');

module.exports.getStoreReadings = async (req, res) => {
    try {
      const { storeId } = req.params;
      const { date, type, status } = req.query;
      const user = res.locals.user;

      // Vérifier les permissions
      if (user.role === 'cashier' && !user.stores.includes(storeId)) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce magasin'
        });
      }

      const query = { store: storeId };

      // Filtres optionnels
      if (date) {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
        
        query.createdAt = { $gte: startDate, $lte: endDate };
      }

      if (type) query.reading_type = type;
      if (status) query.status = status;

      const readings = await MeterReading.find(query)
        .populate('cashier', 'first_name last_name')
        .populate('verified_by', 'first_name last_name')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        data: readings.map(reading => ({
          id: reading._id,
          reading_value: reading.reading_value,
          reading_type: reading.reading_type,
          photo: formatImageUrl(reading.photo),
          status: reading.status,
          cashier: reading.cashier,
          verified_by: reading.verified_by,
          created_at: reading.createdAt,
          notes: reading.notes
        }))
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' 
          ? error.message 
          : 'Erreur lors de la récupération des relevés'
      });
    }
  },

  

// Valider un relevé (pour superviseurs/owners)  
module.exports.verifyReading = async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      const verifier = res.locals.user;

      // Seuls les superviseurs et owners peuvent valider
      if (!['supervisor', 'owner', 'admin'].includes(verifier.role)) {
        return res.status(403).json({
          success: false,
          message: 'Action réservée aux superviseurs et propriétaires'
        });
      }

      const reading = await MeterReading.findById(id)
        .populate('store');

      if (!reading) {
        return res.status(404).json({
          success: false,
          message: 'Relevé non trouvé'
        });
      }

      // Vérifier que le validateur a accès à ce magasin
      if (verifier.role === 'supervisor' && 
          reading.store.supervisor_id.toString() !== verifier._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce magasin'
        });
      }

      reading.status = status;
      reading.verified_by = verifier._id;
      reading.verified_at = new Date();
      if (notes) reading.notes = notes;

      await reading.save();

      res.status(200).json({
        success: true,
        data: {
          id: reading._id,
          status: reading.status,
          verified_by: {
            id: verifier._id,
            name: `${verifier.first_name} ${verifier.last_name}`
          },
          verified_at: reading.verified_at
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' 
          ? error.message 
          : 'Erreur lors de la validation du relevé'
      });
    }
  }