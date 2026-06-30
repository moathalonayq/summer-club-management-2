/* =========================================================
   routes/guardianRoutes.js
   ========================================================= */
const express = require("express");
const router = express.Router();
const guardianController = require("../controllers/guardianController");

router.get("/guardian", guardianController.showGuardianPage);
router.get("/api/students/search", guardianController.searchStudents);
router.get("/api/students/:id", guardianController.getStudentDetails);

module.exports = router;
