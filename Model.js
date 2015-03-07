var db = require('db'),
 	q = require('q'), 
 	lodash = require('lodash')
; 

// var fs = require('fs'), 
// _ = require('lodash')
// Model = require('Model')
// ; 

// db.query('select * from Template').
// 	then(function(data) {

// 		console.log(data); 
// 		process.exit(0); 

// 	})
// ; 

// var newTemplate = Model.create('Template'); 
// newTemplate.set({ TemplateData: 'foo'});
// newTemplate.save()
// 	.then(
// 		function(data){
// 			console.log('success!'); 
// 			console.log(data); 
// 			process.exit(0); 
// 		}, 
// 		function(rejection) {
// 			console.log('Rejection', rejection); 
// 		}
// 	)
// ;

// var Template = Model.create('Template'); 
// Template.fromKey(2)
// 	.then(function() {
// 		console.log('Template #2', Template.get('TemplateData')); 
// 	}, 
// 	function(err) {
// 		console.log(err); 
// 	})
// ;

// var Template3 = Model.create('Template'); 
// Template3.fromKey(3)
// 	.then(function() {
// 		console.log('This should not be called.'); 
// 		console.log('Template #3', Template3.get('TemplateData'));

// 		Template3.set('TemplateData', 'Some new data for template 3'); 
// 		Template3.save(); 

// 		Template3.remove(); 

// 	}, 
// 	function(err, result, query) {

// 		console.log('Error', err, result, query); 
// 	}
// );

// Insertion
// db.insert('Template', {
// 	TemplateData: "Test test"
// });

// var sql = db.createModelSQL(modelObj); 

// var modelObj = db.createModelStrict('PageDesigner', 'Template', 
// 	[
// 		{
// 			name: "ShortDescr", 
// 			type: "VARCHAR", 
// 			typeString: "VARCHAR(32)", 
// 		}
// 	]
// );

// var modelSQL = db.createModelSQL(modelObj); 

// console.log(modelSQL); 

// process.exit(0); 

// db.modelToJSON('PageDesigner', 'Template')
// 	.then(function(modelObj) {
// 		// fs.writeFile('schema/')
// 		console.log(modelObj); 

// 		var sql = db.createModelSQL(modelObj); 
// 		console.log('Showing sql'); 
// 		console.log(sql); 
// 	})

// ;



var Model = function(tableName, keyName, keyVal){

	this.tableName = tableName; 
	this.keyName = keyName; 
	this.keyVal = typeof(keyVal) === 'undefined' ? null : keyVal; 
	this._data = {}; 
	this._isFetched = false; 
	this._changed = {}; 
	this._changedCount = 0; 

}; 

Model.select = function(tableName, whereObj) {

	return db.select(tableName, whereObj); 

};

Model.fetch = function(tableName, keyVal) {

	// @todo Strictly adheres to [modelName] + Id -- will break
	var model = new Model(tableName, tableName + 'Id', keyVal); 
	
	model.fromKey(keyVal); 

	return model; 
};

Model.create = function(tableName) {

	return new Model(tableName, tableName + 'Id'); 

};

Model.prototype.fromKey = function(keyVal) {

	var self 	= 	this, 
		params 	= 	{}
	;

	this._data[this.keyName] = keyVal; 
	params[this.keyName] = keyVal; 

	return db.select(this.tableName, params)

		.then(
			function(data) {
				self._data = data[0]; 
				self._isFetched = true; 
				return data[0]; 
			}, 
			function(err, data, queryStmt) {

				console.log(arguments); 

				throw new Error(err, data, queryStmt); 
			}
		)
	;
};

Model.prototype.save = function() {

	var self = this; 

	// [0, undefined, null].indexOf(this.keyName) > -1

	if(!this._changedCount) {
		var deferred = q.defer(); 
		deferred.reject('No changed fields.'); 
		return deferred.promise;
	}

	console.log('Saving'); 

	if(!this._isFetched) {
		
		console.log(this._changed); 

		return db.insert(
			this.tableName, 
			this._changed
		).then(function(result) {

			self._changedCount = 0; 
			self._data = self._changed; 
			self._data[self.keyName] = result.insertId; 
			self._changed = {}; 
			return self._data; 

		}, function(rejection) {
			console.log("Model error: ", rejection); 
		});

	} else {

		var params = {}; 
	
		params[this.keyName] = this._data[this.keyName]; 

		return db.update(
		
			this.tableName, 
			this._changed, 
			params
		
		).then(function(data) {

			_.merge(this._data, this._changed); 

			return this._data; 

		});

	}

};

// myModel.set({ foo: 'bar', baz: 'quux' }); 

Model.prototype.set = function(fieldName, value) {

	if(typeof fieldName === 'object') {

		var fieldNames = Object.keys(fieldName),
			i 	= 0; 

		var len = fieldNames.length; 

		do {
			this.set(fieldNames[i], fieldName[fieldNames[i]]); 
			i++; 
		} while(i < len); 

	} else {

		if(typeof this._changed[fieldName] === 'undefined') {
			this._changedCount++; 
		}

		this._changed[fieldName] = value; 

	}

};

Model.prototype.get = function(fieldName) {

	if(typeof this._data[fieldName] === 'undefined') {
		return null; 
	}

	return this._data[fieldName]; 

};

Model.prototype.remove = function() {

	if(!this._isFetched) {
		return false; 
	}

	var params = {}; 
	params[this.keyName] = this._data[this.keyName]; 
	db.remove(this.tableName, params); 

};


 module.exports = Model; 