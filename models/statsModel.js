/* =========================================================
   models/statsModel.js
   إحصائيات الصفحة الرئيسية وإعدادات النادي العامة - نسخة MySQL
   ========================================================= */

const pool = require("../config/db");

/* -------- إحصائيات شاملة للصفحة الرئيسية -------- */
async function getHomeStats() {
  const [totalsRows] = await pool.query(`
    SELECT
      COALESCE(SUM(s.knowledge_points), 0) AS total_knowledge,
      COALESCE(SUM(s.sports_points), 0) AS total_sports,
      COALESCE(SUM(s.cultural_points), 0) AS total_cultural
    FROM students s
  `);

  const [initiativesRows] = await pool.query(
    "SELECT COALESCE(SUM(points), 0) AS total_initiatives FROM initiatives"
  );

  const [groupCountRows] = await pool.query("SELECT COUNT(*) AS c FROM `groups`");
  const [studentCountRows] = await pool.query("SELECT COUNT(*) AS c FROM students");

  // نسبة الحضور العامة لكل السجلات
  // MySQL لا يدعم FILTER (WHERE ...) كما في PostgreSQL، نستخدم SUM(CASE WHEN ...) بدلاً منها
  const [attendanceRows] = await pool.query(`
    SELECT
      SUM(CASE WHEN status = 'حاضر' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN status = 'متأخر' THEN 1 ELSE 0 END) AS late,
      SUM(CASE WHEN status = 'غايب' THEN 1 ELSE 0 END) AS absent,
      COUNT(*) AS total
    FROM attendance
  `);

  const att = attendanceRows[0];
  const attendanceRate = Number(att.present || 0) + Number(att.late || 0);

  const totals = totalsRows[0];

  return {
    totalStudents: Number(studentCountRows[0].c),
    totalGroups: Number(groupCountRows[0].c),
    attendanceRate,
    totalKnowledge: Number(totals.total_knowledge),
    totalSports: Number(totals.total_sports),
    totalCultural: Number(totals.total_cultural),
    totalInitiatives: Number(initiativesRows[0].total_initiatives),
  };
}

/* -------- إعدادات النادي العامة (عدد الأسابيع، أيام الأسبوع، اسم الموسم) -------- */
async function getSettings() {
  const [rows] = await pool.query("SELECT `key`, value FROM settings");
  const settings = {};
  rows.forEach((r) => { settings[r.key] = r.value; });
  return settings;
}

/* -------- أسماء أيام النادي الثابتة الثلاثة (الاثنين/الثلاثاء/الأربعاء) بدون تكرار -------- */
async function getClubDayNames() {
  const [rows] = await pool.query(
    "SELECT day_name, MIN(session_date) AS first_date FROM sessions GROUP BY day_name ORDER BY first_date ASC"
  );
  return rows.map((r) => r.day_name);
}

module.exports = {
  getHomeStats,
  getSettings,
  getClubDayNames,
};
