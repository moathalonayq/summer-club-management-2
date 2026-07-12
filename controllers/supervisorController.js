/* =========================================================
   controllers/supervisorController.js
   منطق لوحة المشرفين:
   - تسجيل الدخول برمز 991
   - إضافة/خصم نقاط لأي طالب
   - عرض كل الطلاب مع باركود كل واحد
   - تسجيل حضور تلقائي عند مسح باركود الطالب بالكاميرا
   ========================================================= */

const pool = require("../config/db");
const studentModel = require("../models/studentModel");
const groupModel = require("../models/groupModel");
const sessionModel = require("../models/sessionModel");

// الإدارة: تحكم كامل (كل ما كان متاحاً سابقاً بدون أي تعديل)
// المشرفون: تحضير (باركود + يدوي) + إضافة نقاط مبادرة فقط مع سبب إلزامي
// الرمزان يُضبَطان فقط عبر متغيرات البيئة (.env محلياً / متغيرات Railway في الإنتاج)
// ولا يوجد لهما أي قيمة افتراضية مكتوبة في الكود لتجنّب نشرها في المستودع العام
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";
const SUPERVISOR_ACCESS_CODE = process.env.SUPERVISOR_ACCESS_CODE || "";

/* -------- صفحة تسجيل الدخول -------- */
function showLoginPage(req, res) {
  if (req.session && req.session.isSupervisor) {
    return res.redirect("/supervisor/panel");
  }
  res.render("supervisor-login", {
    pageTitle: "دخول المشرفين",
    activeNav: "supervisor",
    error: null,
  });
}

/* -------- معالجة تسجيل الدخول (يحدَّد الدور من الرمز نفسه) -------- */
function handleLogin(req, res) {
  const { accessCode } = req.body;

  let role = null;
  if (accessCode && ADMIN_ACCESS_CODE && accessCode === ADMIN_ACCESS_CODE) role = "admin";
  else if (accessCode && SUPERVISOR_ACCESS_CODE && accessCode === SUPERVISOR_ACCESS_CODE) role = "supervisor";

  if (role) {
    req.session.isSupervisor = true;
    req.session.role = role;
    return res.redirect("/supervisor/panel");
  }

  res.render("supervisor-login", {
    pageTitle: "دخول المشرفين",
    activeNav: "supervisor",
    error: "رمز الدخول غير صحيح",
  });
}

/* -------- تسجيل الخروج -------- */
function handleLogout(req, res) {
  req.session.destroy(() => {
    res.redirect("/supervisor/login");
  });
}

/* -------- مساعد: قراءة إعداد scores_visible -------- */
async function getScoresVisible() {
  const [rows] = await pool.query("SELECT value FROM settings WHERE `key` = 'scores_visible'");
  return !rows.length || rows[0].value === 'true';
}

/* -------- لوحة التحكم الرئيسية للمشرف -------- */
async function showPanel(req, res, next) {
  try {
    await sessionModel.autoMarkAbsentForPastSessions();

    const students = await studentModel.getAllStudents();
    const groups = await groupModel.getAllGroupsSimple();
    const sessions = await sessionModel.getAllSessions();
    const scoresVisible = await getScoresVisible();

    // جلب جميع سجلات الحضور ثم بناء map: { studentId: { sessionId: status } }
    const [attRows] = await pool.query("SELECT student_id, session_id, status FROM attendance");
    const attendanceMap = {};
    attRows.forEach(r => {
      if (!attendanceMap[r.student_id]) attendanceMap[r.student_id] = {};
      attendanceMap[r.student_id][r.session_id] = r.status;
    });

    res.render("supervisor-panel", {
      pageTitle: "لوحة المشرفين",
      activeNav: "supervisor",
      role: req.session.role || "admin",
      students,
      groups,
      sessions,
      attendanceMap,
      scoresVisible,
    });
  } catch (err) {
    next(err);
  }
}

/* -------- API: إضافة أو خصم نقاط لطالب -------- */
async function addPoints(req, res, next) {
  try {
    const { studentId, program, amount, reason, mode } = req.body;

    const studentIdNum = Number(studentId);
    let amountNum = Number(amount);

    if (!studentIdNum || !amountNum || amountNum <= 0) {
      return res.status(400).json({ success: false, message: "أدخل بيانات صحيحة" });
    }

    // دور "المشرفين" المحدود: مبادرة فقط، وبسبب إلزامي (يمنع التلاعب من العميل)
    if (req.session.role !== "admin") {
      if (program !== "initiative") {
        return res.status(403).json({ success: false, message: "يمكنك فقط إضافة نقاط مبادرة / إنجاز مميز" });
      }
      if (!reason || !reason.trim()) {
        return res.status(400).json({ success: false, message: "سبب المبادرة إلزامي" });
      }
    }

    // mode: "add" إضافة أو "subtract" خصم
    if (mode === "subtract") amountNum = -amountNum;

    await studentModel.addPointsToStudent(studentIdNum, program, amountNum, reason);

    const actionLabel = mode === "subtract" ? "خصم" : "إضافة";
    const programLabel = {
      knowledge: "البرنامج المعرفي",
      sports: "البرنامج الرياضي",
      cultural: "البرنامج الثقافي",
      initiative: "المبادرات",
    }[program] || program;

    await pool.query(
      "INSERT INTO activity_log (action) VALUES (?)",
      [`${actionLabel} ${Math.abs(amountNum)} نقطة (${programLabel})${reason ? " — " + reason : ""}`]
    );

    const updatedStudent = await studentModel.getStudentById(studentIdNum);
    res.json({ success: true, student: updatedStudent });
  } catch (err) {
    next(err);
  }
}

