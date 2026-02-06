/**
 * Script pour réinitialiser le mot de passe d'un cashier
 * Usage: node scripts/reset-cashier-password.js <phone> <nouveau_mot_de_passe>
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: './.env' });

// Modèle simplifié User
const userSchema = new mongoose.Schema({
  phone: String,
  password: String,
  role: String,
  first_name: String,
  last_name: String,
  is_active: Boolean
});

const User = mongoose.model('User', userSchema);

async function resetPassword(phone, newPassword) {
  try {
    console.log('🔐 [Reset Password] Connexion à MongoDB...');
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/miwiwi';
    console.log('📍 [Reset Password] URI MongoDB:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('✅ [Reset Password] Connecté à MongoDB');

    // Rechercher l'utilisateur
    console.log(`🔍 [Reset Password] Recherche du cashier avec phone: ${phone}`);
    const user = await User.findOne({ phone, role: 'cashier' });

    if (!user) {
      console.error('❌ [Reset Password] Aucun cashier trouvé avec ce numéro');
      process.exit(1);
    }

    console.log('✅ [Reset Password] Cashier trouvé:', {
      id: user._id,
      name: `${user.first_name} ${user.last_name}`,
      phone: user.phone,
      role: user.role,
      is_active: user.is_active
    });

    // Hasher le nouveau mot de passe
    console.log('🔑 [Reset Password] Hashage du nouveau mot de passe...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Mettre à jour le mot de passe
    console.log('💾 [Reset Password] Mise à jour du mot de passe...');
    user.password = hashedPassword;
    await user.save();

    console.log('✅ [Reset Password] Mot de passe mis à jour avec succès !');
    console.log(`✅ [Reset Password] Vous pouvez maintenant vous connecter avec:`);
    console.log(`   - Phone: ${phone}`);
    console.log(`   - Password: ${newPassword}`);

    // Vérifier que le nouveau mot de passe fonctionne
    console.log('\n🧪 [Reset Password] Test du nouveau mot de passe...');
    const isValid = await bcrypt.compare(newPassword, user.password);
    if (isValid) {
      console.log('✅ [Reset Password] Test réussi ! Le mot de passe fonctionne correctement.');
    } else {
      console.error('❌ [Reset Password] ERREUR : Le test du mot de passe a échoué !');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ [Reset Password] Erreur:', error);
    process.exit(1);
  }
}

// Récupérer les arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('❌ Usage: node scripts/reset-cashier-password.js <phone> <nouveau_mot_de_passe>');
  console.error('❌ Exemple: node scripts/reset-cashier-password.js 35864431 password');
  process.exit(1);
}

const [phone, newPassword] = args;
resetPassword(phone, newPassword);
