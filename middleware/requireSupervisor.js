/* =========================================================
   middleware/requireSupervisor.js
   يتحقق أن المشرف سجّل دخول قبل الوصول لأي صفحة/API خاصة بالمشرفين
   ========================================================= */

// لاستخدامه في الصفحات (يعيد توجيه لو لم يسجّل الدخول)
function requireSupervisorPage(req, res, next) {
  if (req.session && req.session.isSupervisor) {
    return next();
  }
  return res.redirect("/supervisor/login");
}

// لاستخدامه في مسارات API (يرجع خطأ JSON بدلاً من إعادة توجيه)
function requireSupervisorApi(req, res, next) {
  if (req.session && req.session.isSupervisor) {
    return next();
  }
  return res.status(401).json({ success: false, message: "يجب تسجيل الدخول كمشرف أولاً" });
}

// مسارات خاصة بالإدارة فقط (رمز 13578) — يمنع دور "المشرفين" المحدود
function requireAdminApi(req, res, next) {
  if (req.session && req.session.isSupervisor && req.session.role === "admin") {
    return next();
  }
  return res.status(403).json({ success: false, message: "هذا الإجراء متاح للإدارة فقط" });
}

module.exports = { requireSupervisorPage, requireSupervisorApi, requireAdminApi };
