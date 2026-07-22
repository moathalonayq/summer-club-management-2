/* =========================================================
   models/groupModel.js
   دوال الوصول لجدول المجموعات وإحصائياتها - نسخة MySQL
   ========================================================= */

const pool = require("../config/db");

/* -------- كل المجموعات مع إحصائياتها مرتبة حسب متوسط نقاط الطالب --------
   "إجمالي المجموعة" هنا هو متوسط نقاط أعضائها (إجمالي نقاط المجموعة ÷ عدد
   طلابها) وليس مجموع النقاط الخام، حتى لا تتأثر المجموعات الأقل عدداً
   بالمقارنة مع المجموعات الأكبر */
async function getRankedGroups() {
  const [rows] = await pool.query(`
    SELECT
      g.id, g.name, g.category,
      COUNT(s.id) AS member_count,
      COALESCE(SUM(s.knowledge_points + s.sports_points + s.cultural_points + s.attendance_points + s.home_tasks_points), 0) AS raw_total_points
    FROM \`groups\` g
    LEFT JOIN students s ON s.group_id = g.id
    GROUP BY g.id, g.name, g.category
  `);

  return rows
    .map((g) => {
      const memberCount = Number(g.member_count);
      const rawTotal = Number(g.raw_total_points);
      const avgPoints = memberCount > 0 ? Math.round(rawTotal / memberCount) : 0;
      return {
        id: g.id,
        name: g.name,
        category: g.category,
        member_count: memberCount,
        total_points: avgPoints,
        avg_points: avgPoints,
      };
    })
    .sort((a, b) => b.total_points - a.total_points);
}

/* -------- نفس getRankedGroups لكن مجمَّعة حسب الفئة (الصغرى/العليا) لعرضها بقسمين -------- */
async function getRankedGroupsByCategory() {
  const allGroups = await getRankedGroups();
  const categories = {};

  allGroups.forEach((group) => {
    if (!categories[group.category]) categories[group.category] = [];
    categories[group.category].push(group);
  });

  return categories;
}

/* -------- أعضاء مجموعة معينة مرتبين حسب نقاطهم --------
   ملاحظة: الترتيب (ORDER BY) يحتسب نقاط المبادرة أيضاً كي يتطابق
   مع ترتيب الطالب الظاهر في ملفه الشخصي، لكن عمود "الإجمالي"
   المعروض هنا يبقى بدون المبادرة (معرفي+رياضي+ترفيهي فقط) */
async function getGroupMembers(groupId) {
  const [rows] = await pool.query(`
    SELECT
      s.id, s.name,
      s.knowledge_points, s.sports_points, s.cultural_points, s.attendance_points, s.home_tasks_points,
      COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0) AS initiatives_points,
      (s.knowledge_points + s.sports_points + s.cultural_points + s.attendance_points + s.home_tasks_points) AS total_points
    FROM students s
    WHERE s.group_id = ?
    ORDER BY (s.knowledge_points + s.sports_points + s.cultural_points + s.attendance_points + s.home_tasks_points
      + COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0)
    ) DESC
  `, [groupId]);
  return rows;
}

/* -------- كل المجموعات (بدون إحصائيات) لاستخدامها في القوائم المنسدلة -------- */
async function getAllGroupsSimple() {
  const [rows] = await pool.query("SELECT id, name FROM `groups` ORDER BY name ASC");
  return rows;
}

module.exports = {
  getRankedGroups,
  getRankedGroupsByCategory,
  getGroupMembers,
  getAllGroupsSimple,
};
