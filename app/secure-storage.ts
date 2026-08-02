const DATABASE_NAME = "milo-secure-storage";
const DATABASE_VERSION = 1;
const KEY_STORE = "keys";
const RECORD_STORE = "records";
const DEVICE_STORAGE_KEY = "device-storage-key-v1";
const AAD_PREFIX = "milo:secure-record:v1:";

export type EncryptedRecord = {
  version: 1;
  algorithm: "AES-GCM-256";
  iv: string;
  ciphertext: string;
  updatedAt: string;
};

export type EncryptedMessageEnvelope = {
  version: 1;
  algorithm: "ECDH-P256-AES-GCM";
  messageId: string;
  senderUsername: string;
  recipientUsername: string;
  ephemeralPublicKey: JsonWebKey;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

const REMOTE_AAD_PREFIX = "milo:remote-record:v1:";
const MESSAGE_AAD_PREFIX = "milo:message:v1:";
const IDENTITY_KEY_PREFIX = "identity-keypair:";

let databasePromise: Promise<IDBDatabase> | null = null;
let storageKeyPromise: Promise<CryptoKey> | null = null;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE);
      if (!database.objectStoreNames.contains(RECORD_STORE)) database.createObjectStore(RECORD_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open secure storage"));
  });
  return databasePromise;
}

async function readDeviceKey(): Promise<CryptoKey | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(KEY_STORE, "readonly");
  return requestResult(transaction.objectStore(KEY_STORE).get(DEVICE_STORAGE_KEY));
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  if (storageKeyPromise) return storageKeyPromise;
  storageKeyPromise = (async () => {
    const existing = await readDeviceKey();
    if (existing) return existing;

    const generated = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const database = await openDatabase();
    const transaction = database.transaction(KEY_STORE, "readwrite");
    const store = transaction.objectStore(KEY_STORE);
    try {
      store.add(generated, DEVICE_STORAGE_KEY);
      await transactionComplete(transaction);
      return generated;
    } catch {
      const winner = await readDeviceKey();
      if (!winner) throw new Error("Unable to persist device encryption key");
      return winner;
    }
  })();
  return storageKeyPromise;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function additionalData(recordName: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${AAD_PREFIX}${recordName}`);
}

function remoteKeyName(username: string): string {
  return `remote-vault:${username}`;
}

async function readRemoteKey(username: string): Promise<CryptoKey | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(KEY_STORE, "readonly");
  return requestResult(transaction.objectStore(KEY_STORE).get(remoteKeyName(username)));
}

async function readIdentityKeyPair(username: string): Promise<CryptoKeyPair | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(KEY_STORE, "readonly");
  return requestResult(transaction.objectStore(KEY_STORE).get(`${IDENTITY_KEY_PREFIX}${username}`));
}

async function getOrCreateIdentityKeyPair(username: string): Promise<CryptoKeyPair> {
  const existing = await readIdentityKeyPair(username);
  if (existing) return existing;
  const generated = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  ) as CryptoKeyPair;
  const database = await openDatabase();
  const transaction = database.transaction(KEY_STORE, "readwrite");
  transaction.objectStore(KEY_STORE).put(generated, `${IDENTITY_KEY_PREFIX}${username}`);
  await transactionComplete(transaction);
  return generated;
}

async function importIdentityPublicKey(publicKey: JsonWebKey): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    "jwk",
    publicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

function messageAdditionalData(senderUsername: string, recipientUsername: string, messageId: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${MESSAGE_AAD_PREFIX}${senderUsername}:${recipientUsername}:${messageId}`);
}

export function canUseDeviceEncryption(): boolean {
  return window.isSecureContext
    && Boolean(window.crypto?.subtle)
    && Boolean(window.indexedDB);
}

export async function hasRemoteVaultKey(username: string): Promise<boolean> {
  return Boolean(await readRemoteKey(username));
}

export async function unlockRemoteVault(username: string, password: string, salt: string, iterations: number): Promise<void> {
  const material = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await window.crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const database = await openDatabase();
  const transaction = database.transaction(KEY_STORE, "readwrite");
  transaction.objectStore(KEY_STORE).put(key, remoteKeyName(username));
  await transactionComplete(transaction);
}

