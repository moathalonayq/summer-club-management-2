/* =========================================================
   models/groupModel.js
   دوال الوصول لجدول المجموعات وإحصائياتها - نسخة MySQL
   ========================================================= */

const pool = require("../config/db");

/* -------- كل المجموعات مع إحصائياتها مرتبة حسب الإجمالي -------- */
async function getRankedGroups() {
  const [rows] = await pool.query(`
    SELECT
      g.id, g.name, g.category,
      COUNT(s.id) AS member_count,
      COALESCE(SUM(s.knowledge_points + s.sports_points + s.cultural_points), 0) AS total_points
    FROM \`groups\` g
    LEFT JOIN students s ON s.group_id = g.id
    GROUP BY g.id, g.name, g.category
    ORDER BY total_points DESC
  `);

  return rows.map((g) => ({
    ...g,
    member_count: Number(g.member_count),
    total_points: Number(g.total_points),
    avg_points: g.member_count > 0 ? Math.round(Number(g.total_points) / Number(g.member_count)) : 0,
  }));
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

/* -------- أعضاء مجموعة معينة مرتبين حسب نقاطهم -------- */
async function getGroupMembers(groupId) {
  const [rows] = await pool.query(`
    SELECT
      s.id, s.name,
      s.knowledge_points, s.sports_points, s.cultural_points,
      COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0) AS initiatives_points,
      (s.knowledge_points + s.sports_points + s.cultural_points) AS total_points
    FROM students s
    WHERE s.group_id = ?
    ORDER BY total_points DESC
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
