// test 
var DB = require('./db'); 

var db = new DB({
	host: 'localhost', 
	user: 'testUser', 
	password: '1234', 
	database: 'testDb'
});

db.select('testTable')
	.then(
		function(data) {
			console.log('Got some data!'); 
			console.log(data); 
		}
	)
	.fail(
		function(err) {
			console.log('There was an error', err); 
		}
	)
;


