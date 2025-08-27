const mongoose = require('mongoose');

console.log("Tentative de connexion à MongoDB Replica Set...");

(async () => {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27018/Miwiwi?replicaSet=rs0", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connecté à MongoDB Replica Set !");
  } catch (error) {
    console.error("❌ Échec de la connexion MongoDB :", error.message);
  }
})();
