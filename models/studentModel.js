/* =========================================================
   models/studentModel.js
   كل دوال الوصول لجدول الطلاب والجداول المرتبطة به
   (متطلبات معرفية، مبادرات، حضور) - نسخة MySQL
   ========================================================= */

const pool = require("../config/db");
const { normalizeArabic } = require("../utils/arabicNormalize");

/* -------- جلب كل الطلاب مع اسم مجموعتهم وإجمالي نقاطهم -------- */
async function getAllStudents() {
  const [rows] = await pool.query(`
    SELECT
      s.id, s.barcode, s.name, s.guardian_phone,
      s.knowledge_points, s.sports_points, s.cultural_points, s.attendance_points, s.home_tasks_points,
      g.id AS group_id, g.name AS group_name, g.category AS group_category,
      COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0) AS initiatives_points,
      (s.knowledge_points + s.sports_points + s.cultural_points + s.attendance_points + s.home_tasks_points) AS total_points,
      COALESCE((SELECT COUNT(*) FROM attendance a WHERE a.student_id = s.id AND a.status IN ('حاضر','متأخر')), 0) AS attendance_count
    FROM students s
    JOIN \`groups\` g ON g.id = s.group_id
    ORDER BY total_points DESC
  `);
  return rows;
}

/* -------- جلب طالب واحد مع كل تفاصيله الكاملة -------- */
async function getStudentById(id) {
  const [studentRows] = await pool.query(`
    SELECT
      s.id, s.barcode, s.name, s.guardian_phone,
      s.knowledge_points, s.sports_points, s.cultural_points, s.attendance_points, s.home_tasks_points,
      g.id AS group_id, g.name AS group_name, g.category AS group_category
    FROM students s
    JOIN \`groups\` g ON g.id = s.group_id
    WHERE s.id = ?
  `, [id]);

  if (!studentRows.length) return null;
  const student = studentRows[0];

  const [tasksRows] = await pool.query(
    "SELECT id, title, done FROM knowledge_tasks WHERE student_id = ? ORDER BY id",
    [id]
  );
  const [homeTasksRows] = await pool.query(
    "SELECT id, title, description, done FROM home_tasks WHERE student_id = ? ORDER BY id",
    [id]
  );
  const [initiativesRows] = await pool.query(
    "SELECT id, title, points, created_at FROM initiatives WHERE student_id = ? ORDER BY created_at DESC",
    [id]
  );
  // الحضور الآن مرتبط بجلسات محددة (9 جلسات ثابتة)، نجلب تفاصيل الجلسة مع كل سجل
  // ونستخدم LEFT JOIN من sessions بدل INNER JOIN من attendance حتى تظهر
  // كل الجلسات التسع للطالب، حتى التي لم تُسجَّل بعد (status تكون null)
  const [attendanceRows] = await pool.query(
    `SELECT
       sess.id AS session_id, sess.session_date, sess.day_name, sess.week_number,
       att.id AS attendance_id, att.status
     FROM sessions sess
     LEFT JOIN attendance att ON att.session_id = sess.id AND att.student_id = ?
     ORDER BY sess.session_date ASC`,
    [id]
  );

  // MySQL يرجع done كـ 0/1 (TINYINT)، نحوّلها لـ boolean صريح
  student.knowledge_tasks = tasksRows.map((t) => ({ ...t, done: !!t.done }));
  student.home_tasks = homeTasksRows.map((t) => ({ ...t, done: !!t.done }));
  student.initiatives = initiativesRows;
  student.attendance = attendanceRows;
  student.initiatives_points = initiativesRows.reduce((sum, i) => sum + i.points, 0);
  // إجمالي الملف الشخصي فقط يضم نقاط المبادرات (بخلاف إجمالي جدول المجموعة الذي يستثنيها)
  student.total_points = student.knowledge_points + student.sports_points
    + student.cultural_points + student.attendance_points + student.home_tasks_points
    + student.initiatives_points;

  return student;
}

/* -------- جلب طالب عبر الباركود (يستخدمها نظام مسح الباركود) -------- */
async function getStudentByBarcode(barcode) {
  const [rows] = await pool.query(
    "SELECT id FROM students WHERE barcode = ?",
    [barcode.trim()]
  );
  if (!rows.length) return null;
  return getStudentById(rows[0].id);
}

/* -------- البحث عن طلاب بالاسم --------
   يطابق أي كلمة من كلمات الاسم (الاسم الأول/الأب/العائلة...) تبدأ بنص البحث،
   وليس فقط بداية الاسم الكامل. النتائج تُرتَّب بحيث يُقدَّم تطابق الاسم الأول
   على تطابق اسم الأب ثم العائلة (حسب موضع الكلمة المطابقة داخل الاسم) */
