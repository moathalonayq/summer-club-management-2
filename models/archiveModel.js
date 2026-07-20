/* =========================================================
   models/archiveModel.js
   أرشفة نقاط الطلاب أسبوعياً (لقطة قبل التصفير) + جلبها لاحقاً
   ملاحظة: المبادرات لا تُصفَّر ولا تُؤرشف هنا، تبقى كما هي دائماً
   ========================================================= */

const pool = require("../config/db");

/* -------- أرشفة النقاط الحالية لكل الطلاب تحت رقم أسبوع معين، ثم تصفير knowledge/sports/cultural -------- */
async function archiveAndResetPoints(weekNumber) {
  const [students] = await pool.query(
    "SELECT id, knowledge_points, sports_points, cultural_points FROM students"
  );

  for (const s of students) {
    const total = s.knowledge_points + s.sports_points + s.cultural_points;
    await pool.query(
      `INSERT INTO weekly_points_archive
         (student_id, week_number, knowledge_points, sports_points, cultural_points, total_points)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         knowledge_points = VALUES(knowledge_points),
         sports_points = VALUES(sports_points),
         cultural_points = VALUES(cultural_points),
         total_points = VALUES(total_points),
         archived_at = CURRENT_TIMESTAMP`,
      [s.id, weekNumber, s.knowledge_points, s.sports_points, s.cultural_points, total]
    );
  }

  await pool.query("UPDATE students SET knowledge_points = 0, sports_points = 0, cultural_points = 0");

  return students.length;
}

/* -------- جلب أرقام الأسابيع المؤرشَفة (للعرض في قائمة اختيار) -------- */
async function getArchivedWeekNumbers() {
  const [rows] = await pool.query(
    "SELECT DISTINCT week_number FROM weekly_points_archive ORDER BY week_number ASC"
  );
  return rows.map((r) => r.week_number);
}

/* -------- جلب أرشيف أسبوع معين مع اسم كل طالب ومجموعته -------- */
async function getArchiveByWeek(weekNumber) {
  const [rows] = await pool.query(
    `SELECT wpa.student_id, s.name, g.name AS group_name,
       wpa.knowledge_points, wpa.sports_points, wpa.cultural_points, wpa.total_points, wpa.archived_at
     FROM weekly_points_archive wpa
     JOIN students s ON s.id = wpa.student_id
     JOIN \`groups\` g ON g.id = s.group_id
     WHERE wpa.week_number = ?
     ORDER BY wpa.total_points DESC`,
    [weekNumber]
  );
  return rows;
}

module.exports = { archiveAndResetPoints, getArchivedWeekNumbers, getArchiveByWeek };
