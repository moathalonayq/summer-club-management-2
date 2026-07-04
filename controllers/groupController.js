/* =========================================================
   controllers/groupController.js
   منطق صفحة المجموعات الست وترتيبها وترتيب أعضائها
   ========================================================= */

const groupModel = require("../models/groupModel");
const pool = require("../config/db");

async function showGroupsPage(req, res, next) {
  try {
    const rankedGroups = await groupModel.getRankedGroups();

    // جلب أعضاء كل مجموعة بالتوازي
    const groupsWithMembers = await Promise.all(
      rankedGroups.map(async (group) => {
        const members = await groupModel.getGroupMembers(group.id);
        return { ...group, members };
      })
    );

    // نقسّم المجموعات الست لقسمين حسب category: الفئة الصغرى والفئة العليا
    const minorGroups = groupsWithMembers.filter((g) => g.category === "الأولوية");
    const majorGroups = groupsWithMembers.filter((g) => g.category === "الفئة العليا");

    const [svRows] = await pool.query("SELECT value FROM settings WHERE `key` = 'scores_visible'");
    const scoresVisible = !svRows.length || svRows[0].value === 'true';

    res.render("groups", {
      pageTitle: "المجموعات",
      activeNav: "groups",
      minorGroups,
      majorGroups,
      scoresVisible,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { showGroupsPage };
