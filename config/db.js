const mongoose = require('mongoose');

console.log("Tentative de connexion à MongoDB..."); // <-- Ajoutez cette ligne

(async () => {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/Miwiwi", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connecté à MongoDB !"); // <-- Ce message devrait s'afficher
  } catch (error) {
    console.error("❌ Échec de la connexion MongoDB :", error.message); // <-- Capturez les erreurs
  }
})();