/* -------- API: تسجيل حضور يدوي لجلسة محددة -------- */
async function markAttendanceManual(req, res, next) {
  try {
    const { studentId, status, sessionId } = req.body;
    const studentIdNum = Number(studentId);
    const sessionIdNum = Number(sessionId);

    if (!studentIdNum || !status || !sessionIdNum) {
      return res.status(400).json({ success: false, message: "أدخل بيانات صحيحة" });
    }

    const record = await studentModel.markAttendance(studentIdNum, status, sessionIdNum);
    const student = await studentModel.getStudentById(studentIdNum);

    res.json({ success: true, record, student });
  } catch (err) {
    next(err);
  }
}

/* -------- API: تسجيل حضور تلقائي عبر مسح الباركود (كاميرا المشرف) -------- */
async function scanBarcodeAttendance(req, res, next) {
  try {
    const { barcode } = req.body;
    if (!barcode) {
      return res.status(400).json({ success: false, message: "لم يتم استلام رمز الباركود" });
    }

    const student = await studentModel.getStudentByBarcode(barcode.trim());
    if (!student) {
      return res.status(404).json({ success: false, message: "لا يوجد طالب بهذا الباركود" });
    }

    // نحدد جلسة اليوم تلقائياً، أو أقرب جلسة قادمة إن لم يكن اليوم يوم نادي
    const session = await sessionModel.getCurrentOrNextSession();
    if (!session) {
      return res.status(400).json({ success: false, message: "لا توجد جلسات معرَّفة لهذا الموسم" });
    }

    // هل كان مسجلاً "حاضر" بالفعل لهذه الجلسة مسبقاً؟ (وليس أي حالة أخرى كـ"غايب")
    const previous = await studentModel.getAttendanceForSession(student.id, session.id);
    const alreadyPresent = previous?.status === "حاضر";

    // يسجَّل "حاضر" تلقائياً عند المسح، ويُحدِّث أي حالة سابقة (مثل "غايب") إلى "حاضر"
    const record = await studentModel.markAttendance(student.id, "حاضر", session.id);

    await pool.query(
      "INSERT INTO activity_log (action) VALUES (?)",
      [`تسجيل حضور تلقائي عبر الباركود لـ ${student.name} (${session.day_name} - الأسبوع ${session.week_number})`]
    );

    res.json({
      success: true,
      alreadyMarked: alreadyPresent,
      session,
      student: {
        id: student.id,
        name: student.name,
        group_name: student.group_name,
        barcode: student.barcode,
      },
      record,
    });
  } catch (err) {
    next(err);
  }
}

/* -------- API: تحديد متطلب من متطلبات البرنامج المعرفي كمُنجز أو لا (تقييم المشرف) -------- */
/* -------- API: جلب إعدادات نقاط المتطلبات (قيمة واحدة لكل عنوان) -------- */
async function getTaskConfig(req, res, next) {
  try {
    const [rows] = await pool.query(
      "SELECT title, MAX(points) AS points FROM knowledge_tasks GROUP BY title ORDER BY MIN(id)"
    );
    res.json({ success: true, config: rows });
  } catch (err) { next(err); }
}

/* -------- API: حفظ نقاط المتطلبات عالمياً (لكل طالب لم يُنجز بعد) -------- */
async function saveTaskConfig(req, res, next) {
  try {
    const { configs } = req.body; // [{title, points}, ...]
    if (!Array.isArray(configs)) return res.status(400).json({ success: false });

    for (const { title, points } of configs) {
      const pts = Math.max(0, Number(points) || 0);
      // نحدّث فقط المتطلبات غير المُنجزة حتى لا نمس النقاط المحسوبة مسبقاً
      await pool.query(
        "UPDATE knowledge_tasks SET points = ? WHERE title = ? AND done = FALSE",
        [pts, title]
      );
    }
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function setKnowledgeTaskStatus(req, res, next) {
  try {
    const { taskId, done } = req.body;
    const taskIdNum = Number(taskId);

    if (!taskIdNum || typeof done !== "boolean") {
      return res.status(400).json({ success: false, message: "أدخل بيانات صحيحة" });
    }

    const task = await studentModel.setKnowledgeTaskDone(taskIdNum, done);
    if (!task) {
      return res.status(404).json({ success: false, message: "المتطلب غير موجود" });
    }
    if (task.error) {
      return res.status(400).json({ success: false, message: task.error });
    }

    await pool.query(
      "INSERT INTO activity_log (action) VALUES (?)",
      [`تحديث متطلب "${task.title}" إلى ${done ? "مُنجز" : "غير مُنجز"}`]
    );

    res.json({ success: true, task });
  } catch (err) {
    next(err);
  }
}

/* -------- API: تبديل ظهور النقاط لعامة الزوار -------- */
async function toggleScoresVisible(req, res, next) {
  try {
    const current = await getScoresVisible();
    const next_val = current ? 'false' : 'true';
    await pool.query(
      "INSERT INTO settings (`key`, value) VALUES ('scores_visible', ?) ON DUPLICATE KEY UPDATE value = ?",
      [next_val, next_val]
    );
    res.json({ success: true, scoresVisible: next_val === 'true' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  showLoginPage,
  handleLogin,
  handleLogout,
  showPanel,
  addPoints,
  markAttendanceManual,
  scanBarcodeAttendance,
  setKnowledgeTaskStatus,
  getTaskConfig,
  saveTaskConfig,
  toggleScoresVisible,
};
