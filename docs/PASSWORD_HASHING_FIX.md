# 🔐 Correction du Double Hashage des Mots de Passe

## ❌ Le Problème

Les mots de passe des employés étaient **hashés deux fois**, ce qui les rendait invalides lors du login.

### Explication Technique

Le système avait **deux points de hashage** :

1. **Dans les controllers** (`employee.controller.js` et `admin.controller.js`) :
   ```javascript
   const salt = await bcrypt.genSalt();
   const hashedPassword = await bcrypt.hash(password, salt);
   // ...
   password: hashedPassword  // Hash #1
   ```

2. **Dans le modèle User** via le hook `pre('save')` :
   ```javascript
   userSchema.pre("save", async function (next) {
     if (!this.isModified('password')) return next();
     const salt = await bcrypt.genSalt(10);
     this.password = await bcrypt.hash(this.password, salt); // Hash #2
     next();
   });
   ```

### Conséquence

```
Mot de passe original: "password"
   ↓
Hash #1 (controller): "$2b$10$XYZ..."
   ↓
Hash #2 (hook pre-save): "$2b$10$ABC..." (hash d'un hash ❌)
   ↓
Stocké en base: Hash invalide
   ↓
Login échoue: bcrypt.compare("password", "$2b$10$ABC...") = FALSE ❌
```

## ✅ La Solution

**Supprimer le hashage manuel dans les controllers** et laisser le hook `pre('save')` gérer tout automatiquement.

### Fichiers Modifiés

1. **`controllers/employee.controller.js`**
   - Fonction `createEmployeeForStore()` : ligne ~73-81
   - Fonction `updateEmployee()` : ligne ~236-239

2. **`controllers/admin.controller.js`**
   - Fonction `createEmployeeForStore()` : ligne ~1022-1030

### Code Avant (❌ Incorrect)

```javascript
// ❌ AVANT : Double hashage
const salt = await bcrypt.genSalt();
const hashedPassword = await bcrypt.hash(password, salt);

const newEmployee = await User.create([{
  phone,
  first_name,
  last_name,
  password: hashedPassword, // ❌ Déjà hashé + sera hashé encore par le hook
  role,
  // ...
}], { session });
```

### Code Après (✅ Correct)

```javascript
// ✅ APRÈS : Hash unique via le hook pre('save')
const newEmployee = await User.create([{
  phone,
  first_name,
  last_name,
  password, // ✅ Mot de passe en clair, sera hashé UNE FOIS par le hook
  role,
  // ...
}], { session });
```

## 🔄 Migration des Données

Les employés créés **avant cette correction** ont des mots de passe invalides en base.

### Script de Réinitialisation

Utilisez le script `scripts/reset-cashier-password.js` pour réinitialiser les mots de passe :

```bash
node scripts/reset-cashier-password.js <phone> <nouveau_mot_de_passe>
```

**Exemple :**
```bash
node scripts/reset-cashier-password.js 35864431 password
```

## ✅ Vérification

Après la correction, tous les **nouveaux employés créés** auront des mots de passe correctement hashés (une seule fois).

### Test

1. Créer un nouvel employé avec mot de passe "test123"
2. Vérifier en base que le password commence par `$2b$10$` (format bcrypt)
3. Tester le login avec phone + "test123"
4. ✅ Le login doit fonctionner

## 📝 Règle à Retenir

**🚨 IMPORTANT** : Avec le hook `pre('save')` activé dans le modèle :

- ✅ **NE JAMAIS** hasher manuellement avant `User.create()` ou `User.save()`
- ✅ **TOUJOURS** passer le mot de passe en clair
- ✅ Le hook s'occupe du hashage automatiquement

### Alternative (si on voulait l'inverse)

Si on voulait hasher manuellement dans les controllers :
1. **Supprimer** le hook `pre('save')` du modèle User
2. **Garder** le hashage manuel dans tous les controllers

Mais ce n'est **PAS recommandé** car :
- Plus de code dupliqué
- Risque d'oublier le hashage quelque part
- Moins maintenable

## 🎯 Conclusion

La méthode recommandée est d'utiliser le **hook `pre('save')`** car :
- ✅ Centralisé (un seul endroit)
- ✅ Automatique (impossible d'oublier)
- ✅ Maintenable (modification en un seul lieu)

---

**Date de correction** : 6 février 2026
**Auteur** : Claude Code AI Assistant
