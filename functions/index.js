const {onRequest} = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const {getCjTrackingResults} = require('./cj-tracking');
const {getLotteTrackingResults} = require('./lotte-tracking');
const {getDoobalHeroTrackingResults} = require('./doobalhero-tracking');
const {getEpostTrackingResults} = require('./epost-tracking');

admin.initializeApp();

const app = express();
const firestore = admin.firestore();

app.use(cors({origin: true}));
app.use(express.json());

const COURIER_ALIASES = {
  CJ: ['CJ', 'CJ대한통운'],
  LOTTE: ['LOTTE', '롯데택배', '롯데글로벌로지스'],
  DOOBALHERO: ['DOOBALHERO', '두발히어로', '체인로지스'],
  EPOST: ['EPOST', '우체국', '우체국택배', '우편', 'POST'],
};

const COURIER_DISPLAY_NAMES = {
  CJ: 'CJ대한통운',
  LOTTE: '롯데택배',
  DOOBALHERO: '두발히어로',
  EPOST: '우체국택배',
};

const TRACKING_HANDLER_MAP = {
  CJ: getCjTrackingResults,
  LOTTE: getLotteTrackingResults,
  DOOBALHERO: getDoobalHeroTrackingResults,
  EPOST: getEpostTrackingResults,
};

const COURIER_CODE_BY_ALIAS = Object.freeze(
    Object.entries(COURIER_ALIASES).reduce(function (acc, entry) {
      const courierCode = entry[0];
      const aliasList = entry[1];

      aliasList.forEach(function (alias) {
        acc[String(alias).toUpperCase()] = courierCode;
      });

      return acc;
    }, {}),
);

function safeString(value) {
  return String(value ?? '').trim();
}

function normalizeCourierCode(value) {
  const raw = safeString(value).toUpperCase();

  if (!raw) {
    return '';
  }

  return COURIER_CODE_BY_ALIAS[raw] || 'UNSUPPORTED';
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
  return COURIER_DISPLAY_NAMES[courierCode] || '';
}

function getUserStatus(userData) {
  if (!userData || typeof userData !== 'object') {
    return 'pending';
  }

  if (safeString(userData.status)) {
    return safeString(userData.status).toLowerCase();
  }

  return userData.approved === true ? 'approved' : 'pending';
}

function isManagerOrAdminRole(role) {
  return role === 'manager' || role === 'admin';
}

async function verifyAdminRequest(req, res) {
  const authHeader = safeString(req.headers.authorization);

  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      code: 'UNAUTHORIZED',
      message: '인증 토큰이 필요합니다.',
    });
    return null;
  }

  const idToken = safeString(authHeader.slice(7));
  if (!idToken) {
    res.status(401).json({
      code: 'UNAUTHORIZED',
      message: '유효하지 않은 인증 토큰입니다.',
    });
    return null;
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    logger.error('verifyIdToken error', error);
    res.status(401).json({
      code: 'INVALID_TOKEN',
      message: '인증 토큰 검증에 실패했습니다.',
    });
    return null;
  }

  const roleFromToken = safeString(decodedToken.role).toLowerCase();

  if (isManagerOrAdminRole(roleFromToken)) {
    return {
      uid: decodedToken.uid,
      role: roleFromToken,
    };
  }

  const userDocRef = firestore.collection('users').doc(decodedToken.uid);
  const userDocSnap = await userDocRef.get();
  const userData = userDocSnap.data() || {};
  const roleFromDoc = safeString(userData.role).toLowerCase();

  if (!isManagerOrAdminRole(roleFromDoc)) {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: '관리자 권한이 필요합니다.',
    });
    return null;
  }

  return {
    uid: decodedToken.uid,
    role: roleFromDoc,
  };
}

app.get('/api/health', function (req, res) {
  res.json({
    ok: true,
    message: 'Flowbutler tracking API is running',
  });
});

app.get('/api/admin/users/pending', async function (req, res) {
  try {
    const actor = await verifyAdminRequest(req, res);
    if (!actor) return;

    const usersCollection = firestore.collection('users');

    const [statusPendingSnapshot, approvedFalseSnapshot] = await Promise.all([
      usersCollection.where('status', '==', 'pending').limit(400).get(),
      usersCollection.where('approved', '==', false).limit(400).get(),
    ]);

    const userMap = new Map();

    statusPendingSnapshot.docs.forEach(function (docSnap) {
      userMap.set(docSnap.id, docSnap);
    });

    approvedFalseSnapshot.docs.forEach(function (docSnap) {
      userMap.set(docSnap.id, docSnap);
    });

    const users = Array.from(userMap.values())
        .map(function (docSnap) {
          const data = docSnap.data() || {};
          return {
            uid: docSnap.id,
            email: safeString(data.email),
            plan: safeString(data.plan) || 'free',
            role: safeString(data.role) || 'user',
            status: getUserStatus(data),
            createdAt: data.createdAt || null,
          };
        })
        .filter(function (user) {
          return user.status === 'pending';
        })
        .sort(function (a, b) {
          const aMillis = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : 0;
          const bMillis = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : 0;
          return bMillis - aMillis;
        })
        .slice(0, 200);

    res.json({
      requestedBy: actor.uid,
      count: users.length,
      users,
    });
  } catch (error) {
    logger.error('get pending users error', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '승인 대기 목록 조회 중 오류가 발생했습니다.',
      detail: error.message || 'unknown error',
    });
  }
});

