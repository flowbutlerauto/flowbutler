const {onCall, onRequest, HttpsError} = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const {createHmac} = require('crypto');

const {getCjTrackingResults} = require('./cj-tracking');
const {getLotteTrackingResults} = require('./lotte-tracking');
const {getDoobalHeroTrackingResults} = require('./doobalhero-tracking');
const {getEpostTrackingResults} = require('./epost-tracking');

admin.initializeApp();

const app = express();
const firestore = admin.firestore();
// Callable functions must accept the browser request at the Cloud Run layer.
// Each handler still verifies Firebase Authentication before reading or writing data.
const CUSTOMER_KEY_CALLABLE_OPTIONS = Object.freeze({
  region: 'asia-northeast3',
  timeoutSeconds: 30,
  invoker: 'public',
});

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

function normalizeCustomerPhone(value) {
  const digits = safeString(value).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('0082') && digits.length > 4) {
    return `0${digits.slice(4)}`;
  }

  if (digits.startsWith('82') && digits.length > 2) {
    return `0${digits.slice(2)}`;
  }

  return digits;
}

function getCustomerKeySecretRef(userId) {
  return firestore
      .collection('users')
      .doc(userId)
      .collection('private')
      .doc('customerKey');
}

function isValidCustomerKeySecret(secret) {
  return /^[A-Za-z0-9\uAC00-\uD7A3]{6,}$/.test(secret);
}

function buildCustomerKeySettings(secret) {
  const normalizedSecret = safeString(secret);
  return {
    configured: Boolean(normalizedSecret),
    version: normalizedSecret ? 'server-hmac-v1' : '',
    secretLength: normalizedSecret ? [...normalizedSecret].length : 0,
  };
}

async function findRegisteredCustomerKeySecret(userId) {
  const secretSnap = await getCustomerKeySecretRef(userId).get();
  const data = secretSnap.data() || {};
  const secret = safeString(data.secret);
  return data.source === 'user-provided-v1' ? secret : '';
}

async function getRegisteredCustomerKeySecret(userId) {
  const secret = await findRegisteredCustomerKeySecret(userId);

  if (!secret) {
    throw new HttpsError(
        'failed-precondition',
        '\uACE0\uAC1D\uD0A4\uB97C \uB4F1\uB85D\uD55C \uD6C4 \uBC1C\uC8FC\uC11C\uB97C \uC5C5\uB85C\uB4DC\uD574\uC8FC\uC138\uC694.',
    );
  }

  return secret;
}

function requireRecentReauthentication(request) {
  const authTime = Number(request.auth?.token?.auth_time || 0) * 1000;
  const fiveMinutes = 5 * 60 * 1000;
  if (!authTime || Date.now() - authTime > fiveMinutes) {
    throw new HttpsError(
        'failed-precondition',
        '\uBCF4\uC548\uC744 \uC704\uD574 \uACC4\uC815 \uBE44\uBC00\uBC88\uD638\uB97C \uB2E4\uC2DC \uD655\uC778\uD574\uC8FC\uC138\uC694.',
    );
  }
}

function createCustomerKey(secret, phoneValue) {
  const phone = normalizeCustomerPhone(phoneValue);
  if (!phone) return '';

  const signature = createHmac('sha256', secret)
      .update(phone, 'utf8')
      .digest('hex');
  return `v1_${signature}`;
}

exports.registerCustomerKey = onCall(
    CUSTOMER_KEY_CALLABLE_OPTIONS,
    async function(request) {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', '\uB85C\uADF8\uC778 \uD6C4 \uACE0\uAC1D\uD0A4\uB97C \uB4F1\uB85D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.');
      }

      const secret = safeString(request.data?.secret);
      if (!isValidCustomerKeySecret(secret)) {
        throw new HttpsError('invalid-argument', '\uACE0\uAC1D\uD0A4\uB294 \uC601\uBB38, \uD55C\uAE00, \uC22B\uC790\uB9CC \uC0AC\uC6A9\uD558\uBA70 6\uC790 \uC774\uC0C1\uC73C\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.');
      }

      const secretRef = getCustomerKeySecretRef(request.auth.uid);
      await secretRef.set({
        version: 'server-hmac-v1',
        source: 'user-provided-v1',
        secret,
        secretLength: [...secret].length,
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      return {settings: buildCustomerKeySettings(secret)};
    },
);

exports.getCustomerKeySettings = onCall(
    CUSTOMER_KEY_CALLABLE_OPTIONS,
    async function(request) {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', '\uB85C\uADF8\uC778 \uD6C4 \uACE0\uAC1D\uD0A4 \uC124\uC815\uC744 \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.');
      }

      const secretSnap = await getCustomerKeySecretRef(request.auth.uid).get();
      const data = secretSnap.data() || {};
      const secret = data.source === 'user-provided-v1' ? safeString(data.secret) : '';
      return {settings: buildCustomerKeySettings(secret)};
    },
);