async function searchStudentsByName(query) {
  const normalized = normalizeArabic(query);
  if (!normalized) return [];

  const [rows] = await pool.query(`
    SELECT
      s.id, s.barcode, s.name, s.name_normalized,
      g.name AS group_name,
      (s.knowledge_points + s.sports_points + s.cultural_points + s.attendance_points + s.home_tasks_points) AS total_points
    FROM students s
    JOIN \`groups\` g ON g.id = s.group_id
    WHERE s.name_normalized LIKE ?
  `, [`%${normalized}%`]);

  const matched = rows
    .map((s) => {
      const words = s.name_normalized.split(/\s+/);
      const wordIndex = words.findIndex((w) => w.startsWith(normalized));
      return { ...s, wordIndex };
    })
    .filter((s) => s.wordIndex !== -1)
    .sort((a, b) => a.wordIndex - b.wordIndex || a.name.localeCompare(b.name, "ar"))
    .slice(0, 30)
    .map(({ name_normalized, wordIndex, ...rest }) => rest);

  return matched;
}

/* -------- أعلى 10 طلاب على مستوى النادي (للصفحة الرئيسية) -------- */
async function getTopStudents(limit = 10) {
  const [rows] = await pool.query(`
    SELECT
      s.id, s.name, g.name AS group_name,
      (s.knowledge_points + s.sports_points + s.cultural_points + s.attendance_points + s.home_tasks_points) AS total_points
    FROM students s
    JOIN \`groups\` g ON g.id = s.group_id
    ORDER BY total_points DESC
    LIMIT ?
  `, [limit]);
  return rows;
}

/* -------- أفضل 5 من كل فئة (الأولوية / العليا) للصفحة الرئيسية -------- */
async function getTopStudentsByCategory(limit = 5) {
  const [rows] = await pool.query(`
    SELECT
      s.id, s.name, g.name AS group_name, g.category,
      (s.knowledge_points + s.sports_points + s.cultural_points + s.attendance_points + s.home_tasks_points) AS total_points
    FROM students s
    JOIN \`groups\` g ON g.id = s.group_id
    ORDER BY g.category ASC, total_points DESC
  `);

  const byCategory = {};
  rows.forEach((s) => {
    if (!byCategory[s.category]) byCategory[s.category] = [];
    if (byCategory[s.category].length < limit) byCategory[s.category].push(s);
  });
  return byCategory;
}

/* -------- الترتيب العام للطالب بين طلاب فئته فقط (الأولوية أو الفئة العليا) -------- */
async function getStudentRankOverall(studentId, category) {
  // الترتيب (بخلاف الإجمالي المعروض) يحتسب نقاط المبادرات أيضاً
  const [rows] = await pool.query(`
    SELECT s.id,
      (s.knowledge_points + s.sports_points + s.cultural_points + s.attendance_points + s.home_tasks_points
        + COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0)
      ) AS total_points
    FROM students s
    JOIN \`groups\` g ON g.id = s.group_id
    WHERE g.category = ?
    ORDER BY total_points DESC
  `, [category]);
  const rank = rows.findIndex((s) => s.id === studentId) + 1;
  return { rank, total: rows.length };
}

/* -------- ترتيب طالب داخل مجموعته فقط (تُستخدم في بوابة ولي الأمر) -------- */
async function getStudentRankInGroup(studentId, groupId) {
  // الترتيب (بخلاف الإجمالي المعروض) يحتسب نقاط المبادرات أيضاً
  const [rows] = await pool.query(`
    SELECT id, name,
      (knowledge_points + sports_points + cultural_points + attendance_points + home_tasks_points
        + COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = students.id), 0)
      ) AS total_points
    FROM students
    WHERE group_id = ?
    ORDER BY total_points DESC
  `, [groupId]);

  const rank = rows.findIndex((s) => s.id === studentId) + 1;
  return { rank, groupSize: rows.length };
}

/* -------- إضافة (أو خصم) نقاط لطالب في برنامج معين -------- */
async function addPointsToStudent(studentId, program, amount, reason) {
  const column = {
    knowledge: "knowledge_points",
    sports: "sports_points",
    cultural: "cultural_points",
  }[program];

  if (program === "initiative") {
    // المبادرات تُسجَّل كسطر منفصل وتقبل قيمة سالبة (خصم) أيضاً
    await pool.query(
      "INSERT INTO initiatives (student_id, title, points) VALUES (?, ?, ?)",
      [studentId, reason || "مبادرة / تعديل نقاط", amount]
    );
    return;
  }

  if (!column) throw new Error("برنامج غير معروف");

  // نمنع وصول النقاط لأقل من صفر عند الخصم
  // GREATEST() متوفرة بنفس الاسم في MySQL أيضاً
  await pool.query(
    `UPDATE students SET ${column} = GREATEST(${column} + ?, 0) WHERE id = ?`,
    [amount, studentId]
  );
}

