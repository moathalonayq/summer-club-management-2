/* =========================================================
   routes/groupRoutes.js
   ========================================================= */
const express = require("express");
const router = express.Router();
const groupController = require("../controllers/groupController");

router.get("/groups", groupController.showGroupsPage);

module.exports = router;
