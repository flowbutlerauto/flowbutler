const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const express = require('express');
const cors = require('cors');

const { getCjTrackingResults } = require('./cj-tracking');
const { getLotteTrackingResults } = require('./lotte-tracking');
const { getDoobalHeroTrackingResults } = require('./doobalhero-tracking');
const { getEpostTrackingResults } = require('./epost-tracking');

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

function safeString(value) {
  return String(value ?? '').trim();
}

function normalizeCourierCode(value) {
  const raw = safeString(value).toUpperCase();

  if (!raw) {
    return '';
  }

  if (['CJ', 'CJ대한통운'].includes(raw)) {
    return 'CJ';
  }

  if (['LOTTE', '롯데택배', '롯데글로벌로지스'].includes(raw)) {
    return 'LOTTE';
  }

  if (['DOOBALHERO', '두발히어로', '체인로지스'].includes(raw)) {
    return 'DOOBALHERO';
  }

  if (['EPOST', '우체국', '우체국택배', '우편', 'POST'].includes(raw)) {
    return 'EPOST';
  }

  return 'UNSUPPORTED';
}

function normalizeTrackingNumbers(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map(function (value) {
          return safeString(value).replace(/\D/g, '');
        })
        .filter(Boolean),
    ),
  );
}

function getCourierDisplayName(courierCode) {
  if (courierCode === 'CJ') {
    return 'CJ대한통운';
  }

  if (courierCode === 'LOTTE') {
    return '롯데택배';
  }

  if (courierCode === 'DOOBALHERO') {
    return '두발히어로';
  }

  if (courierCode === 'EPOST') {
    return '우체국택배';
  }

  return '';
}

app.get('/api/health', function (req, res) {
  res.json({
    ok: true,
    message: 'Flowbutler tracking API is running',
  });
});

app.post('/api/tracking', async function (req, res) {
  try {
    logger.info('tracking request body', req.body);

    const body = req.body || {};
    const courier = body.courier;
    const trackingNumbers = body.trackingNumbers;

    const normalizedCourier = normalizeCourierCode(courier);

    if (!safeString(courier)) {
      return res.status(400).json({
        code: 'EMPTY_COURIER',
        message: 'courier 값이 필요합니다.',
      });
    }

    if (normalizedCourier === 'UNSUPPORTED') {
      return res.status(400).json({
        code: 'UNSUPPORTED_COURIER',
        message: '지원하지 않는 택배사입니다. 현재는 CJ대한통운, 롯데택배, 두발히어로, 우체국택배만 지원합니다.',
        receivedCourier: courier,
      });
    }

    if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return res.status(400).json({
        code: 'EMPTY_TRACKING_NUMBERS',
        message: 'trackingNumbers는 1개 이상의 송장번호 배열이어야 합니다.',
      });
    }

    const normalizedNumbers = normalizeTrackingNumbers(trackingNumbers);

    if (normalizedNumbers.length === 0) {
      return res.status(400).json({
        code: 'EMPTY_VALID_TRACKING_NUMBERS',
        message: '유효한 송장번호가 없습니다.',
      });
    }

    if (normalizedNumbers.length > 500) {
      return res.status(400).json({
        code: 'TOO_MANY_TRACKING_NUMBERS',
        message: '한 번에 최대 500건까지만 조회할 수 있습니다.',
      });
    }

    let results = {};

    if (normalizedCourier === 'CJ') {
      results = await getCjTrackingResults(normalizedNumbers);
    } else if (normalizedCourier === 'LOTTE') {
      results = await getLotteTrackingResults(normalizedNumbers);
    } else if (normalizedCourier === 'DOOBALHERO') {
      results = await getDoobalHeroTrackingResults(normalizedNumbers);
    } else if (normalizedCourier === 'EPOST') {
      results = await getEpostTrackingResults(normalizedNumbers);
    }


    return res.json({
      courier: getCourierDisplayName(normalizedCourier),
      requestedCount: normalizedNumbers.length,
      resultCount: Object.keys(results).length,
      results: results,
    });
  } catch (error) {
    logger.error('tracking api error', error);

    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '송장 조회 중 서버 오류가 발생했습니다.',
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