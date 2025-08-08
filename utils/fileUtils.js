module.exports.formatImageUrl = (path) => {
  if (!path) return null;
  
  // 1. Nettoyer le chemin
  const cleanPath = path
    .replace(/^[\\/]?public[\\/]/, '')  
    .replace(/^[\\/]/, '');  

  // 2. Nettoyer l'URL de base
  const baseUrl = process.env.BASE_URL
    ? process.env.BASE_URL.replace(/\/+$/, '') 
    : 'http://localhost:5000';

  // 3. Construction de l'URL finale
  return cleanPath ? `${baseUrl}/${cleanPath}` : baseUrl;
};