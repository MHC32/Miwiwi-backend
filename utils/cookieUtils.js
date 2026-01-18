/**
 * Utilitaire pour gérer les cookies d'authentification de manière cohérente
 */

const getCookieOptions = (maxAge = null) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Détection du localhost
  const isLocalhost = 
    process.env.CLIENT_URL?.includes('localhost') ||
    process.env.CLIENT_URL?.includes('127.0.0.1') ||
    process.env.NODE_ENV === 'development';

  const options = {
    httpOnly: true,
    secure: isProduction && !isLocalhost, // En local, secure=false
    sameSite: 'lax', // 'lax' pour compatibilité mobile (Safari iOS problématique avec 'strict')
    path: '/', // Toujours définir le path
  };

  if (maxAge !== null && maxAge !== undefined) {
    options.maxAge = maxAge;
  }

  return options;
};

/**
 * Définit le cookie d'authentification
 * @param {Response} res - Objet réponse Express
 * @param {string} token - Token JWT
 * @param {number} maxAge - Durée en millisecondes
 */
const setAuthCookie = (res, token, maxAge = null) => {
  const options = getCookieOptions(maxAge);
  res.cookie('jwt', token, options);
  
  // Log pour debug (à désactiver en production)
  if (process.env.NODE_ENV === 'development') {
    console.log('🍪 Cookie défini avec options:', {
      httpOnly: options.httpOnly,
      secure: options.secure,
      sameSite: options.sameSite,
      maxAge: options.maxAge ? `${options.maxAge / 1000 / 60} minutes` : 'session',
      path: options.path
    });
  }
};

/**
 * Efface le cookie d'authentification
 * @param {Response} res - Objet réponse Express
 */
const clearAuthCookie = (res) => {
  const options = getCookieOptions();
  // Pour effacer, on met maxAge à 0
  res.clearCookie('jwt', { ...options, maxAge: 0 });
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🗑️ Cookie effacé');
  }
};

module.exports = {
  getCookieOptions,
  setAuthCookie,
  clearAuthCookie
};