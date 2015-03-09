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
var mysql   = require('mysql'),
    _       = require('lodash'),
    q       = require('q'),
    colors  = require("colors")
;

var logger = console;

q.longStackSupport = true;

var DB = function( dbconfig ) {

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

    /**
     * Member values
     */
    this.logger = (logger) ? logger : console;
    this.config = _.defaults( dbconfig, defaults );

    this.connection = mysql.createConnection(this.config);
    this.failedConnectionAttempts = 0;
    this._connection = false;
    this.queryLog = [];
    this._connecting = false;

};

// Static defaults
DB.defaults = {
    defaultCharset: 'latin1',
    engine: 'innoDb'
};

// Static initializer
DB.init = function(dbConfig) {

    console.log("Initializing DB".yellow);

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

                    self.logger.log(("MySQL DB connection successful. Connection thread " + self.connection.threadId).green);
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

                            // self.logger.log('Query successful...');

                            // self.logger.log(queryStmt);

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

module.exports = DB;