/**
 * Database Persistence Layer
 * <example>
 * var db = new DB({
    host: 'localhost',
    user: 'root',
    password: 'nskhpxy9!',
    database: 'Enterprise',
    multipleStatements: true,
    connectionRetryTimeout: 5000,
    allowedFailedConnectionAttempts: 10
 });
 * var room = db.query('select * from Room where IsDeleted = 0')
 *     .then(function(data) {
 *         console.log(data);
 *     })
 * ;
 * </example>
 */ 
var mysql = require('mysql'),
    _ = require('lodash'), 
    q = require('q'),
    colors = require("colors"),
    globalConfig = require("config")
;

// logger = require('../../Logger').create()

var logger = console; 

q.longStackSupport = true; 

var DB = function() {

    // Default config values 
    var defaults = {
        host: 'localhost', 
        user: 'root', 
        password: '', 
        database: '', 
        multipleStatements: true, 
        connectionRetryTimeout: 5000,
        allowedFailedConnectionAttempts: 10
    };

    if(typeof globalConfig === 'undefined') {

        throw Exception("dbConfig must be defined for mysql."); 
        return false; 

    }

    /**
     * Member values 
     */ 
    this.logger = (logger) ? logger : console; 
    this.config = _.extend(defaults, globalConfig.db);
    this.connection = mysql.createConnection(this.config); 
    this.failedConnectionAttempts = 0; 
    this._connection = false; 
    this.queryLog = []; 
    this._connecting = false; 
    
};

// Static initializer
DB.init = function(dbConfig) {

    console.log("Initializing DB"); 

    return new DB(dbConfig); 

};

DB.prototype.isConnected = function() {
    return this.connection && this.connection._socket && this.connection._socket.readable; 
};

DB.prototype.connect = function() {

    var deferred = q.defer(); 

    var self = this; 

    if(!this.isConnected() && this._connecting === true) {

        deferred.notify('Still connecting...'.red); 

    };

    if(!this.isConnected() && this._connecting === false) {
        
        this._connecting = true; 

        this.logger.log('MySQL Not Connected...attempting to connect.'.red.underline); 

        // this.connection.on('connected', function(msg) {
        //     console.log(msg); 
        //     console.log('connected'); 
        // });

        // this.connection.on('authenticated', function(msg) {
        //     console.log(msg); 
        // });



        this.connection.connect(

            function(err) {

                this._connecting = false; 

                if(err) {

                    self.failedConnectionAttempts++;                     

                    self.logger.log('MySQL Connection error: ', err); 

                    switch(err.code) {

                        case 'PROTOCOL_CONNECTION_LOST': 
                            self.logger.log('MySQL Connection Error: Connection lost...trying to reconnect.'.yellow); 
                            deferred.reject(err); 
                            break; 

                        case 'PROTOCOL_ENQUEUE_HANDSHAKE_TWICE': 
                            self.logger.log('MySQL Connection Error: Trying to connect too many times.'.underline.red); 
                            deferred.reject(err); 
                            return err; 
                            break; 

                        case 'ER_ACCESS_DENIED_ERROR': 
                            self.logger.log("MySQL Connection Error: Access denied.  Bad authentication values?".underline.red); 
                            deferred.reject(err); 
                            return err; 
                            break; 


                    }


                    self.logger.log("Connection attempt #" + self.failedConnectionAttempts + " failed with error: " + err.stack); 
                    self.logger.log("Trying again..."); 
                    self.logger.log("Error at SystemManager.Server.handleMySQLConnection:  Cannot connect to MySQL " + err);

                    if(self.failedConnectionAttempts >= self.config.allowedFailedConnectionAttempts) {

                        deferred.reject("Reached max failed connection attempts --  (" + self.config.allowedFailedConnectionAttempts + ". Quitting.");

                        return false; 
                    
                    }

                    setTimeout(
                        
                        _.bind(
                            
                            function() {
                        
                                self.connect(); 
                        
                            }, 

                            self

                        ), 

                        self.config.connectionRetryTimeout

                    ); 
                
                } else {
                    
                    self.logger.log("MySQL DB connection successful. Connection thread " + self.connection.threadId);
                    self._connected = true; 
                    deferred.resolve(); 
                    return true; 
                }

            }

        ); 
    
    } else {

        deferred.resolve(); 

    }

    return deferred.promise; 

};

