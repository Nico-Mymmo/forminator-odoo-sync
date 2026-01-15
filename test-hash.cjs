const crypto = require('crypto');
const password = 'PLN1ry5!hKadnlk*';
const hash = crypto.createHash('sha256').update(password).digest('hex');
const computed = `$2a$${hash.slice(0,2)}$${hash.slice(2)}`;
const expected = '$2a20$ad39e5167860dd488590a844e29696062f9430fdb44fecdebb71ee14da0e3a';

console.log('Computed:', computed);
console.log('Expected:', expected);
console.log('Match:', computed === expected);