exports.revealCustomerKeyPrefix = onCall(
    CUSTOMER_KEY_CALLABLE_OPTIONS,
    async function(request) {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', '\uB85C\uADF8\uC778 \uD6C4 \uACE0\uAC1D\uD0A4\uB97C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.');
      }

      requireRecentReauthentication(request);
      const secret = await getRegisteredCustomerKeySecret(request.auth.uid);
      return {
        displayPrefix: [...secret].slice(0, 2).join(''),
        secretLength: [...secret].length,
      };
    },
);

exports.generateCustomerKeys = onCall(
    CUSTOMER_KEY_CALLABLE_OPTIONS,
    async function(request) {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', '\uB85C\uADF8\uC778 \uD6C4 \uACE0\uAC1D \uC2DD\uBCC4\uD0A4\uB97C \uC0DD\uC131\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.');
      }

      const phoneValues = request.data?.phoneValues;
      if (!Array.isArray(phoneValues)) {
        throw new HttpsError('invalid-argument', '\uC804\uD654\uBC88\uD638 \uBAA9\uB85D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.');
      }
      if (phoneValues.length > 2000) {
        throw new HttpsError('invalid-argument', '\uD55C \uBC88\uC5D0 \uCD5C\uB300 2,000\uAC1C\uC758 \uC804\uD654\uBC88\uD638\uB9CC \uCC98\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.');
      }

      const secret = await findRegisteredCustomerKeySecret(request.auth.uid);
      if (!secret) {
        return {
          keys: phoneValues.map(function() {
            return '';
          }),
          version: '',
          encrypted: false,
        };
      }

      return {
        keys: phoneValues.map(function(phoneValue) {
          return createCustomerKey(secret, phoneValue);
        }),
        version: 'server-hmac-v1',
        encrypted: true,
      };
    },
);
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

