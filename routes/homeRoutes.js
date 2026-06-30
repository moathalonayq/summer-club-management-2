/* =========================================================
   routes/homeRoutes.js
   ========================================================= */
const express = require("express");
const router = express.Router();
const homeController = require("../controllers/homeController");

router.get("/", homeController.showHome);

module.exports = router;