DB.prototype.printLog = function() {

    console.log('printing log'); 

    var i = 0, n = this.queryLog.length; 
    this.logger.log('Query Log'.red.underline); 

    do {
    
        this.logger.log(('Query #' + i).white.underline, this.queryLog[i]); 
        // self.logger.log(('Ran Query: '.white.underline) + ' ' +(queryStmt.yellow)); 
        i++; 
    
    } while(i < n); 

};

DB.prototype.query = function(queryStmt) {

    var deferredQuery = q.defer(); 

    var log = {
        sql: queryStmt, 
        time: 0, 
        error: ''
    }; 

    var startTime = new Date().getTime(); 

    var self = this; 

    this.connect()

        .then(

            function() {

                self.connection.query(
                    
                    queryStmt, 
                    
                    function(err, result) {

                        if(err || result.length === 0) {

                            log.time = (new Date().getTime()) - startTime; 

                            self.queryLog.push(log); 

                            deferredQuery.reject(err, result, queryStmt);                             

                        } else {

                            self.logger.log('Query successful...'); 

                            self.logger.log(queryStmt); 

                            log.time = (new Date().getTime()) - startTime; 

                            self.queryLog.push(log); 

                            deferredQuery.resolve(result); 

                        }

                    }

                );

            }, 

            function(err) {

                console.log('there was an error.'); 
                console.log(err); 
                deferredQuery.reject(err); 

            }, 
            // progress
            function(progress) {
                console.log('Progress', progress); 
            }
        )
    ;

    return deferredQuery.promise; 

};

DB.prototype.buildSQLStatementValues = function(tableName, jsonObj, delimiter, allowId) {

    if( ["and", ",", "or"].indexOf(delimiter) === 'undefined' ) {

        throw Error("SQL Statement Error: Invalid field delimiter."); 

    }

    var allowId = typeof allowId === 'undefined' ? false : allowId; 

    // Allow both identity field and `ident`
    var idents = [
        "ident", 
        this.toIdent(tableName)
    ];


    var stmtParts = []; 

    for (var property in jsonObj) {

        if (jsonObj.hasOwnProperty(property)) {
            
            if ( idents.indexOf(property) > -1 && allowId === false) {
                
                continue;

            }

            if (typeof jsonObj[property] == "number"){
            
                stmtParts.push(property + " = " + jsonObj[property]); 
            
            } else if (typeof jsonObj[property] == "boolean") {
                
                var val = 0;
                
                if (jsonObj[property]){

                    val = 1;

                }

                stmtParts.push(property + " = " + val); 

            } else {

                stmtParts.push(property + " = '" + jsonObj[property] + "'");

            }

        }

    }

    return stmtParts.join(" " + delimiter + " "); 

};

DB.prototype.update = function(tableName, valuesObj, whereObj) {

    var sql = "UPDATE " + tableName + " SET ";

    sql += this.buildSQLStatementValues(tableName, valuesObj, ","); 

    sql += " WHERE "; 

    sql += this.buildSQLStatementValues(tableName, whereObj, "and", true); 

    return this.query(sql); 

};

DB.prototype.toIdent = function(tableName) {
    
    return tableName + "Id"; 

};

DB.prototype.pad2 = function(num) {

    if(num < 10) {
        return "0" + num; 
    } else {
        return num; 
    }

};

DB.prototype.ISODate = function(dateObj) {

    var dateObj = dateObj || new Date(); 
    return dateObj.getFullYear() + '-' + this.pad2(dateObj.getMonth()) + '-' + this.pad2(dateObj.getDate()) + ' ' + this.pad2(dateObj.getHours()) + ':' + this.pad2(dateObj.getMinutes()) + ':' + this.pad2(dateObj.getSeconds());  

};

DB.prototype.insert = function(tableName, jsonObj) {

    if(typeof jsonObj.DateCreated === 'undefined') {

        jsonObj.DateCreated = this.ISODate(); 

    }

    var sql = "INSERT INTO " 
        + tableName 
        + " SET "
        + this.buildSQLStatementValues(tableName, jsonObj, ","); 

    return this.query(sql); 

};


// db.select('Foo', 1); 
// db.select('Foo', { TypeId: 1, IsDeleted: '0' })
DB.prototype.select = function(tableName, whereObj) {
    
    var sql = "SELECT * FROM " + tableName;
    
    if(typeof whereObj === 'object') {
        
        if(typeof whereObj.IsDeleted === 'undefined') {
            whereObj.IsDeleted = '0'; 
        }

        sql += " WHERE " + this.buildSQLStatementValues(tableName, whereObj, "and", true); 

    } else if(typeof whereObj === 'number') {

        sql += " WHERE " + this.toIdent(tableName) + " = " + whereObj; 

    }

    return this.query(sql); 

};

