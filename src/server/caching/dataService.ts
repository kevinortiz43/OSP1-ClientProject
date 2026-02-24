// services/dataService.ts
import { getCache, setCache, clearCache } from "./cache";
import db from "../sql_db/db_connect_agnostic";

export const CacheKeys = {
  TEAMS_ALL: "teams:all",
  CONTROLS_ALL: "controls:all",
  FAQS_ALL: "faqs:all",
};

export const dataService = {
  async getTeams() {
    const cached = getCache(CacheKeys.TEAMS_ALL);
    if (cached) {
      return { data: cached, source: "cache" };
    }

    const result = await db.query('SELECT * FROM "allTeams"');
    const data = result.rows;
    setCache(CacheKeys.TEAMS_ALL, data, 300);
    return { data, source: "database" };
  },

  async getControls() {
    const cached = getCache(CacheKeys.CONTROLS_ALL);
    if (cached) {
      return { data: cached, source: "cache" };
    }

    const result = await db.query('SELECT * FROM "allTrustControls"');
    const data = result.rows;
    setCache(CacheKeys.CONTROLS_ALL, data, 300);
    return { data, source: "database" };
  },

  async getFaqs() {
    const cached = getCache(CacheKeys.FAQS_ALL);
    if (cached) {
      return { data: cached, source: "cache" };
    }

    const result = await db.query('SELECT * FROM "allTrustFaqs"');
    const data = result.rows;
    setCache(CacheKeys.FAQS_ALL, data, 300);
    return { data, source: "database" };
  },

  clearCache(type?: "teams" | "controls" | "faqs") {
    if (!type) {
      clearCache();
      return;
    }

    const keyMap = {
      teams: CacheKeys.TEAMS_ALL,
      controls: CacheKeys.CONTROLS_ALL,
      faqs: CacheKeys.FAQS_ALL,
    };

    clearCache(keyMap[type]);
  },
};
