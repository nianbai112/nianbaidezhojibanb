import express from 'express';
import request from 'supertest';
import { preserveRiderAuthorizationBody } from './rider-authorization-body';

describe('rider WeChat authorization callback raw body', () => {
  it.each(['/wxpay/rider-authorization-notify', '/api/wxpay/rider-authorization-notify', '/api/v1/wxpay/rider-authorization-notify'])(
    'retains exact UTF-8 bytes at %s before later body parsers', async route => {
      const app = express();
      app.use(express.json({ limit: '2mb', verify: preserveRiderAuthorizationBody }));
      app.use(express.json());
      app.post(route, (req: any, res) => res.json({ raw: req.rawBody.toString('base64'), body: req.body }));
      const raw = '{\n  "summary": "骑手授权", "value": 1\n}\n';
      const response = await request(app).post(route).set('Content-Type', 'application/json').send(raw).expect(200);
      expect(response.body.raw).toBe(Buffer.from(raw).toString('base64'));
      expect(response.body.body).toEqual(JSON.parse(raw));
    },
  );
});
