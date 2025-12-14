import crypto from 'crypto';
import logger from './logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

/**
 * Encrypts text using AES-256-GCM
 */
export function encrypt(text: string): string {
    const masterKey = process.env.SESSION_ENCRYPTION_KEY;
    if (!masterKey) {
        throw new Error('SESSION_ENCRYPTION_KEY is not defined');
    }

    try {
        // Generate a random IV
        const iv = crypto.randomBytes(IV_LENGTH);

        // Create salt for key derivation
        const salt = crypto.randomBytes(SALT_LENGTH);

        // Derive key using scrypt
        const key = crypto.scryptSync(masterKey, salt, 32);

        // Create cipher
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        // Encrypt
        const encrypted = Buffer.concat([
            cipher.update(text, 'utf8'),
            cipher.final()
        ]);

        // Get auth tag
        const tag = cipher.getAuthTag();

        // Return as info-packed string: salt:iv:tag:content
        return [
            salt.toString('hex'),
            iv.toString('hex'),
            tag.toString('hex'),
            encrypted.toString('hex')
        ].join(':');

    } catch (error) {
        logger.error({ error }, 'Encryption failed');
        throw new Error('Encryption failed');
    }
}

/**
 * Decrypts text using AES-256-GCM
 */
export function decrypt(encryptedText: string): string {
    const masterKey = process.env.SESSION_ENCRYPTION_KEY;
    if (!masterKey) {
        throw new Error('SESSION_ENCRYPTION_KEY is not defined');
    }

    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 4) {
            throw new Error('Invalid encrypted format');
        }

        const [saltHex, ivHex, tagHex, contentHex] = parts;

        const salt = Buffer.from(saltHex, 'hex');
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const content = Buffer.from(contentHex, 'hex');

        // Derive key
        const key = crypto.scryptSync(masterKey, salt, 32);

        // Create decipher
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        // Decrypt
        const decrypted = Buffer.concat([
            decipher.update(content),
            decipher.final()
        ]);

        return decrypted.toString('utf8');

    } catch (error) {
        logger.error({ error }, 'Decryption failed');
        throw new Error('Decryption failed');
    }
}