DB.prototype.remove = function(tableName, whereObj) {

    this.update(tableName, { 'IsDeleted': '1' }, whereObj); 

};

DB.prototype.restore = function(tableName, whereObj) {

    this.update(tableName, { 'IsDeleted': '0' }, whereObj); 

};
DB.prototype.activate = function(tableName, whereObj) {

    this.update(tableName, { 'IsActive': '1' }, whereObj); 

};
DB.prototype.deactivate = function(tableName, whereObj) {

    this.update(tableName, { 'IsActive': '0' }, whereObj); 

};

DB.prototype.tableExists = function(tableName) {

};

DB.prototype.getModelFields = function(dbName, tableName) {

    return this.query("SELECT * FROM information_schema.COLUMNS where table_schema = '" + dbName + "' and table_name = '" + tableName + "'"); 

};

DB.prototype.getModelAttrs = function(dbName, tableName) {

    return this.query("SELECT CCSA.character_set_name as defaultCharset, T.ENGINE as tableEngine, T.AUTO_INCREMENT as autoIncrement FROM information_schema.TABLES T, information_schema.COLLATION_CHARACTER_SET_APPLICABILITY CCSA WHERE CCSA.collation_name = T.table_collation AND T.table_schema = '" + dbName + "' AND T.table_name = '" + tableName + "'"); 

};

DB.prototype.createModel = function(dbName, tableName, fields) {

    var model = {
        db: dbName, 
        name: tableName, 
        engine: DB.defaults.engine, 
        defaultCharset: DB.defaults.defaultCharset, 
        autoIncrement: 0, 
        primaryKey: null, 
        fields: []
    };

    if(typeof fields !== 'undefined' && Array.isArray(fields) && fields.length > 0) {

        var fieldLen    = fields.length,
            i           = 0
        ;

        do {

            model.fields.push(this.createModelField(fields[i])); 

            if(fields[i].primaryKey) {
                model.primaryKey = fields[i].name; 
            }

            i++; 
        
        } while(i < fieldLen); 

    }

    return model; 

};

DB.prototype.createModelStrict = function(dbName, tableName, fields) {

    // Get the names of the provided fields 

    var fields = fields || null; 

    if(fields) {
        var fieldLen    = fields.length, 
            i           = 0,
            fieldNames  = []
        ;

        do {

            fieldNames.push(fields[i].name); 

            i++; 

        } while(i < fieldLen); 
    }

    // check for primary key 

    if(fieldNames.indexOf(tableName + 'Id') === -1) {

        fields.unshift({
            name: tableName + 'Id', 
            type: "int", 
            typeString: "int(11) unsigned", 
            precision: 11, 
            isNull: false, 
            typeStringExtra: "auto_increment", 
            primaryKey: true
        });

    }

    if(DB.defaultFields.length > 0) {

        var defaultFieldLen = DB.defaultFields.length, 
            j               = 0; 

        do {

            if(fieldNames.indexOf(DB.defaultFields[j].name) === -1) {

                fields.push(DB.defaultFields[j]); 

            }
            
            j++; 

        } while(j < defaultFieldLen); 

    }

    return this.createModel(dbName, tableName, fields); 

}; 

DB.prototype.createModelField = function(fieldData) {

    var defaults = {
        name:               '',
        type:               '',
        unsigned:           false,
        precision:          null,
        scale:              null, 
        typeString:         '',
        isNull:             true, 
        charset:            null, 
        collate:            null, 
        default:            null, 
        typeStringExtra:    ''
    };

    return _.defaults(fieldData, defaults); 
};


/**
 * Create an importable JSON object for a model 
 */ 
