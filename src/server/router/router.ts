import express from "express";
import faqController from "../controller/faqController";
import trustController from "../controller/trustController";
import allTeams from "../controller/teamsController";


const router = express.Router();

router.get("/test", (_, res) => {
  return res.status(200).send("TEST TESTTEST ");
});

router.get("/trustControls", trustController.getTrustControls, (_, res) => {
  return res.status(200).json(res.locals.dbResults);
});


router.get("/allTeams", allTeams.getTrustControls, (_, res) => {
  return res.status(200).json(res.locals.dbResults);
});





router.get("/trustFaqs", faqController.getTrustFaqs, (_, res) => {
  return res.status(200).json(res.locals.dbResults);
});
export default router;
