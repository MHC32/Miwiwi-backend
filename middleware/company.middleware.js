const {validateOwner} = require('../utils/companyUtils')
const companyModel = require('../models/company.models')

module.exports.validateAdminCompanyCreation = async (req, res, next) => {
  try {
    const { owner_id } = req.body;

    if (!owner_id) {
      return res.status(400).json({ 
        message: 'Le champ owner_id est requis' 
      });
    }

    const isOwner = await validateOwner(owner_id);
    if (!isOwner) {
      return res.status(400).json({ 
        message: 'L\'utilisateur cible doit être un owner' 
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      message: 'Erreur de validation',
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : undefined
    });
  }
};


module.exports.companyExists = async (req, res, next) => {
  const company = await companyModel.findById(req.params.id);
  if (!company) return res.status(404).json({ message: 'Company non trouvée' });
  req.company = company;
  next();
};