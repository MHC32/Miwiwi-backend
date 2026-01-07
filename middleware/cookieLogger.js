/**
 * Middleware pour loguer les cookies (développement seulement)
 */
module.exports = (req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('🍪 Cookies reçus:', {
      hasJwt: !!req.cookies.jwt,
      jwtLength: req.cookies.jwt ? req.cookies.jwt.length : 0,
      allCookies: Object.keys(req.cookies)
    });
  }
  next();
};