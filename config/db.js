const mongoose = require('mongoose');

console.log("Tentative de connexion à MongoDB Replica Set...");

(async () => {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27018/Miwiwi?replicaSet=rs0",);    
    console.log("✅ Connecté à MongoDB Replica Set !");
  } catch (error) {
    console.error("❌ Échec de la connexion MongoDB :", error.message);
  }
})();


//mongodb://127.0.0.1:27018,127.0.0.1:27019,127.0.0.1:27020/Miwiwi?replicaSet=rs0
//("mongodb://127.0.0.1:27018/Miwiwi?replicaSet=rs0")