app.post('/api/admin/users/:uid/approve', async function (req, res) {
  try {
    const actor = await verifyAdminRequest(req, res);
    if (!actor) return;

    const targetUid = safeString(req.params.uid);
    if (!targetUid) {
      return res.status(400).json({
        code: 'INVALID_UID',
        message: '유효한 uid가 필요합니다.',
      });
    }

    const userDocRef = firestore.collection('users').doc(targetUid);

    await firestore.runTransaction(async function (transaction) {
      const userSnap = await transaction.get(userDocRef);
      if (!userSnap.exists) {
        throw new Error('USER_NOT_FOUND');
      }

      const userData = userSnap.data() || {};
      const status = getUserStatus(userData);
      if (status !== 'pending') {
        throw new Error('USER_ALREADY_PROCESSED');
      }

      transaction.update(userDocRef, {
        status: 'approved',
        approved: true,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: actor.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const logDocRef = firestore.collection('admin_audit_logs').doc();
      transaction.set(logDocRef, {
        action: 'approve_user',
        targetUid,
        actorUid: actor.uid,
        actorRole: actor.role,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return res.json({
      ok: true,
      uid: targetUid,
      status: 'approved',
    });
  } catch (error) {
    if (error.message === 'USER_NOT_FOUND') {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: '사용자 문서를 찾을 수 없습니다.',
      });
    }

    if (error.message === 'USER_ALREADY_PROCESSED') {
      return res.status(409).json({
        code: 'USER_ALREADY_PROCESSED',
        message: '이미 처리된 사용자입니다.',
      });
    }

    logger.error('approve user error', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '승인 처리 중 오류가 발생했습니다.',
      detail: error.message || 'unknown error',
    });
  }
});

app.post('/api/admin/users/:uid/reject', async function (req, res) {
  try {
    const actor = await verifyAdminRequest(req, res);
    if (!actor) return;

    const targetUid = safeString(req.params.uid);
    const reason = safeString(req.body && req.body.reason);

    if (!targetUid) {
      return res.status(400).json({
        code: 'INVALID_UID',
        message: '유효한 uid가 필요합니다.',
      });
    }

    if (!reason) {
      return res.status(400).json({
        code: 'REJECT_REASON_REQUIRED',
        message: '반려 사유를 입력해주세요.',
      });
    }

    const userDocRef = firestore.collection('users').doc(targetUid);

    await firestore.runTransaction(async function (transaction) {
      const userSnap = await transaction.get(userDocRef);
      if (!userSnap.exists) {
        throw new Error('USER_NOT_FOUND');
      }

      const userData = userSnap.data() || {};
      const status = getUserStatus(userData);
      if (status !== 'pending') {
        throw new Error('USER_ALREADY_PROCESSED');
      }

      transaction.update(userDocRef, {
        status: 'rejected',
        approved: false,
        rejectedReason: reason,
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectedBy: actor.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const logDocRef = firestore.collection('admin_audit_logs').doc();
      transaction.set(logDocRef, {
        action: 'reject_user',
        targetUid,
        actorUid: actor.uid,
        actorRole: actor.role,
        reason,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return res.json({
      ok: true,
      uid: targetUid,
      status: 'rejected',
    });
  } catch (error) {
    if (error.message === 'USER_NOT_FOUND') {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: '사용자 문서를 찾을 수 없습니다.',
      });
    }

    if (error.message === 'USER_ALREADY_PROCESSED') {
      return res.status(409).json({
        code: 'USER_ALREADY_PROCESSED',
        message: '이미 처리된 사용자입니다.',
      });
    }

    logger.error('reject user error', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '반려 처리 중 오류가 발생했습니다.',
      detail: error.message || 'unknown error',
    });
  }
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

    const trackingHandler = TRACKING_HANDLER_MAP[normalizedCourier];
    if (!trackingHandler) {
      return res.status(500).json({
        code: 'COURIER_HANDLER_NOT_CONFIGURED',
        message: '택배사 핸들러가 서버에 설정되지 않았습니다.',
        receivedCourier: normalizedCourier,
      });
    }

    const results = await trackingHandler(normalizedNumbers);


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
