/* =========================================================
   tests/fixtures/seedFixtures.js
   بيانات اختبار ثابتة ومحدّدة مسبقاً (وليست عشوائية كملف seed.js الأصلي)
   كل اختبار يحتاج بيانات يستدعي resetAndSeed() في beforeEach
   ليبدأ من حالة معروفة تماماً، وبذلك تبقى التوقعات (assertions) مستقرة

   ملاحظة مهمة: جدول sessions (الجلسات التسع الثابتة) يُملأ تلقائياً
   عبر schema.sql عند كل globalSetup، ولا نحذفه/نعيد إنشاءه هنا — فقط
   نعيد استخدام نفس الجلسات التسع (IDs من 1 إلى 9 بالترتيب الزمني)
   ========================================================= */

const pool = require("../../config/db");

/* -------- ترتيب الحذف يحترم القيود (FK) من الأبناء إلى الآباء -------- */
/* ملاحظة: sessions غير مدرجة هنا عمداً، فهي بيانات ثابتة للموسم
   (9 جلسات فقط) لا تُحذف بين الاختبارات، فقط attendance المرتبطة بها */
const TABLES_IN_DELETE_ORDER = [
  "attendance",
  "initiatives",
  "knowledge_tasks",
  "activity_log",
  "students",
  "`groups`",
];

async function clearAllData() {
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of TABLES_IN_DELETE_ORDER) {
    await pool.query(`DELETE FROM ${table}`);
  }
  // نعيد عدّاد AUTO_INCREMENT للصفر حتى تكون أرقام id متوقعة بين الاختبارات
  await pool.query("ALTER TABLE `groups` AUTO_INCREMENT = 1");
  await pool.query("ALTER TABLE students AUTO_INCREMENT = 1");
  await pool.query("ALTER TABLE knowledge_tasks AUTO_INCREMENT = 1");
  await pool.query("ALTER TABLE initiatives AUTO_INCREMENT = 1");
  await pool.query("ALTER TABLE attendance AUTO_INCREMENT = 1");
  await pool.query("ALTER TABLE activity_log AUTO_INCREMENT = 1");
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
}

/* -------- جلب معرّفات الجلسات التسع الثابتة بترتيبها الزمني -------- */
async function getSessionIds() {
  const [rows] = await pool.query(
    "SELECT id, session_date, day_name, week_number FROM sessions ORDER BY session_date ASC"
  );
  return rows;
}

/**
 * يبني مجموعة بيانات معروفة:
 * - مجموعتان: "مجموعة أ" (الفئة الصغرى) و "مجموعة ب" (الفئة العليا)
 * - 3 طلاب في "مجموعة أ" بنقاط مختلفة (لاختبار الترتيب بسهولة)
 * - طالب واحد في "مجموعة ب" (لاختبار مجموعة بعضو واحد فقط)
 * - متطلبات معرفية ومبادرات وحضور (مرتبط بجلسات حقيقية) لطالب واحد محدد
 *
 * النقاط مصمَّمة عمداً لتكون فريدة وغير متداخلة لتسهيل اختبار الترتيب:
 *   الطالب A1: knowledge=50, sports=30, cultural=20 -> 100 (+ مبادرة 10 = 110) أعلى نقاط بمجموعة أ
 *   الطالب A2: knowledge=20, sports=20, cultural=20 -> 60
 *   الطالب A3: knowledge=5,  sports=5,  cultural=5  -> 15  أدنى نقاط بمجموعة أ
 *   الطالب B1: knowledge=40, sports=40, cultural=40 -> 120 أعلى نقاط على مستوى النادي كله
 */
async function resetAndSeed() {
  await clearAllData();

  const [groupAResult] = await pool.query(
    "INSERT INTO `groups` (name, category) VALUES (?, ?)",
    ["مجموعة أ", "الفئة الصغرى"]
  );
  const groupAId = groupAResult.insertId;

  const [groupBResult] = await pool.query(
    "INSERT INTO `groups` (name, category) VALUES (?, ?)",
    ["مجموعة ب", "الفئة العليا"]
  );
  const groupBId = groupBResult.insertId;

  const [studentA1] = await pool.query(
    `INSERT INTO students (barcode, name, group_id, knowledge_points, sports_points, cultural_points, guardian_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["TEST0001", "الطالب الأول", groupAId, 50, 30, 20, "0500000001"]
  );
  const studentA1Id = studentA1.insertId;

  const [studentA2] = await pool.query(
    `INSERT INTO students (barcode, name, group_id, knowledge_points, sports_points, cultural_points, guardian_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["TEST0002", "الطالب الثاني", groupAId, 20, 20, 20, "0500000002"]
  );
  const studentA2Id = studentA2.insertId;

  const [studentA3] = await pool.query(
    `INSERT INTO students (barcode, name, group_id, knowledge_points, sports_points, cultural_points, guardian_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["TEST0003", "الطالب الثالث", groupAId, 5, 5, 5, "0500000003"]
  );
  const studentA3Id = studentA3.insertId;

  const [studentB1] = await pool.query(
    `INSERT INTO students (barcode, name, group_id, knowledge_points, sports_points, cultural_points, guardian_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["TEST0004", "طالب المجموعة الثانية", groupBId, 40, 40, 40, "0500000004"]
  );
  const studentB1Id = studentB1.insertId;

  // مبادرة لطالب A1 فقط (تضيف 10 نقاط -> إجمالي 110)
  await pool.query(
    "INSERT INTO initiatives (student_id, title, points) VALUES (?, ?, ?)",
    [studentA1Id, "مبادرة تجريبية", 10]
  );

  // متطلبات معرفية لطالب A1: 2 مكتملة و1 غير مكتملة
  await pool.query(
    "INSERT INTO knowledge_tasks (student_id, title, done) VALUES (?, ?, ?)",
    [studentA1Id, "مهمة مكتملة 1", true]
  );
  await pool.query(
    "INSERT INTO knowledge_tasks (student_id, title, done) VALUES (?, ?, ?)",
    [studentA1Id, "مهمة مكتملة 2", true]
  );
  await pool.query(
    "INSERT INTO knowledge_tasks (student_id, title, done) VALUES (?, ?, ?)",
    [studentA1Id, "مهمة غير مكتملة", false]
  );

  // سجل حضور لطالب A1 مرتبط بجلستين حقيقيتين من الجلسات التسع الثابتة: حاضر + متأخر
  const sessions = await getSessionIds();
  const firstSessionId = sessions[0].id; // الأسبوع 1 - الاثنين
  const secondSessionId = sessions[1].id; // الأسبوع 1 - الثلاثاء

  await pool.query(
    "INSERT INTO attendance (student_id, session_id, status) VALUES (?, ?, ?)",
    [studentA1Id, firstSessionId, "حاضر"]
  );
  await pool.query(
    "INSERT INTO attendance (student_id, session_id, status) VALUES (?, ?, ?)",
    [studentA1Id, secondSessionId, "متأخر"]
  );

  // نعيد المعرّفات والقيم المعروفة لاستخدامها مباشرة داخل الاختبارات
  return {
    groupAId,
    groupBId,
    studentA1Id,
    studentA2Id,
    studentA3Id,
    studentB1Id,
    sessions, // كل الجلسات التسع بترتيبها (sessions[0] = أول جلسة، ...، sessions[8] = آخر جلسة)
    firstSessionId,
    secondSessionId,
    totals: {
      studentA1: 110, // 50+30+20+10
      studentA2: 60,  // 20+20+20
      studentA3: 15,  // 5+5+5
      studentB1: 120, // 40+40+40
    },
  };
}

module.exports = { resetAndSeed, clearAllData, getSessionIds };
