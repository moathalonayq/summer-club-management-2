/* =========================================================
   controllers/groupController.js
   منطق صفحة المجموعات الست وترتيبها وترتيب أعضائها
   ========================================================= */

const groupModel = require("../models/groupModel");

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

    res.render("groups", {
      pageTitle: "المجموعات",
      activeNav: "groups",
      minorGroups,
      majorGroups,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { showGroupsPage };
