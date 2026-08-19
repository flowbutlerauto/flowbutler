const CUSTOMER_KEY_RE = /^v1_[0-9a-f]{64}$/i;
const CUSTOMER_KEY_VERIFIER_MESSAGE = "flowbutler-customer-key-verifier-v1";

function safeString(value) {
    return String(value ?? "").trim();
}
function getCryptoSubtle() {
    const cryptoApi = globalThis.crypto || globalThis.window?.crypto;
    if (!cryptoApi?.subtle) {
        throw new Error("브라우저 암호화 기능을 사용할 수 없습니다.");
    }
    return cryptoApi.subtle;
}

function toHex(arrayBuffer) {
    return [...new Uint8Array(arrayBuffer)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export function isCustomerKey(value) {
    return CUSTOMER_KEY_RE.test(safeString(value));
}

export function normalizeCustomerPhone(value) {
    const digits = safeString(value).replace(/\D/g, "");
    if (!digits) return "";

    if (digits.startsWith("0082") && digits.length > 4) {
        return `0${digits.slice(4)}`;
    }

    if (digits.startsWith("82") && digits.length > 2) {
        return `0${digits.slice(2)}`;
    }

    return digits;
}

export async function createHmacSha256Signer(secret) {
    const secretText = safeString(secret);
    if (!secretText) throw new Error("고객정보 암호키가 비어 있습니다.");

    const subtle = getCryptoSubtle();
    const encoder = new TextEncoder();
    const key = await subtle.importKey(
        "raw",
        encoder.encode(secretText),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );

    return async (message) => {
        const signature = await subtle.sign("HMAC", key, encoder.encode(safeString(message)));
        return toHex(signature);
    };
}

export async function createCustomerKeyVerifier(secret) {
    const signHex = await createHmacSha256Signer(secret);
    return `v1_${await signHex(CUSTOMER_KEY_VERIFIER_MESSAGE)}`;
}

export async function createCustomerKeyGenerator(secret) {
    const signHex = await createHmacSha256Signer(secret);

    return async (phoneValue) => {
        const rawValue = safeString(phoneValue);
        if (isCustomerKey(rawValue)) return rawValue.toLowerCase();

        const phoneDigits = normalizeCustomerPhone(rawValue);
        if (!phoneDigits) return "";

        return `v1_${await signHex(phoneDigits)}`;
    };
}
