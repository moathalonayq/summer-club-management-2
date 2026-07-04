/* =========================================================
   controllers/guardianController.js
   منطق بوابة ولي الأمر: بحث باسم الطالب + عرض تفاصيله
   + ترتيبه داخل مجموعته (التعديل المطلوب)
   ========================================================= */

const studentModel = require("../models/studentModel");
const sessionModel = require("../models/sessionModel");
const pool = require("../config/db");

async function showGuardianPage(req, res, next) {
  try {
    res.render("guardian", {
      pageTitle: "بوابة ولي الأمر",
      activeNav: "guardian",
    });
  } catch (err) {
    next(err);
  }
}

/* API: البحث عن طلاب بالاسم (تُستخدم بـ fetch من الواجهة) */
async function searchStudents(req, res, next) {
  try {
    const query = (req.query.q || "").trim();
    if (!query) return res.json({ success: true, results: [] });

    const results = await studentModel.searchStudentsByName(query);
    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
}

/* API: جلب تفاصيل طالب + ترتيبه داخل مجموعته */
async function getStudentDetails(req, res, next) {
  try {
    const studentId = Number(req.params.id);

    // معرّف غير رقمي (مثل /api/students/abc) يُعامَل كطالب غير موجود (404)
    // بدل تمريره لقاعدة البيانات حيث يفشل NaN بخطأ خادم غير واضح (500)
    if (!Number.isInteger(studentId)) {
      return res.status(404).json({ success: false, message: "الطالب غير موجود" });
    }

    await sessionModel.autoMarkAbsentForPastSessions();

    const student = await studentModel.getStudentById(studentId);

    if (!student) {
      return res.status(404).json({ success: false, message: "الطالب غير موجود" });
    }

    const { rank, groupSize } = await studentModel.getStudentRankInGroup(
      student.id,
      student.group_id
    );

    const { rank: overallRank, total: totalStudents } = await studentModel.getStudentRankOverall(student.id);

    const [svRows] = await pool.query("SELECT value FROM settings WHERE `key` = 'scores_visible'");
    const scoresVisible = !svRows.length || svRows[0].value === 'true';

    res.json({
      success: true,
      student,
      groupRank: rank,
      groupSize,
      overallRank,
      totalStudents,
      scoresVisible,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { showGuardianPage, searchStudents, getStudentDetails };
