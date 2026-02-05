
// check if modified since header

import { freshness } from './freshness';
import { getCache, setCache } from './cache';


export function smartCache(resource: 'teams' | 'controls' | 'faqs') {
  return async (req, res, next) => {
    const cacheKey = `${req.method}:${req.path}`;
    const cached = getCache(cacheKey);
    
    // check If-Modified-Since header (NOTE: add If-modified-Since header to client GET fetch request)
    const ifModifiedSince = req.headers['if-modified-since'];
    if (ifModifiedSince && cached) {
      const clientDate = new Date(ifModifiedSince);
      const resourceFreshness = freshness[resource];
      
      if (resourceFreshness && clientDate >= resourceFreshness) {
        return res.status(304).end(); // Not Modified
      }
    }
    
    // not cached or stale - continue to controller
    const originalJson = res.json.bind(res);
    
    res.json = function(data) {
      setCache(cacheKey, data);
      res.setHeader('Last-Modified', freshness[resource]?.toUTCString() || new Date().toUTCString());
      return originalJson(data);
    };
    
    next();
  };
}