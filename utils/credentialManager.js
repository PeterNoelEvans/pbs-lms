const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class CredentialManager {
    /**
     * Initialize the credential manager with an encryption key
     * @param {string} encryptionKey - 32-byte hex string for encryption
     */
    constructor(encryptionKey) {
        if (!encryptionKey) {
            console.warn('Warning: No encryption key provided, using default key for development');
            this.encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        } else {
            this.encryptionKey = encryptionKey;
        }
        
        // Convert hex string to Buffer
        this.key = Buffer.from(this.encryptionKey, 'hex');
        
        // Validate key length for AES-256
        if (this.key.length !== 32) {
            throw new Error('Invalid encryption key length. Must be 32 bytes (64 hex characters)');
        }
    }

    /**
     * Encrypt student credentials
     * @param {Object} credentials - Student credentials object
     * @returns {Object} - Encrypted credentials with IV and auth tag
     */
    encryptCredentials(credentials) {
        // Generate a random initialization vector (IV)
        const iv = crypto.randomBytes(16);
        
        // Create cipher with AES-256-GCM algorithm
        const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
        
        // Encrypt credentials
        const credentialsStr = JSON.stringify(credentials);
        const encryptedData = Buffer.concat([
            cipher.update(credentialsStr, 'utf8'),
            cipher.final()
        ]);
        
        // Get authentication tag
        const authTag = cipher.getAuthTag();
        
        // Return encrypted data with IV and auth tag as hex strings
        return {
            iv: iv.toString('hex'),
            encryptedData: encryptedData.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    /**
     * Decrypt student credentials
     * @param {Object} encryptedCredentials - Encrypted credentials with IV and auth tag
     * @returns {Object} - Decrypted credentials object
     */
    decryptCredentials(encryptedCredentials) {
        try {
            // Extract encrypted data, IV, and auth tag
            const iv = Buffer.from(encryptedCredentials.iv, 'hex');
            const encryptedData = Buffer.from(encryptedCredentials.encryptedData, 'hex');
            const authTag = Buffer.from(encryptedCredentials.authTag, 'hex');
            
            // Create decipher
            const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
            decipher.setAuthTag(authTag);
            
            // Decrypt the data
            const decrypted = Buffer.concat([
                decipher.update(encryptedData),
                decipher.final()
            ]);
            
            // Parse and return the decrypted credentials
            return JSON.parse(decrypted.toString('utf8'));
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Hash a password using bcrypt
     * @param {string} password - Plain text password
     * @returns {Promise<string>} - Hashed password
     */
    async hashPassword(password) {
        const saltRounds = 10;
        return bcrypt.hash(password, saltRounds);
    }

    /**
     * Verify a password against a hash
     * @param {string} password - Plain text password to verify
     * @param {string} hash - Hashed password
     * @returns {Promise<boolean>} - True if password matches
     */
    async verifyPassword(password, hash) {
        return bcrypt.compare(password, hash);
    }

    /**
     * Generate a secure random password
     * @param {number} length - Length of the password
     * @returns {string} - Secure random password
     */
    generateSecurePassword(length = 12) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+';
        let password = '';
        const randomBytes = crypto.randomBytes(length);
        
        for (let i = 0; i < length; i++) {
            const randomIndex = randomBytes[i] % chars.length;
            password += chars.charAt(randomIndex);
        }
        
        return password;
    }
}

module.exports = CredentialManager; 