DB.prototype.modelToJSON = function(dbName, tableName) {

    var modelJSON = this.createModel(dbName, tableName, []); 
    
    var self = this; 

    return this.getModelFields(dbName, tableName)
        .then(function(fields) {
            var fieldLen    = fields.length, 
                i           = 0; 

            do {

                modelJSON.fields[i] = {
                    name:               fields[i].COLUMN_NAME, 
                    type:               fields[i].DATA_TYPE, 
                    unsigned:           (fields[i].COLUMN_TYPE.indexOf('unsigned') > -1), 
                    precision:          fields[i].NUMERIC_PRECISION, 
                    scale:              fields[i].NUMERIC_SCALE, 
                    typeString:         fields[i].COLUMN_TYPE, 
                    isNull:             fields[i].IS_NULLABLE === 'YES', 
                    charset:            fields[i].CHARACTER_SET_NAME, 
                    collate:            fields[i].COLLATION_NAME, 
                    default:            fields[i].COLUMN_DEFAULT, 
                    typeStringExtra:    fields[i].EXTRA
                };

                if(fields[i].COLUMN_KEY === "PRI") {
                    modelJSON.primaryKey = fields[i].COLUMN_NAME; 
                }
                
                i++; 

            } while(i < fieldLen); 

            return modelJSON; 
        })
        .then(function(modelJSON) {
            return self.getModelAttrs(dbName, tableName)
                .then(function(data) {
                    modelJSON.engine = data[0].tableEngine; 
                    modelJSON.autoIncrement = data[0].autoIncrement; 
                    modelJSON.defaultCharset = data[0].defaultCharset; 
                    return modelJSON; 
                })
            ; 
        });
    ;
};


DB.defaultFields = [
    {
        name: "DateCreated", 
        type: "DATETIME",
        unsigned: false,  
        precision: null, 
        scale: null, 
        typeString: "DATETIME", 
        isNull: true, 
        charset: null, 
        collate: null, 
        default: null, 
        typeStringExtra: ""
    }, 
    {
        name: "LastUpdated", 
        type: "TIMESTAMP", 
        unsigned: false, 
        precision: null, 
        scale: null, 
        typeString: "TIMESTAMP", 
        isNull: false, 
        charset: null, 
        collate: null, 
        default: "CURRENT_TIMESTAMP", 
        typeStringExtra: "on update CURRENT_TIMESTAMP"
    }, 
    { 
        name: 'IsActive',
        type: 'tinyint',
        unsigned: false, 
        precision: 3,
        scale: 0,
        typeString: 'tinyint(3) unsigned',
        isNull: false,
        charset: null,
        collate: null,
        default: '0',
        typeStringExtra: '' 
    },
    { 
        name: 'IsDeleted',
        type: 'tinyint',
        unsigned: false, 
        precision: 3,
        scale: 0,
        typeString: 'tinyint(3) unsigned',
        isNull: false,
        charset: null,
        collate: null,
        default: '0',
        typeStringExtra: '' 
    } 
];

/**
 * Create a table based on a JSON object 
 */ 
DB.prototype.createModelSQL = function(modelJSON) {

    var sql = "CREATE TABLE IF NOT EXISTS " + modelJSON.db + "." + modelJSON.name + " (\n"; 

    // Join the provided fields array with the default fields
    // modelJSON.fields.concat(defaultFields); 

    var i           = 0,
        cols        = []; 

    do {
        cols[i] = modelJSON.fields[i].name + " " + modelJSON.fields[i].typeString; 
        
        if(modelJSON.fields[i].charset) {
            cols[i] += " CHARACTER SET " + modelJSON.fields[i].charset; 
        }

        if(modelJSON.fields[i].collate) {
            cols[i] += " COLLATE " + modelJSON.fields[i].collate; 
        }

        if(!modelJSON.fields[i].isNull) {
            
            cols[i] += " NOT NULL";

            if(modelJSON.fields[i].default) {
                cols[i] += " DEFAULT " + modelJSON.fields[i].default; 
            } 

        } else {
            
            cols[i] += " NULL"; 

            if(modelJSON.fields[i].default) {
            
                cols[i] += " DEFAULT " + modelJSON.fields[i].default; 
            
            } else {
            
                cols[i] += " DEFAULT NULL"; 
            
            }

        }

        cols[i] += " " + modelJSON.fields[i].typeStringExtra; 

        i++; 

    } while(i < modelJSON.fields.length); 



    sql += cols.join(",\n"); 
    // Make the initial id field a primary key 
    if(modelJSON.primaryKey) {
        sql += ",\n PRIMARY KEY(" + modelJSON.primaryKey + ")"; 
    }

    return sql + "\n) ENGINE=" + modelJSON.engine + " AUTO_INCREMENT=" + modelJSON.autoIncrement + " DEFAULT CHARSET " + modelJSON.defaultCharset; 

};

DB.defaults = {
    defaultCharset: 'latin1', 
    engine: 'innoDb'
};

module.exports = new DB(); 