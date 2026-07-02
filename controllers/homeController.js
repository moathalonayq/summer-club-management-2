/* =========================================================
   controllers/homeController.js
   منطق الصفحة الرئيسية: التعريف بالنادي + الإحصائيات + المتصدرون
   ========================================================= */

const statsModel = require("../models/statsModel");
const studentModel = require("../models/studentModel");

async function showHome(req, res, next) {
  try {
    const stats = await statsModel.getHomeStats();
    const settings = await statsModel.getSettings();
    const topByCategory = await studentModel.getTopStudentsByCategory(5);
    const clubDays = await statsModel.getClubDayNames();

    res.render("home", {
      pageTitle: "الرئيسية",
      activeNav: "home",
      stats,
      settings,
      topByCategory,
      clubDays,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { showHome };
