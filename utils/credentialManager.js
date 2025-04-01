const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class CredentialManager {
    constructor(encryptionKey) {
        if (!encryptionKey || typeof encryptionKey !== 'string') {
            throw new Error('Encryption key is required');
        }
        this.algorithm = 'aes-256-gcm';
        this.key = Buffer.from(encryptionKey, 'hex');
    }

    // Encrypt student credentials for storage
    async encryptCredentials(credentials) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
        
        const encrypted = Buffer.concat([
            cipher.update(JSON.stringify(credentials), 'utf8'),
            cipher.final()
        ]);

        const authTag = cipher.getAuthTag();

        return {
            iv: iv.toString('hex'),
            encryptedData: encrypted.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    // Decrypt student credentials
    async decryptCredentials(encryptedData) {
        try {
            const decipher = crypto.createDecipheriv(
                this.algorithm,
                this.key,
                Buffer.from(encryptedData.iv, 'hex')
            );

            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

            const decrypted = Buffer.concat([
                decipher.update(Buffer.from(encryptedData.encryptedData, 'hex')),
                decipher.final()
            ]);

            return JSON.parse(decrypted.toString('utf8'));
        } catch (error) {
            console.error('Decryption failed:', error);
            return null;
        }
    }

    // Hash password for storage
    async hashPassword(password) {
        return await bcrypt.hash(password, 10);
    }

    // Verify password
    async verifyPassword(password, hashedPassword) {
        return await bcrypt.compare(password, hashedPassword);
    }

    // Generate a secure random password
    generateSecurePassword() {
        const length = 12;
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';
        for (let i = 0; i < length; i++) {
            const randomIndex = crypto.randomInt(0, charset.length);
            password += charset[randomIndex];
        }
        return password;
    }
}

module.exports = CredentialManager; 