/* =========================================================
   models/sessionModel.js
   إدارة جلسات النادي الثابتة (9 جلسات: 3 أسابيع × 3 أيام)
   يُستخدم في تسجيل الحضور اليدوي وعبر مسح الباركود، وفي بوابة
   ولي الأمر لعرض جدول حضور الطالب بالأيام الثابتة بدل تواريخ حرة
   ========================================================= */

const pool = require("../config/db");

/* -------- كل الجلسات التسع مرتبة زمنياً -------- */
async function getAllSessions() {
  const [rows] = await pool.query(
    "SELECT id, session_date, day_name, week_number FROM sessions ORDER BY session_date ASC"
  );
  return rows;
}

/* -------- جلسة واحدة بمعرّفها -------- */
async function getSessionById(sessionId) {
  const [rows] = await pool.query(
    "SELECT id, session_date, day_name, week_number FROM sessions WHERE id = ?",
    [sessionId]
  );
  return rows[0] || null;
}

/**
 * يحدّد "جلسة اليوم" المناسبة لتسجيل الحضور التلقائي عبر الباركود:
 * 1) إن كان تاريخ اليوم نفسه يطابق إحدى الجلسات التسع بالضبط -> نرجعها
 * 2) إن لم يطابق (مثلاً المشرف يمسح يوم خميس) -> نرجع أقرب جلسة قادمة لم تُعقد بعد
 * 3) إن انتهت كل الجلسات (بعد آخر جلسة) -> نرجع آخر جلسة في الموسم
 * هذا يضمن أن المسح بالكاميرا يسجّل دائماً لجلسة منطقية حتى خارج أيام النادي تماماً
 */
async function getCurrentOrNextSession() {
  const today = new Date().toISOString().slice(0, 10);

  const [exact] = await pool.query(
    "SELECT id, session_date, day_name, week_number FROM sessions WHERE session_date = ?",
    [today]
  );
  if (exact.length) return exact[0];

  const [upcoming] = await pool.query(
    `SELECT id, session_date, day_name, week_number FROM sessions
     WHERE session_date > ? ORDER BY session_date ASC LIMIT 1`,
    [today]
  );
  if (upcoming.length) return upcoming[0];

  const [last] = await pool.query(
    "SELECT id, session_date, day_name, week_number FROM sessions ORDER BY session_date DESC LIMIT 1"
  );
  return last[0] || null;
}

/**
 * أي جلسة انتهى يومها (تاريخها قبل اليوم) ولم يُسجَّل فيها حضور الطالب
 * بأي طريقة (يدوياً أو بالباركود) تُعتبر تلقائياً "غايب".
 * تُستدعى عند عرض صفحات الحضور حتى يبقى السجل محدَّثاً دون الحاجة لمهمة مجدولة (cron).
 */
async function autoMarkAbsentForPastSessions() {
  await pool.query(`
    INSERT INTO attendance (student_id, session_id, status)
    SELECT s.id, sess.id, 'غايب'
    FROM students s
    CROSS JOIN sessions sess
    WHERE sess.session_date < CURDATE()
      AND NOT EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.student_id = s.id AND a.session_id = sess.id
      )
  `);
}

module.exports = {
  getAllSessions,
  getSessionById,
  getCurrentOrNextSession,
  autoMarkAbsentForPastSessions,
};
