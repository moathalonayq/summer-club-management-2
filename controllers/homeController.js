/* =========================================================
   controllers/homeController.js
   منطق الصفحة الرئيسية: التعريف بالنادي + الإحصائيات + المتصدرون
   ========================================================= */

const statsModel = require("../models/statsModel");
const studentModel = require("../models/studentModel");

// السؤال اليومي لكل تاريخ جلسة (الأسبوع الثاني والثالث فقط حالياً)
const DAILY_QUESTIONS = {
  "2026-07-20": "من أول من يقرع باب الجنة؟",
  "2026-07-21": "ما هي أركان الإيمان؟",
  "2026-07-27": "ما هي الباقيات الصالحات؟",
  "2026-07-28": "مزرعة يوجد بها 8 دجاجات و6 أغنام، كم عدد الأرجل في المزرعة؟",
};

async function showHome(req, res, next) {
  try {
    const stats = await statsModel.getHomeStats();
    const settings = await statsModel.getSettings();
    const topByCategory = await studentModel.getTopStudentsByCategory(10);
    const clubDays = await statsModel.getClubDayNames();

    const today = new Date().toISOString().slice(0, 10);
    const dailyQuestion = DAILY_QUESTIONS[today] || null;

    res.render("home", {
      pageTitle: "الرئيسية",
      activeNav: "home",
      stats,
      settings,
      topByCategory,
      clubDays,
      dailyQuestion,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { showHome };
