const {onRequest} = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const express = require('express');
const cors = require('cors');
const {getCjTrackingResults} = require('./cj-tracking');

const app = express();

app.use(cors({origin: true}));
app.use(express.json());

app.get('/health', function (req, res) {
  res.json({
    ok: true,
    message: 'Flowbutler tracking API is running',
  });
});

app.post('/tracking/cj', async function (req, res) {
  try {
    logger.info('tracking request body', req.body);

    const body = req.body || {};
    const courier = body.courier;
    const trackingNumbers = body.trackingNumbers;
    const normalizedCourier = String(courier || '').trim();

    if (!['CJ대한통운', 'CJ', 'cj', 'cj대한통운'].includes(normalizedCourier)) {
      return res.status(400).json({
        error: '지원하지 않는 택배사입니다. 현재는 CJ대한통운만 지원합니다.',
        receivedCourier: courier,
        normalizedCourier: normalizedCourier,
      });
    }

    if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return res.status(400).json({
        error: 'trackingNumbers는 1개 이상의 송장번호 배열이어야 합니다.',
      });
    }

    if (trackingNumbers.length > 200) {
      return res.status(400).json({
        error: '한 번에 최대 200건까지만 조회할 수 있습니다.',
      });
    }

    const normalizedNumbers = Array.from(new Set(
        trackingNumbers
            .map(function (v) {
              return String(v).replace(/\D/g, '').trim();
            })
            .filter(function (v) {
              return Boolean(v);
            }),
    ));

    const results = await getCjTrackingResults(normalizedNumbers);

    return res.json({
      courier: 'CJ대한통운',
      requestedCount: normalizedNumbers.length,
      resultCount: Object.keys(results).length,
      results: results,
    });
  } catch (error) {
    logger.error('tracking api error', error);

    return res.status(500).json({
      error: '송장 조회 중 서버 오류가 발생했습니다.',
      detail: error.message || 'unknown error',
    });
  }
});

exports.api = onRequest(
    {
      region: 'asia-northeast3',
      timeoutSeconds: 60,
      memory: '512MiB',
    },
    app,
);
