/* =========================================================
   config/seed.js
   سكربت تهيئة قاعدة البيانات:
   1) ينشئ الجداول من schema.sql
   2) يعبّيها ببيانات تجريبية (مجموعات + طلاب + حضور + نقاط)

   التشغيل:  node config/seed.js
   ========================================================= */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { normalizeArabic } = require("../utils/arabicNormalize");

// الفئة الصغرى: 3 مجموعات | الفئة العليا: 3 مجموعات (نفس الأسماء الحالية، فقط مقسَّمة)
const GROUPS_WITH_CATEGORY = [
  { name: "مجموعة الفرسان", category: "الأولوية" },
  { name: "مجموعة النجباء", category: "الأولوية" },
  { name: "مجموعة الصقور", category: "الأولوية" },
  { name: "مجموعة الرواد", category: "الفئة العليا" },
  { name: "مجموعة الأبطال", category: "الفئة العليا" },
  { name: "مجموعة النخبة", category: "الفئة العليا" },
];
const GROUP_NAMES = GROUPS_WITH_CATEGORY.map((g) => g.name);

const SAMPLE_NAMES = [
  "عبدالله محمد العتيبي", "سلطان فهد القحطاني", "ناصر سعد الدوسري",
  "خالد عبدالعزيز الشهري", "فيصل ماجد الحربي", "تركي بندر العنزي",
  "محمد علي الزهراني", "عمر يوسف المالكي", "بدر سامي السبيعي",
  "راكان حمد الغامدي", "زياد طلال العمري", "يزيد ناصر البقمي",
  "سعود فايز الرشيدي", "حمد سعيد الجهني", "ماجد ابراهيم العسيري",
  "فهد عبدالرحمن الشمري", "نواف خالد التميمي", "عبدالعزيز سامي اليامي",
  "سامي محمد الفيفي", "عبدالمجيد وليد الحازمي", "أحمد سلمان الخالدي",
  "إبراهيم عادل المطيري", "جابر فواز الحارثي", "وليد رائد البلوي",
  "صالح عماد الجبري", "مشعل فيصل الزهراني", "ريان عبدالله القرني",
  "كريم نواف العتيبي", "عبدالرحمن ياسر الدوسري", "تميم بشير العنزي",
];

const KNOWLEDGE_TASKS_TEMPLATE = [
  "حفظ جزء من القرآن",
  "إكمال دورة تعريفية",
  "تسليم بحث قصير",
  "حضور محاضرة فكرية",
  "اختبار تحصيلي شهري",
];

function generateBarcodeId(index) {
  const year = new Date().getFullYear();
  return `QC${year}${String(index).padStart(4, "0")}`;
}

async function run() {
  // اتصال منفصل خاص بالتهيئة (وليس عبر pool المشترك في db.js)
  // مهم: multipleStatements: true لتنفيذ schema.sql دفعة واحدة (يحتوي عدة جمل SQL)
  const connectionConfig = process.env.DATABASE_URL
    ? process.env.DATABASE_URL
    : {
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "qayrawan_club",
      };

  const connection = await mysql.createConnection(
    typeof connectionConfig === "string"
      ? connectionConfig + (connectionConfig.includes("?") ? "&" : "?") + "multipleStatements=true"
      : { ...connectionConfig, multipleStatements: true }
  );

  try {
    console.log("⏳ إنشاء الجداول من schema.sql ...");
    const schemaPath = path.join(__dirname, "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    await connection.query(schemaSql);
    console.log("✅ تم إنشاء الجداول بنجاح");

    console.log("⏳ إدخال المجموعات ...");
    const groupIdByName = {};
    for (const { name, category } of GROUPS_WITH_CATEGORY) {
      // INSERT ... ON DUPLICATE KEY UPDATE هو معادل ON CONFLICT في MySQL
      await connection.query(
        "INSERT INTO `groups` (name, category) VALUES (?, ?) ON DUPLICATE KEY UPDATE category = VALUES(category)",
        [name, category]
      );
      const [rows] = await connection.query("SELECT id FROM `groups` WHERE name = ?", [name]);
      groupIdByName[name] = rows[0].id;
    }
    console.log("✅ تمت إضافة المجموعات");

    // الجلسات التسع تُدرَج تلقائياً ضمن schema.sql (لا حاجة لجلبها هنا بعد إزالة حضور البذر العشوائي)

    console.log("⏳ إدخال الطلاب وبياناتهم ...");
    let barcodeCounter = 1;

    for (let idx = 0; idx < SAMPLE_NAMES.length; idx++) {
      const name = SAMPLE_NAMES[idx];
      const groupName = GROUP_NAMES[idx % GROUP_NAMES.length];
      const groupId = groupIdByName[groupName];
      const barcode = generateBarcodeId(barcodeCounter++);

      const knowledgePoints = Math.floor(Math.random() * 60) + 10;
      const sportsPoints = Math.floor(Math.random() * 60) + 10;
      const culturalPoints = Math.floor(Math.random() * 60) + 10;
      const guardianPhone = "05" + Math.floor(10000000 + Math.random() * 89999999);

      // mysql2 يرجع [rows, fields] دائماً، والـ insertId يوصلنا له عبر rows.insertId
      const [studentResult] = await connection.query(
        `INSERT INTO students (barcode, name, name_normalized, group_id, knowledge_points, sports_points, cultural_points, guardian_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [barcode, name, normalizeArabic(name), groupId, knowledgePoints, sportsPoints, culturalPoints, guardianPhone]
      );
      const studentId = studentResult.insertId;

      // متطلبات البرنامج المعرفي — تبدأ كلها "غير مُنجزة" حتى يقيّمها المشرف فعلياً
      for (const taskTitle of KNOWLEDGE_TASKS_TEMPLATE) {
        await connection.query(
          "INSERT INTO knowledge_tasks (student_id, title, done) VALUES (?, ?, FALSE)",
          [studentId, taskTitle]
        );
      }

      // لا حضور مبدئياً — يُسجَّل فقط عند مسح الباركود الفعلي أو الإدخال اليدوي
      // من لوحة المشرف، أو تلقائياً كـ"غايب" بعد انتهاء يوم الجلسة دون تسجيل

      // مبادرات تجريبية لأول 5 طلاب فقط
      if (idx < 5) {
        const sampleInitiatives = [
          "مبادرة تنظيف الحي", "قراءة كتاب إضافي", "تطوع في فعالية النادي",
          "مساعدة زميل متعثر", "تنظيم ركن توعوي",
        ];
        await connection.query(
          "INSERT INTO initiatives (student_id, title, points) VALUES (?, ?, ?)",
          [studentId, sampleInitiatives[idx], Math.floor(Math.random() * 10) + 5]
        );
      }
    }

    console.log(`✅ تمت إضافة ${SAMPLE_NAMES.length} طالباً ببياناتهم الكاملة`);
    console.log("🎉 تمت تهيئة قاعدة البيانات بنجاح");
  } catch (err) {
    console.error("❌ حدث خطأ أثناء التهيئة:", err);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

run();
