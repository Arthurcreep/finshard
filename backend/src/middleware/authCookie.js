// backend/src/middlewares/authCookie.js
module.exports = (req, _res, next) => {
    const uid = req.cookies?.uid
    if (!uid) return next({ status: 401, message: 'unauthorized' })
    req.uid = uid
    req.role = req.cookies?.role || 'user'
    next()
}
