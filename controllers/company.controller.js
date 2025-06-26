const companyModel = require('../models/company.models')
const {generateCompanyRef} = require('../utils/companyUtils');



module.exports = {
    createMyCompany: async (req, res) => {
        try {
            const { name, settings } = req.body;
            
            
            const ownerId = req.user._id; 

            const existingCompany = await companyModel.findOne({ owner_id: ownerId });
            if (existingCompany) {
                return res.status(400).json({ message: 'Vous possédez déjà une entreprise' });
            }

            const company = await companyModel.create({
                name,
                owner_id: ownerId,
                settings,
                ref_code: generateCompanyRef(name),
                created_by: ownerId 
            });

            res.status(201).json({
                success: true,
                data: {
                    id: company._id,
                    ref_code: company.ref_code
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: process.env.NODE_ENV === 'development'
                    ? error.message
                    : 'Erreur serveur'
            });
        }
    }
}


module.exports.updateCompany = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const currentUser = res.locals.user;

  try {
    const allowedUpdates = [
      'name',
      'ref_code',
      'settings.currency',
      'settings.tax_rate'
    ];

    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key) || key.startsWith('settings.')) {
        filteredUpdates[key] = updates[key];
      }
    });

    filteredUpdates.updatedBy = currentUser._id;

    const updatedCompany = await companyModel.findByIdAndUpdate(
      id,
      { $set: filteredUpdates },
      { 
        new: true,
        runValidators: true,
        select: '-__v -created_by' 
      }
    );

    if (!updatedCompany) {
      return res.status(404).json({ message: 'Entreprise non trouvée' });
    }

    res.status(200).json({
      success: true,
      data: {
        id: updatedCompany._id,
        name: updatedCompany.name,
        settings: updatedCompany.settings,
        updatedBy: updatedCompany.updatedBy
      }
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Erreur de mise à jour'
    });
  }
};


module.exports.listOwnerCompanies = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const { page = 1, limit = 10, status } = req.query;
    
    const query = { owner_id: ownerId };
    
    // Filtre par statut si fourni
    if (status) {
      query.is_active = status === 'active';
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      select: '-__v -created_by -updatedBy'
    };
    
    const companies = await companyModel.paginate(query, options);
    
    res.status(200).json({
      success: true,
      data: {
        companies: companies.docs,
        total: companies.totalDocs,
        pages: companies.totalPages,
        currentPage: companies.page
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development'
        ? error.message
        : 'Erreur serveur'
    });
  }
};