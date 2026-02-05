import express from "express";
import faqController from "../controller/faqController";
import trustController from "../controller/trustController";
import teamsController from "../controller/teamsController";


const router = express.Router();

router.get("/test", (_, res) => {
  return res.status(200).send("test");
});


// test endpoint to see what data given back
router.get("/test-etag", (req, res) => {
  // Test 1: Check if Express adds anything automatically
  console.log("=== Testing Express ETag Behavior ===");
  console.log("1. Initial headers:", res.getHeaders());
  
  // Test 2: What happens with res.json()?
  const data = { id: 1, name: "Test" };
  
  // Manually set a header to compare
  res.setHeader('X-Test-Manual', 'manual-header');
  
  console.log("2. After setting manual header:", res.getHeaders());
  
  // Send the response
  res.json(data);
  
  console.log("3. Headers sent to client (check your DevTools Network tab)");
  console.log("======================================");
});


router.get("/trustControls", trustController.getTrustControls, (_, res) => {
  return res.status(200).json(res.locals.dbResults);
});


router.get("/allTeams", teamsController.getTeams, (_, res) => {
  return res.status(200).json(res.locals.dbResults);
});

router.get("/trustFaqs", faqController.getTrustFaqs, (_, res) => {
  return res.status(200).json(res.locals.dbResults);
});



export default router;