/* -------- تسجيل حضور لجلسة محددة (يدوي من المشرف أو تلقائي عبر الباركود) --------
   اعتباراً من الأسبوع الثاني: كل حضور "حاضر" أو "متأخر" يمنح 15 نقطة حضور
   (الأسبوع الأول مستثنى لأنه مؤرشَف ومصفَّر بالفعل). المنطق هنا يقارن
   الحالة السابقة بالجديدة حتى لا تُضاف/تُخصم النقاط أكثر من مرة عند
   إعادة تسجيل نفس الحالة أو التبديل بين "حاضر" و"متأخر". */
async function markAttendance(studentId, status, sessionId) {
  const ATTENDANCE_POINTS = 15;
  const PRESENT_STATUSES = ["حاضر", "متأخر"];

  const [sessRows] = await pool.query("SELECT week_number FROM sessions WHERE id = ?", [sessionId]);
  const weekNumber = sessRows[0] ? sessRows[0].week_number : null;
  const eligibleWeek = weekNumber === 2 || weekNumber === 3;

  const [prevRows] = await pool.query(
    "SELECT status FROM attendance WHERE student_id = ? AND session_id = ?",
    [studentId, sessionId]
  );
  const prevStatus = prevRows[0] ? prevRows[0].status : null;

  await pool.query(
    `INSERT INTO attendance (student_id, session_id, status)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status)`,
    [studentId, sessionId, status]
  );

  if (eligibleWeek) {
    const wasPresent = PRESENT_STATUSES.includes(prevStatus);
    const isPresent = PRESENT_STATUSES.includes(status);
    if (wasPresent !== isPresent) {
      const delta = isPresent ? ATTENDANCE_POINTS : -ATTENDANCE_POINTS;
      await pool.query(
        "UPDATE students SET attendance_points = GREATEST(attendance_points + ?, 0) WHERE id = ?",
        [delta, studentId]
      );
    }
  }

  const [rows] = await pool.query(
    `SELECT att.id, att.status, sess.id AS session_id, sess.session_date, sess.day_name, sess.week_number
     FROM attendance att
     JOIN sessions sess ON sess.id = att.session_id
     WHERE att.student_id = ? AND att.session_id = ?`,
    [studentId, sessionId]
  );
  return rows[0];
}

/* -------- هل تم تسجيل حضور الطالب لجلسة معينة بالفعل؟ -------- */
async function getAttendanceForSession(studentId, sessionId) {
  const [rows] = await pool.query(
    "SELECT status FROM attendance WHERE student_id = ? AND session_id = ?",
    [studentId, sessionId]
  );
  return rows[0] || null;
}

/* -------- تحديث حالة إنجاز متطلب — النقاط تُقرأ من القيمة المضبوطة مسبقاً عالمياً -------- */
async function setKnowledgeTaskDone(taskId, done) {
  // نجلب الحالة الحالية لنعرف كم نقطة كانت مُسجَّلة سابقاً
  const [existing] = await pool.query(
    "SELECT id, student_id, done, points FROM knowledge_tasks WHERE id = ?",
    [taskId]
  );
  if (!existing.length) return null;

  const task = existing[0];
  const wasDone = !!task.done;
  const prevPoints = Number(task.points) || 0;

  if (done && !wasDone) {
    // إنجاز جديد: نقرأ النقاط المضبوطة مسبقاً ونضيفها للطالب
    if (prevPoints <= 0) return { error: "لم يتم ضبط نقاط هذا المتطلب بعد، اضبطها أولاً من إعدادات النقاط" };
    await pool.query("UPDATE knowledge_tasks SET done = TRUE WHERE id = ?", [taskId]);
    await pool.query(
      "UPDATE students SET knowledge_points = GREATEST(knowledge_points + ?, 0) WHERE id = ?",
      [prevPoints, task.student_id]
    );
  } else if (!done && wasDone) {
    // إلغاء الإنجاز: نخصم النقاط المحفوظة مسبقاً ونصفّر نقاط المتطلب
    await pool.query("UPDATE knowledge_tasks SET done = FALSE, points = 0 WHERE id = ?", [taskId]);
    await pool.query(
      "UPDATE students SET knowledge_points = GREATEST(knowledge_points - ?, 0) WHERE id = ?",
      [prevPoints, task.student_id]
    );
  }

  const [rows] = await pool.query(
    "SELECT id, student_id, title, done, points FROM knowledge_tasks WHERE id = ?",
    [taskId]
  );
  return { ...rows[0], done: !!rows[0].done };
}

