const Sqids = require('sqids').default;

const sqids = new Sqids({ 
      minLength: 6, 
      alphabet: 'hPrUuF3oQfeEGwRZX1d9ac5MB0AkgLqlynOpTVzCWJtDjsN8I7i42xvHSK6Ymb' 
    });

const sqid = sqids.encode([5]);
console.log(sqid); // Should output the encoded SQID for scoreboard id 5