import {
  getConversationDetail,
  getConversations,
  getEmployees,
  getOverview,
  getQuality,
  listAvailableDates,
} from '../../database/repositories/dashboardRepository.js';
import { getCollectJobStatus, startCollectJob } from '../../services/collectJobService.js';
import { getNightCollectStatus } from '../../services/nightCollectWorker.js';
import {
  getCollectorHeadless,
  setCollectorHeadless,
} from '../../services/collectorSettingsService.js';
import { getLoginJobStatus, startLoginJob } from '../../services/loginJobService.js';
import {
  getSessionStatus,
  probeCurrentSession,
  uploadSession,
} from '../../services/sessionUploadService.js';
import { createModuleLogger } from '../../logger/index.js';
import { normalizeDateRange } from '../../utils/dateRange.js';
import { Router } from 'express';

const log = createModuleLogger('api');

function parseRange(query: { from?: unknown; to?: unknown; date?: unknown }) {
  return normalizeDateRange({
    from: query.from,
    to: query.to,
    date: query.date,
  });
}

export function createApiRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'line-oa-monitor-api' });
  });

  router.get('/dates', async (_req, res) => {
    try {
      const dates = await listAvailableDates();
      res.json({ dates });
    } catch (err) {
      log.error('dates failed', { err });
      res.status(500).json({ error: 'Failed to list dates' });
    }
  });

  router.get('/overview', async (req, res) => {
    const range = parseRange(req.query);
    try {
      const data = await getOverview(range);
      res.json(data);
    } catch (err) {
      log.error('overview failed', { err, range });
      res.status(500).json({ error: 'Failed to load overview' });
    }
  });

  router.get('/employees', async (req, res) => {
    const range = parseRange(req.query);
    try {
      const employees = await getEmployees(range);
      res.json({
        businessDate: range.to,
        fromDate: range.from,
        toDate: range.to,
        employees,
      });
    } catch (err) {
      log.error('employees failed', { err, range });
      res.status(500).json({ error: 'Failed to load employees' });
    }
  });

  router.get('/conversations', async (req, res) => {
    const range = parseRange(req.query);
    try {
      const conversations = await getConversations(range);
      res.json({
        businessDate: range.to,
        fromDate: range.from,
        toDate: range.to,
        conversations,
      });
    } catch (err) {
      log.error('conversations failed', { err, range });
      res.status(500).json({ error: 'Failed to load conversations' });
    }
  });

  /** Detail for slide-over — chatKey as query (keys can contain ://) */
  router.get('/conversation', async (req, res) => {
    const range = parseRange(req.query);
    const chatKey = typeof req.query.chatKey === 'string' ? req.query.chatKey : '';
    if (!chatKey) {
      res.status(400).json({ error: 'chatKey is required' });
      return;
    }
    try {
      const data = await getConversationDetail(range, chatKey);
      if (!data) {
        res.status(404).json({ error: 'Conversation not found for this date range' });
        return;
      }
      res.json(data);
    } catch (err) {
      log.error('conversation detail failed', { err, range, chatKey });
      res.status(500).json({ error: 'Failed to load conversation detail' });
    }
  });

  router.get('/quality', async (req, res) => {
    const range = parseRange(req.query);
    try {
      const data = await getQuality(range);
      res.json(data);
    } catch (err) {
      log.error('quality failed', { err, range });
      res.status(500).json({ error: 'Failed to load quality' });
    }
  });

  router.get('/collect/status', async (_req, res) => {
    try {
      res.json({
        ...getCollectJobStatus(),
        nightCollect: getNightCollectStatus(),
        session: await getSessionStatus(),
      });
    } catch (err) {
      log.error('collect status failed', { err });
      res.status(500).json({ error: 'Failed to load collect status' });
    }
  });

  router.get('/collector/settings', async (_req, res) => {
    try {
      const session = await getSessionStatus();
      res.json({
        headless: getCollectorHeadless(),
        login: getLoginJobStatus(),
        session,
      });
    } catch (err) {
      log.error('collector settings failed', { err });
      res.status(500).json({ error: 'Failed to load collector settings' });
    }
  });

  router.put('/collector/settings', (req, res) => {
    const headless = req.body?.headless;
    if (typeof headless !== 'boolean') {
      res.status(400).json({ error: 'headless must be boolean' });
      return;
    }
    res.json({
      headless: setCollectorHeadless(headless).headless,
      login: getLoginJobStatus(),
    });
  });

  router.get('/login/status', (_req, res) => {
    res.json(getLoginJobStatus());
  });

  router.get('/session/status', async (_req, res) => {
    try {
      res.json(await getSessionStatus());
    } catch (err) {
      log.error('session status failed', { err });
      res.status(500).json({ error: 'Failed to load session status' });
    }
  });

  router.post('/session/upload', async (req, res) => {
    const token =
      typeof req.body?.token === 'string'
        ? req.body.token
        : typeof req.headers['x-session-token'] === 'string'
          ? req.headers['x-session-token']
          : null;
    const storageState = req.body?.storageState;
    if (!storageState || typeof storageState !== 'object') {
      res.status(400).json({ error: 'storageState is required' });
      return;
    }

    try {
      const result = await uploadSession(storageState, {
        token,
        clientIp: req.ip ?? req.socket.remoteAddress ?? null,
      });
      if (!result.ok) {
        res.status(result.probeOk === false ? 422 : 403).json({
          error: result.error,
          probeOk: result.probeOk,
        });
        return;
      }
      res.json({
        ok: true,
        message: 'บันทึก session LINE แล้ว',
        probeOk: result.probeOk,
        session: result.status,
      });
    } catch (err) {
      log.error('session upload failed', { err });
      res.status(500).json({ error: 'Failed to upload session' });
    }
  });

  router.post('/session/probe', async (_req, res) => {
    try {
      const result = await probeCurrentSession();
      res.status(result.ok ? 200 : 422).json({
        ok: result.ok,
        error: result.error,
        session: result.status,
      });
    } catch (err) {
      log.error('session probe failed', { err });
      res.status(500).json({ error: 'Failed to probe session' });
    }
  });

  router.post('/login', (_req, res) => {
    const result = startLoginJob();
    if (!result.ok) {
      res.status(409).json({ error: result.error, status: getLoginJobStatus() });
      return;
    }
    res.status(202).json({
      ok: true,
      message: 'เปิดเบราว์เซอร์สำหรับ login LINE แล้ว',
      status: getLoginJobStatus(),
    });
  });

  router.post('/collect', (req, res) => {
    const range = normalizeDateRange({
      from: req.body?.from ?? req.query.from,
      to: req.body?.to ?? req.query.to,
      date: req.body?.date ?? req.query.date,
    });
    const result = startCollectJob(range);
    if (!result.ok) {
      res.status(409).json({ error: result.error, status: getCollectJobStatus() });
      return;
    }
    res.status(202).json({
      ok: true,
      message: 'เริ่มเก็บข้อมูลแล้ว',
      status: {
        ...getCollectJobStatus(),
        nightCollect: getNightCollectStatus(),
      },
    });
  });

  return router;
}