/* -------- تحديث حالة إنجاز تكليف منزلي — نفس منطق setKnowledgeTaskDone لكن على home_tasks -------- */
async function setHomeTaskDone(taskId, done) {
  const [existing] = await pool.query(
    "SELECT id, student_id, done, points FROM home_tasks WHERE id = ?",
    [taskId]
  );
  if (!existing.length) return null;

  const task = existing[0];
  const wasDone = !!task.done;
  const prevPoints = Number(task.points) || 0;

  if (done && !wasDone) {
    if (prevPoints <= 0) return { error: "لم يتم ضبط نقاط هذا التكليف بعد، اضبطها أولاً من إعدادات النقاط" };
    await pool.query("UPDATE home_tasks SET done = TRUE WHERE id = ?", [taskId]);
    await pool.query(
      "UPDATE students SET home_tasks_points = GREATEST(home_tasks_points + ?, 0) WHERE id = ?",
      [prevPoints, task.student_id]
    );
  } else if (!done && wasDone) {
    await pool.query("UPDATE home_tasks SET done = FALSE, points = 0 WHERE id = ?", [taskId]);
    await pool.query(
      "UPDATE students SET home_tasks_points = GREATEST(home_tasks_points - ?, 0) WHERE id = ?",
      [prevPoints, task.student_id]
    );
  }

  const [rows] = await pool.query(
    "SELECT id, student_id, title, done, points FROM home_tasks WHERE id = ?",
    [taskId]
  );
  return { ...rows[0], done: !!rows[0].done };
}

const KNOWLEDGE_TASKS_BY_CATEGORY = {
  "الأولوية": [
    "قول كلمة طيبة بالمنزل",
    "تسميع سورة الفاتحة غيباً",
    "القيام بعمل تعاوني بالمنزل",
  ],
  "الفئة العليا": [
    "ما هو الذكاء الاصطناعي",
    "نجرب الأدوات",
    "ابدع وفكر بنقد",
    "مشروع ومهاراتي",
  ],
};
const HOME_TASKS_TEMPLATE = [
  { title: "اذكار الصباح", description: "الأسبوع الثاني" },
  { title: "اذكار المساء", description: "الأسبوع الثالث" },
];
const HOME_TASK_POINTS = 25;

/* -------- إنشاء طالب جديد (من لوحة الإدارة) مع باركود فريد ومتطلباته/تكاليفه الأولية -------- */
async function createStudent(name, groupId) {
  const [groupRows] = await pool.query("SELECT id, category FROM `groups` WHERE id = ?", [groupId]);
  if (!groupRows.length) return { error: "المجموعة غير موجودة" };
  const category = groupRows[0].category;

  const [maxRows] = await pool.query(
    "SELECT MAX(CAST(SUBSTRING(barcode, 7) AS UNSIGNED)) AS maxIdx FROM students WHERE barcode LIKE 'QC%'"
  );
  const year = new Date().getFullYear();
  const nextIndex = (maxRows[0].maxIdx || 0) + 1;
  const barcode = `QC${year}${String(nextIndex).padStart(4, "0")}`;

  const [result] = await pool.query(
    `INSERT INTO students (barcode, name, name_normalized, group_id, knowledge_points, sports_points, cultural_points, attendance_points, home_tasks_points)
     VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0)`,
    [barcode, name, normalizeArabic(name), groupId]
  );
  const studentId = result.insertId;

  for (const taskTitle of KNOWLEDGE_TASKS_BY_CATEGORY[category]) {
    await pool.query(
      "INSERT INTO knowledge_tasks (student_id, title, done) VALUES (?, ?, FALSE)",
      [studentId, taskTitle]
    );
  }
  for (const { title, description } of HOME_TASKS_TEMPLATE) {
    await pool.query(
      "INSERT INTO home_tasks (student_id, title, description, done, points) VALUES (?, ?, ?, FALSE, ?)",
      [studentId, title, description, HOME_TASK_POINTS]
    );
  }

  return getStudentById(studentId);
}

/* -------- نقل طالب موجود إلى أسرة أخرى (تصحيح توزيع) -------- */
async function moveStudentGroup(studentId, groupId) {
  const [groupRows] = await pool.query("SELECT id, category FROM `groups` WHERE id = ?", [groupId]);
  if (!groupRows.length) return { error: "المجموعة غير موجودة" };

  const [studentRows] = await pool.query("SELECT id FROM students WHERE id = ?", [studentId]);
  if (!studentRows.length) return { error: "الطالب غير موجود" };

  await pool.query("UPDATE students SET group_id = ? WHERE id = ?", [groupId, studentId]);

  return getStudentById(studentId);
}

module.exports = {
  getAllStudents,
  getStudentById,
  getStudentByBarcode,
  searchStudentsByName,
  getTopStudents,
  getStudentRankInGroup,
  addPointsToStudent,
  markAttendance,
  getAttendanceForSession,
  setKnowledgeTaskDone,
  setHomeTaskDone,
  createStudent,
  moveStudentGroup,
  getTopStudentsByCategory,
  getStudentRankOverall,
};
