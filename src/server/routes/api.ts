import {
  getConversationDetail,
  getConversations,
  getEmployees,
  getOverview,
  getQuality,
  listAvailableDates,
} from '../../database/repositories/dashboardRepository.js';
import { getCollectJobStatus, startCollectJob } from '../../services/collectJobService.js';
import { createModuleLogger } from '../../logger/index.js';
import dayjs from 'dayjs';
import { Router } from 'express';

const log = createModuleLogger('api');

function parseDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return dayjs(raw).format('YYYY-MM-DD') === raw ? raw : null;
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
    const date = parseDate(req.query.date) ?? dayjs().format('YYYY-MM-DD');
    try {
      const data = await getOverview(date);
      res.json(data);
    } catch (err) {
      log.error('overview failed', { err, date });
      res.status(500).json({ error: 'Failed to load overview' });
    }
  });

  router.get('/employees', async (req, res) => {
    const date = parseDate(req.query.date) ?? dayjs().format('YYYY-MM-DD');
    try {
      const employees = await getEmployees(date);
      res.json({ businessDate: date, employees });
    } catch (err) {
      log.error('employees failed', { err, date });
      res.status(500).json({ error: 'Failed to load employees' });
    }
  });

  router.get('/conversations', async (req, res) => {
    const date = parseDate(req.query.date) ?? dayjs().format('YYYY-MM-DD');
    try {
      const conversations = await getConversations(date);
      res.json({ businessDate: date, conversations });
    } catch (err) {
      log.error('conversations failed', { err, date });
      res.status(500).json({ error: 'Failed to load conversations' });
    }
  });

  /** Detail for slide-over — chatKey as query (keys can contain ://) */
  router.get('/conversation', async (req, res) => {
    const date = parseDate(req.query.date) ?? dayjs().format('YYYY-MM-DD');
    const chatKey = typeof req.query.chatKey === 'string' ? req.query.chatKey : '';
    if (!chatKey) {
      res.status(400).json({ error: 'chatKey is required' });
      return;
    }
    try {
      const data = await getConversationDetail(date, chatKey);
      if (!data) {
        res.status(404).json({ error: 'Conversation not found for this date' });
        return;
      }
      res.json(data);
    } catch (err) {
      log.error('conversation detail failed', { err, date, chatKey });
      res.status(500).json({ error: 'Failed to load conversation detail' });
    }
  });

  router.get('/quality', async (req, res) => {
    const date = parseDate(req.query.date) ?? dayjs().format('YYYY-MM-DD');
    try {
      const data = await getQuality(date);
      res.json(data);
    } catch (err) {
      log.error('quality failed', { err, date });
      res.status(500).json({ error: 'Failed to load quality' });
    }
  });

  router.get('/collect/status', (_req, res) => {
    res.json(getCollectJobStatus());
  });

  router.post('/collect', (req, res) => {
    const date =
      parseDate(req.body?.date) ??
      parseDate(req.query.date) ??
      dayjs().format('YYYY-MM-DD');
    const result = startCollectJob(date);
    if (!result.ok) {
      res.status(409).json({ error: result.error, status: getCollectJobStatus() });
      return;
    }
    res.status(202).json({
      ok: true,
      message: 'เริ่มเก็บข้อมูลแล้ว',
      status: getCollectJobStatus(),
    });
  });

  return router;
}