export async function lockRemoteVault(username: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(KEY_STORE, "readwrite");
  transaction.objectStore(KEY_STORE).delete(remoteKeyName(username));
  await transactionComplete(transaction);
}

export async function getIdentityPublicKey(username: string): Promise<JsonWebKey> {
  const keyPair = await getOrCreateIdentityKeyPair(username);
  return window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
}

export async function encryptMessageEnvelope(
  senderUsername: string,
  recipientUsername: string,
  messageId: string,
  payload: unknown,
  recipientPublicKey: JsonWebKey,
): Promise<EncryptedMessageEnvelope> {
  const ephemeralKeyPair = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  ) as CryptoKeyPair;
  const recipientKey = await importIdentityPublicKey(recipientPublicKey);
  const key = await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: recipientKey },
    ephemeralKeyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: messageAdditionalData(senderUsername, recipientUsername, messageId), tagLength: 128 },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    version: 1,
    algorithm: "ECDH-P256-AES-GCM",
    messageId,
    senderUsername,
    recipientUsername,
    ephemeralPublicKey: await window.crypto.subtle.exportKey("jwk", ephemeralKeyPair.publicKey),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };
}

export async function decryptMessageEnvelope<T>(recipientUsername: string, envelope: EncryptedMessageEnvelope): Promise<T> {
  if (envelope.recipientUsername !== recipientUsername) throw new Error("Message recipient mismatch");
  const keyPair = await getOrCreateIdentityKeyPair(recipientUsername);
  const senderEphemeralKey = await importIdentityPublicKey(envelope.ephemeralPublicKey);
  const key = await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: senderEphemeralKey },
    keyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plaintext = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv), additionalData: messageAdditionalData(envelope.senderUsername, envelope.recipientUsername, envelope.messageId), tagLength: 128 },
    key,
    base64ToBytes(envelope.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

function remoteAdditionalData(username: string, recordName: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${REMOTE_AAD_PREFIX}${username}:${recordName}`);
}

export async function encryptRemoteRecord<T>(username: string, recordName: string, value: T): Promise<EncryptedRecord> {
  const key = await readRemoteKey(username);
  if (!key) throw new Error("Remote vault is locked");
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: remoteAdditionalData(username, recordName), tagLength: 128 },
    key,
    plaintext,
  );
  return {
    version: 1,
    algorithm: "AES-GCM-256",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    updatedAt: new Date().toISOString(),
  };
}

export async function decryptRemoteRecord<T>(username: string, recordName: string, record: EncryptedRecord): Promise<T> {
  const key = await readRemoteKey(username);
  if (!key) throw new Error("Remote vault is locked");
  const plaintext = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(record.iv),
      additionalData: remoteAdditionalData(username, recordName),
      tagLength: 128,
    },
    key,
    base64ToBytes(record.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export async function saveEncryptedRecord<T>(recordName: string, value: T): Promise<void> {
  const key = await getOrCreateDeviceKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(recordName), tagLength: 128 },
    key,
    plaintext,
  );
  const record: EncryptedRecord = {
    version: 1,
    algorithm: "AES-GCM-256",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    updatedAt: new Date().toISOString(),
  };
  const database = await openDatabase();
  const transaction = database.transaction(RECORD_STORE, "readwrite");
  transaction.objectStore(RECORD_STORE).put(record, recordName);
  await transactionComplete(transaction);
}

export async function loadEncryptedRecord<T>(recordName: string): Promise<T | null> {
  const database = await openDatabase();
  const transaction = database.transaction(RECORD_STORE, "readonly");
  const record = await requestResult<EncryptedRecord | undefined>(transaction.objectStore(RECORD_STORE).get(recordName));
  if (!record) return null;
  if (record.version !== 1 || record.algorithm !== "AES-GCM-256") throw new Error("Unsupported encrypted record format");
  const key = await getOrCreateDeviceKey();
  const plaintext = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(record.iv),
      additionalData: additionalData(recordName),
      tagLength: 128,
    },
    key,
    base64ToBytes(record.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export async function hasEncryptedRecord(recordName: string): Promise<boolean> {
  const database = await openDatabase();
  const transaction = database.transaction(RECORD_STORE, "readonly");
  return Boolean(await requestResult(transaction.objectStore(RECORD_STORE).getKey(recordName)));
}
