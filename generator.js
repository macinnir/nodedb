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

DB.prototype.tableExists = function(tableName) {

};

DB.prototype.getModelFields = function(dbName, tableName) {

    return this.query("SELECT * FROM information_schema.COLUMNS where table_schema = '" + dbName + "' and table_name = '" + tableName + "'");

};

DB.prototype.getModelAttrs = function(dbName, tableName) {

    return this.query("SELECT CCSA.character_set_name as defaultCharset, T.ENGINE as tableEngine, T.AUTO_INCREMENT as autoIncrement FROM information_schema.TABLES T, information_schema.COLLATION_CHARACTER_SET_APPLICABILITY CCSA WHERE CCSA.collation_name = T.table_collation AND T.table_schema = '" + dbName + "' AND T.table_name = '" + tableName + "'");

};