async function enqueueStatusEmail(type, userEmail, payload) {
  const email = safeString(userEmail);
  if (!email) return;

  const subjectByType = {
    approved: '[FlowButler] 가입 승인 완료 안내',
    rejected: '[FlowButler] 가입 반려 안내',
    deleted: '[FlowButler] 계정 삭제 안내',
  };

  const linesByType = {
    approved: [
      '안녕하세요.',
      'FlowButler 가입 요청이 승인되었습니다.',
      '이제 로그인 후 서비스를 이용하실 수 있습니다.',
    ],
    rejected: [
      '안녕하세요.',
      'FlowButler 가입 요청이 반려되었습니다.',
      `사유: ${safeString(payload.reason) || '사유 없음'}`,
      '문제가 해결되면 관리자에게 재승인을 요청해 주세요.',
    ],
    deleted: [
      '안녕하세요.',
      'FlowButler 계정이 관리자에 의해 삭제되었습니다.',
      `사유: ${safeString(payload.reason) || '사유 없음'}`,
      '필요 시 다시 회원가입을 진행해 주세요.',
    ],
  };

  const subject = subjectByType[type] || '[FlowButler] 계정 상태 안내';
  const bodyLines = linesByType[type] || ['계정 상태가 변경되었습니다.'];

  await firestore.collection('mail').add({
    to: [email],
    message: {
      subject,
      text: bodyLines.join('\n'),
    },
    meta: {
      kind: 'user_status_notification',
      type,
      ...payload,
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

function mapUserDocToItem(docSnap) {
  const data = docSnap.data() || {};
  return {
    uid: docSnap.id,
    email: safeString(data.email),
    plan: safeString(data.plan) || 'free',
    role: safeString(data.role) || 'user',
    status: getUserStatus(data),
    createdAt: data.createdAt || null,
    paidUntil: data.paidUntil || null,
  };
}

function filterUsersByQuery(users, query) {
  const normalizedQuery = safeString(query).toLowerCase();
  if (!normalizedQuery) {
    return users;
  }

  return users.filter(function (user) {
    return safeString(user.email).toLowerCase().includes(normalizedQuery);
  });
}

function toPositiveGrantDays(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.floor(parsed);
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
    const query = safeString(req.query && req.query.q);

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

    const users = filterUsersByQuery(
        Array.from(userMap.values())
            .map(mapUserDocToItem)
            .filter(function (user) {
              return user.status === 'pending';
            })
            .sort(function (a, b) {
              const aMillis = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : 0;
              const bMillis = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : 0;
              return bMillis - aMillis;
            })
            .slice(0, 200),
        query,
    );

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

app.get('/api/admin/users', async function (req, res) {
  try {
    const actor = await verifyAdminRequest(req, res);
    if (!actor) return;

    const scope = safeString(req.query && req.query.scope).toLowerCase() || 'all';
    const query = safeString(req.query && req.query.q);
    const usersCollection = firestore.collection('users');

    let users = [];

    if (scope === 'pending') {
      const pendingSnapshot = await usersCollection.where('status', '==', 'pending').limit(600).get();
      users = pendingSnapshot.docs.map(mapUserDocToItem).filter(function (user) {
        return user.status === 'pending';
      });
    } else {
      const allSnapshot = await usersCollection.limit(1200).get();
      users = allSnapshot.docs.map(mapUserDocToItem);
    }

    users = filterUsersByQuery(users, query)
        .sort(function (a, b) {
          const aMillis = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : 0;
          const bMillis = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : 0;
          return bMillis - aMillis;
        })
        .slice(0, 300);

    res.json({
      requestedBy: actor.uid,
      scope,
      count: users.length,
      users,
    });
  } catch (error) {
    logger.error('get users error', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '계정 목록 조회 중 오류가 발생했습니다.',
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
    const userSnap = await userDocRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: '사용자 문서를 찾을 수 없습니다.',
      });
    }

    const userData = userSnap.data() || {};
    const userEmail = safeString(userData.email);

    await firestore.runTransaction(async function (transaction) {
      const txUserSnap = await transaction.get(userDocRef);
      const txUserData = txUserSnap.data() || {};
      const status = getUserStatus(txUserData);

      if (status !== 'pending' && status !== 'rejected') {
        throw new Error('USER_ALREADY_PROCESSED');
      }

      transaction.update(userDocRef, {
        status: 'approved',
        approved: true,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: actor.uid,
        rejectedAt: admin.firestore.FieldValue.delete(),
        rejectedBy: admin.firestore.FieldValue.delete(),
        rejectedReason: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const logDocRef = firestore.collection('admin_audit_logs').doc();
      transaction.set(logDocRef, {
        action: 'approve_user',
        targetUid,
        actorUid: actor.uid,
        actorRole: actor.role,
        fromStatus: status,
        toStatus: 'approved',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await enqueueStatusEmail('approved', userEmail, {
      uid: targetUid,
      actorUid: actor.uid,
      actorRole: actor.role,
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
    const userSnap = await userDocRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: '사용자 문서를 찾을 수 없습니다.',
      });
    }

    const userData = userSnap.data() || {};
    const userEmail = safeString(userData.email);

    await firestore.runTransaction(async function (transaction) {
      const txUserSnap = await transaction.get(userDocRef);
      const txUserData = txUserSnap.data() || {};
      const status = getUserStatus(txUserData);
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
        fromStatus: status,
        toStatus: 'rejected',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await enqueueStatusEmail('rejected', userEmail, {
      uid: targetUid,
      actorUid: actor.uid,
      actorRole: actor.role,
      reason,
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


app.post('/api/admin/users/:uid/grant-paid', async function (req, res) {
  try {
    const actor = await verifyAdminRequest(req, res);
    if (!actor) return;

    const targetUid = safeString(req.params.uid);
    const reason = safeString(req.body && req.body.reason);
    const days = toPositiveGrantDays(req.body && req.body.days);

    if (!targetUid) {
      return res.status(400).json({
        code: 'INVALID_UID',
        message: '유효한 uid가 필요합니다.',
      });
    }

    if (days <= 0) {
      return res.status(400).json({
        code: 'INVALID_GRANT_DAYS',
        message: '부여 일수는 1일 이상이어야 합니다.',
      });
    }

    const userDocRef = firestore.collection('users').doc(targetUid);
    const userSnap = await userDocRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: '사용자 문서를 찾을 수 없습니다.',
      });
    }

    let nextPaidUntilDate = null;
    let fromPaidUntilDate = null;

    await firestore.runTransaction(async function (transaction) {
      const txUserSnap = await transaction.get(userDocRef);
      if (!txUserSnap.exists) {
        throw new Error('USER_NOT_FOUND');
      }

      const txUserData = txUserSnap.data() || {};
      const currentPaidUntil = txUserData.paidUntil;
      const nowDate = new Date();

      let baseDate = nowDate;
      if (currentPaidUntil && typeof currentPaidUntil.toDate === 'function') {
        const currentDate = currentPaidUntil.toDate();
        fromPaidUntilDate = currentDate;
        if (currentDate.getTime() > nowDate.getTime()) {
          baseDate = currentDate;
        }
      }

      nextPaidUntilDate = new Date(baseDate.getTime() + (days * 24 * 60 * 60 * 1000));

      transaction.update(userDocRef, {
        plan: 'paid',
        paidUntil: admin.firestore.Timestamp.fromDate(nextPaidUntilDate),
        billingSource: 'admin_grant',
        paidGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
        paidGrantedBy: actor.uid,
        paidGrantReason: reason || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const logDocRef = firestore.collection('admin_audit_logs').doc();
      transaction.set(logDocRef, {
        action: 'grant_paid_plan',
        targetUid,
        actorUid: actor.uid,
        actorRole: actor.role,
        reason,
        grantDays: days,
        fromPaidUntil: currentPaidUntil || null,
        toPaidUntil: admin.firestore.Timestamp.fromDate(nextPaidUntilDate),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return res.json({
      ok: true,
      uid: targetUid,
      grantDays: days,
      fromPaidUntil: fromPaidUntilDate ? fromPaidUntilDate.toISOString() : null,
      paidUntil: nextPaidUntilDate ? nextPaidUntilDate.toISOString() : null,
      plan: 'paid',
    });
  } catch (error) {
    if (error.message === 'USER_NOT_FOUND') {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: '사용자 문서를 찾을 수 없습니다.',
      });
    }

    logger.error('grant paid plan error', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '유료권 부여 처리 중 오류가 발생했습니다.',
      detail: error.message || 'unknown error',
    });
  }
});


app.post('/api/admin/users/:uid/delete', async function (req, res) {
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

    const userDocRef = firestore.collection('users').doc(targetUid);
    const userSnap = await userDocRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: '사용자 문서를 찾을 수 없습니다.',
      });
    }

    const userData = userSnap.data() || {};
    const userEmail = safeString(userData.email);
    const fromStatus = getUserStatus(userData);

    await firestore.runTransaction(async function (transaction) {
      const txUserSnap = await transaction.get(userDocRef);
      if (!txUserSnap.exists) {
        throw new Error('USER_NOT_FOUND');
      }

      transaction.delete(userDocRef);

      const logDocRef = firestore.collection('admin_audit_logs').doc();
      transaction.set(logDocRef, {
        action: 'delete_user',
        targetUid,
        targetEmail: userEmail,
        actorUid: actor.uid,
        actorRole: actor.role,
        reason,
        fromStatus,
        toStatus: 'deleted',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    try {
      await admin.auth().deleteUser(targetUid);
    } catch (error) {
      if (error && error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    await enqueueStatusEmail('deleted', userEmail, {
      uid: targetUid,
      actorUid: actor.uid,
      actorRole: actor.role,
      reason,
    });

    return res.json({
      ok: true,
      uid: targetUid,
      status: 'deleted',
    });
  } catch (error) {
    if (error.message === 'USER_NOT_FOUND') {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: '사용자 문서를 찾을 수 없습니다.',
      });
    }

    logger.error('delete user error', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '계정 삭제 처리 중 오류가 발생했습니다.',
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
