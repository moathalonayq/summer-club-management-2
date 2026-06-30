/* =========================================================
   routes/supervisorRoutes.js
   ========================================================= */
const express = require("express");
const router = express.Router();
const supervisorController = require("../controllers/supervisorController");
const { requireSupervisorPage, requireSupervisorApi } = require("../middleware/requireSupervisor");

/* -------- صفحات -------- */
router.get("/supervisor/login", supervisorController.showLoginPage);
router.post("/supervisor/login", supervisorController.handleLogin);
router.post("/supervisor/logout", supervisorController.handleLogout);
router.get("/supervisor/panel", requireSupervisorPage, supervisorController.showPanel);

/* -------- API (محمية بجلسة المشرف) -------- */
router.post("/api/supervisor/points", requireSupervisorApi, supervisorController.addPoints);
router.post("/api/supervisor/attendance", requireSupervisorApi, supervisorController.markAttendanceManual);
router.post("/api/supervisor/scan", requireSupervisorApi, supervisorController.scanBarcodeAttendance);
router.post("/api/supervisor/tasks", requireSupervisorApi, supervisorController.setKnowledgeTaskStatus);

module.exports = router;
