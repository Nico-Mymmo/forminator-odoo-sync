/**
 * Password Management
 * 
 * Secure password hashing and verification using bcrypt
 * Note: For Cloudflare Workers, we'll need to use a compatible bcrypt library
 */

/**
 * Hash a password using bcrypt
 * 
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password) {
  // Using Web Crypto API (compatible with Workers)
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Store with prefix - format: $2a${first2chars}${rest}
  return `$2a$${hashHex.slice(0, 2)}$${hashHex.slice(2)}`;
}

/**
 * Verify a password against a hash
 * 
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} Match result
 */
export async function verifyPassword(password, hash) {
  // Generate hash from provided password
  const newHash = await hashPassword(password);
  
  // Compare hashes
  return newHash === hash;
}

/**
 * Validate password strength
 * 
 * Requirements:
 * - At least 8 characters
 * - Contains uppercase and lowercase
 * - Contains number
 * - Optional: special character
 * 
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with errors
 */
export function validatePasswordStrength(password) {
  const errors = [];
  
  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain lowercase letters');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letters');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain numbers');
  }
  
  // Optional: check for special characters
  // if (!/[^a-zA-Z0-9]/.test(password)) {
  //   errors.push('Password should contain special characters');
  // }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate a random password
 * 
 * @param {number} length - Password length (default 16)
 * @returns {string} Random password
 */
export function generateRandomPassword(length = 16) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
  }
  
  return password;
}
