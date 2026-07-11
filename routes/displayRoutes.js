const express = require("express");
const router  = express.Router();
const displayController = require("../controllers/displayController");

router.get("/display",           displayController.showDisplay);
router.get("/api/display/data",  displayController.getDisplayData);

module.exports = router;
