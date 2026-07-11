/* =========================================================
   app.js
   نقطة تشغيل تطبيق Express لموقع نادي القيروان
   ========================================================= */

require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");

const homeRoutes = require("./routes/homeRoutes");
const guardianRoutes = require("./routes/guardianRoutes");
const groupRoutes = require("./routes/groupRoutes");
const supervisorRoutes = require("./routes/supervisorRoutes");
const displayRoutes = require("./routes/displayRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

/* -------- محرك القوالب EJS -------- */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/* -------- قراءة بيانات النماذج (form-data) و JSON -------- */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* -------- الملفات الثابتة (CSS / JS / صور) -------- */
app.use(express.static(path.join(__dirname, "public")));

/* -------- الجلسات (لتسجيل دخول المشرف) -------- */
app.use(session({
  secret: process.env.SESSION_SECRET || "qayrawan-club-secret-key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8, // 8 ساعات
    secure: process.env.NODE_ENV === "production",
  },
}));

/* -------- متغيرات عامة متاحة في كل القوالب -------- */
app.use((req, res, next) => {
  res.locals.isSupervisor = !!(req.session && req.session.isSupervisor);
  res.locals.currentYear = new Date().getFullYear();
  next();
});

/* -------- المسارات -------- */
app.use("/", homeRoutes);
app.use("/", guardianRoutes);
app.use("/", groupRoutes);
app.use("/", supervisorRoutes);
app.use("/", displayRoutes);

/* -------- صفحة 404 -------- */
app.use((req, res) => {
  res.status(404).render("404", { pageTitle: "الصفحة غير موجودة", activeNav: "" });
});

/* -------- معالج الأخطاء العام -------- */
app.use((err, req, res, next) => {
  console.error("❌ خطأ في التطبيق:", err);
  res.status(500).render("error", {
    pageTitle: "حدث خطأ",
    activeNav: "",
    message: process.env.NODE_ENV === "production"
      ? "حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً"
      : err.message,
  });
});

// نُشغّل الخادم فقط عند تشغيل هذا الملف مباشرة (node app.js / npm start)
// وليس عند استدعائه من ملفات الاختبار (require("../app")) حتى لا يحجز
// منفذاً فعلياً أثناء تشغيل supertest، الذي ينشئ خادمه المؤقت بنفسه.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 الموقع يعمل الآن على المنفذ ${PORT}`);
  });
}

module.exports = app;
