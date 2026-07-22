/* =========================================================
   routes/supervisorRoutes.js
   ========================================================= */
const express = require("express");
const router = express.Router();
const supervisorController = require("../controllers/supervisorController");
const { requireSupervisorPage, requireSupervisorApi, requireAdminApi } = require("../middleware/requireSupervisor");

/* -------- صفحات -------- */
router.get("/supervisor/login", supervisorController.showLoginPage);
router.post("/supervisor/login", supervisorController.handleLogin);
router.post("/supervisor/logout", supervisorController.handleLogout);
router.get("/supervisor/panel", requireSupervisorPage, supervisorController.showPanel);
router.get("/supervisor/attendance-cards", requireSupervisorPage, supervisorController.showAttendanceCards);
router.get("/supervisor/points-archive", requireSupervisorPage, supervisorController.showPointsArchive);

/* -------- API (محمية بجلسة المشرف) -------- */
router.post("/api/supervisor/students", requireAdminApi, supervisorController.addStudent);
router.post("/api/supervisor/students/move", requireAdminApi, supervisorController.moveStudent);
router.post("/api/supervisor/points", requireSupervisorApi, supervisorController.addPoints);
router.post("/api/supervisor/attendance", requireSupervisorApi, supervisorController.markAttendanceManual);
router.post("/api/supervisor/scan", requireSupervisorApi, supervisorController.scanBarcodeAttendance);
router.post("/api/supervisor/tasks", requireAdminApi, supervisorController.setKnowledgeTaskStatus);
router.get("/api/supervisor/task-config", requireAdminApi, supervisorController.getTaskConfig);
router.post("/api/supervisor/task-config", requireAdminApi, supervisorController.saveTaskConfig);
router.post("/api/supervisor/toggle-scores", requireAdminApi, supervisorController.toggleScoresVisible);
router.post("/api/supervisor/archive-week", requireAdminApi, supervisorController.archiveWeekPoints);
router.post("/api/supervisor/home-tasks", requireSupervisorApi, supervisorController.setHomeTaskStatus);
router.get("/api/supervisor/home-task-config", requireAdminApi, supervisorController.getHomeTaskConfig);
router.post("/api/supervisor/home-task-config", requireAdminApi, supervisorController.saveHomeTaskConfig);

module.exports = router;
