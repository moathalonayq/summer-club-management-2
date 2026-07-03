/* =========================================================
   models/studentModel.js
   كل دوال الوصول لجدول الطلاب والجداول المرتبطة به
   (متطلبات معرفية، مبادرات، حضور) - نسخة MySQL
   ========================================================= */

const pool = require("../config/db");

/* -------- جلب كل الطلاب مع اسم مجموعتهم وإجمالي نقاطهم -------- */
async function getAllStudents() {
  const [rows] = await pool.query(`
    SELECT
      s.id, s.barcode, s.name, s.guardian_phone,
      s.knowledge_points, s.sports_points, s.cultural_points,
      g.id AS group_id, g.name AS group_name,
      COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0) AS initiatives_points,
      (s.knowledge_points + s.sports_points + s.cultural_points
        + COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0)
      ) AS total_points
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
      s.knowledge_points, s.sports_points, s.cultural_points,
      g.id AS group_id, g.name AS group_name
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
  student.initiatives = initiativesRows;
  student.attendance = attendanceRows;
  student.initiatives_points = initiativesRows.reduce((sum, i) => sum + i.points, 0);
  student.total_points = student.knowledge_points + student.sports_points
    + student.cultural_points + student.initiatives_points;

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

/* -------- البحث عن طلاب بالاسم (بحث جزئي) -------- */
async function searchStudentsByName(query) {
  const [rows] = await pool.query(`
    SELECT
      s.id, s.barcode, s.name,
      g.name AS group_name,
      (s.knowledge_points + s.sports_points + s.cultural_points
        + COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0)
      ) AS total_points
    FROM students s
    JOIN \`groups\` g ON g.id = s.group_id
    WHERE s.name LIKE ?
    ORDER BY s.name ASC
    LIMIT 30
  `, [`${query}%`]);
  return rows;
}

/* -------- أعلى 10 طلاب على مستوى النادي (للصفحة الرئيسية) -------- */
async function getTopStudents(limit = 10) {
  const [rows] = await pool.query(`
    SELECT
      s.id, s.name, g.name AS group_name,
      (s.knowledge_points + s.sports_points + s.cultural_points
        + COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0)
      ) AS total_points
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
      (s.knowledge_points + s.sports_points + s.cultural_points
        + COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = s.id), 0)
      ) AS total_points
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

/* -------- الترتيب العام للطالب بين جميع الطلاب -------- */
async function getStudentRankOverall(studentId) {
  const [rows] = await pool.query(`
    SELECT id,
      (knowledge_points + sports_points + cultural_points
        + COALESCE((SELECT SUM(i.points) FROM initiatives i WHERE i.student_id = students.id), 0)
      ) AS total_points
    FROM students
    ORDER BY total_points DESC
  `);
  const rank = rows.findIndex((s) => s.id === studentId) + 1;
  return { rank, total: rows.length };
}

/* -------- ترتيب طالب داخل مجموعته فقط (تُستخدم في بوابة ولي الأمر) -------- */
async function getStudentRankInGroup(studentId, groupId) {
  const [rows] = await pool.query(`
    SELECT id, name,
      (knowledge_points + sports_points + cultural_points
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

/* -------- تسجيل حضور لجلسة محددة (يدوي من المشرف أو تلقائي عبر الباركود) -------- */
async function markAttendance(studentId, status, sessionId) {
  await pool.query(
    `INSERT INTO attendance (student_id, session_id, status)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status)`,
    [studentId, sessionId, status]
  );

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
  getTopStudentsByCategory,
  getStudentRankOverall,
};
