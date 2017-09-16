'use strict';

const util = require('util');
const {Observable} = require('rxjs/Observable');

require('rxjs/add/observable/fromPromise');
require('rxjs/add/observable/empty');
require('rxjs/add/observable/of');
require('rxjs/add/operator/map');
require('rxjs/add/operator/timeout');
require('rxjs/add/operator/concatMap');
require('rxjs/add/operator/mergeMap');

/**
 * isNullOrEmpty control
 */
function isNullOrEmpty(item) {
    if (item === null || item === undefined) {
        return true;
    }
    else if (typeof item === 'string') {
        return item === '';
    }
    else if (Array.isArray(item)) {
        return item.length === 0;
    }
    else {
        return JSON.stringify(item) === '{}';
    }
}

/**
 * parse key-value
 */
let toWhere = function(key, value) {
    let where = {};
    where[key] = value;
    return {where};
};

/**
 * Implementation of SObject
 */
const Objectify = (function() {
    function Objectify() {}
    Objectify.prototype.on = function(data) {
        return JSON.parse(JSON.stringify(data));
    };
    return Objectify;
}());

/**
 * Implementation of SQuery for ?select=x,y,z
 */
const Selectify = (function() {
    function Selectify() {}

    Selectify.prototype.on = function(req, data) {
        let properties = this.selects(req);

        if (properties) {
            if (Array.isArray(data)) {
                return data.map(entity => this.filter(properties, entity));
            }
            return this.filter(properties, data);
        }

        return data;
    };

    /**
     * select properties from query of request.
     */
    Selectify.prototype.selects = function(req) {
        return (req.query.select || '').split(',').map(select => select.trim());
    };

    /**
     * filter object with properties found.
     */
    Selectify.prototype.filter = function(properties, entity) {
        let filtered = {};

        properties.forEach(property => (filtered[property] = entity[property]));

        return isNullOrEmpty(filtered) ? entity : filtered;
    };

    return Selectify;
}());

/**
 * Implementation of SQuery for ?sort=x,desc
 */
const Sortify = (function() {
    function Sortify() {}

    Sortify.prototype.on = function(req, data) {
        let sortArgs = this.sorts(req);

        if (sortArgs.property) {
            let filter = function(l, r) {
                let t = typeof l[sortArgs.property];
                if (t === 'string') {
                    return l[sortArgs.property].localeCompare(r[sortArgs.property]);
                }
                else if (t === 'number') {
                    return l[sortArgs.property] - r[sortArgs.property];
                }
                else if (t === 'Date') {
                    return l[sortArgs.property].getTime() - r[sortArgs.property].getTime();
                }

                return 0;
            };

            data = data.sort(filter);

            if (sortArgs.desc) {
                data = data.reverse();
            }
        }

        return data;
    };

    /**
     * sort property and type from query of request.
     */
    Sortify.prototype.sorts = function(req) {
        let args = (req.query.sort || '').split(',').map(sort => sort.trim());

        return {
            property: args[0] || '',
            desc: (args[1] || 'asc').toLowerCase() === 'desc'
        };
    };

    return Sortify;
}());

/**
 * Implementation of SQuery for $href property
 */
const Urlify = (function() {
    function Urlify() {}

    Urlify.prototype.on = function(req, data) {
        if (Array.isArray(data)) {
            return data.map(entity => {
                if (!entity.href) {
                    entity.href = this.object(req, entity);
                }
                return entity;
            });
        }

        if (!data.href) {
            data.href = this.object(req, data);
        }

        return data;
    };

    /**
     * create object href.
     */
    Urlify.prototype.object = function(req, data) {
        let xport = req.xport || 80;
        let url;

        if (xport !== 80) {
            url = util.format('%s://%s:%d%s', req.protocol, req.hostname, xport, req.baseUrl);
        }
        else {
            url = util.format('%s://%s%s', req.protocol, req.hostname, req.baseUrl);
        }

        let collection = req.url.split('/').map(d => d.trim());

        if (!isNullOrEmpty(req.query)) {
            // if url has any kind of query then we split it before we format content (index 0 was problem, it should be index 1)
            let pathCollection = collection[1].split('?').map(d => d.trim());

            // detail object might contain only select query for filtering on properties.
            if (req.query.select) {
                return url.concat('/', pathCollection[0], '/', data.id.toString(), '?select=', req.query.select);
            }

            return url.concat('/', pathCollection[0], '/', data.id.toString());
        }

        // if this object is already in detail context in use.
        if (req.url.indexOf('/'.concat(data.id.toString())) !== -1) {
            return url.concat(req.url);
        }

        return url.concat(req.url, '/', data.id.toString());
    };

    /**
     * create collection of object href.
     */
    Urlify.prototype.collection = function(req, count) {
        let xport = req.xport || 80;
        let uri;
        let collectionArgs = {
            href: '',
            limit: parseInt(req.query.limit || 25),
            offset: parseInt(req.query.offset || 0),
            count: count
        };

        if (xport !== 80) {
            collectionArgs.href = util.format('%s://%s:%d%s%s', req.protocol, req.hostname, xport, req.baseUrl, req.url);
            uri = util.format('%s://%s:%d%s%s', req.protocol, req.hostname, xport, req.baseUrl, (req.url.split('?')[0] || req.url));
        }
        else {
            collectionArgs.href = util.format('%s://%s%s%s', req.protocol, req.hostname, req.baseUrl, req.url);
            uri = util.format('%s://%s%s%s', req.protocol, req.hostname, req.baseUrl, (req.url.split('?')[0] || req.url));
        }

        let hasNext = count >= collectionArgs.limit;
        if (hasNext) {
            collectionArgs.next = this.properties(uri, req.query, (collectionArgs.offset + collectionArgs.limit));
        }

        let hasPrev = (collectionArgs.offset - collectionArgs.limit) >= 0;
        if (hasPrev) {
            collectionArgs.previous = this.properties(uri, req.query, (collectionArgs.offset - collectionArgs.limit));
        }

        return collectionArgs;
    };

    /**
     * controls if uri has previously query.
     */
    Urlify.prototype.hasPreviousQuery = function(uri) {
        return uri && uri.indexOf('?') === -1;
    };

    /**
     * read properties on query and write them again, as long as it is not `offset`
     */
    Urlify.prototype.properties = function(uri, query, offset) {

        for (let property in query) {
            if (query.hasOwnProperty(property)) {
                uri = uri.concat(this.hasPreviousQuery(uri) ? '?' : '&', property, '=', property === 'offset' ? offset : query[property]);
            }
        }

        return uri;
    };

    return Urlify;
}());

let objectify = new Objectify();
let selectify = new Selectify();
let sortify = new Sortify();
let urlify = new Urlify();

/**
 * Implementation of SRequest for All.
 */
const All = (function() {
    function All() {}

    All.prototype.on = function(req, res, model) {
        let served = false;
        let limit = parseInt(req.query.limit || 25); // defults for 'limit'
        let offset = parseInt(req.query.offset || 0); // defults for 'offset'

        let query = model.all({
            limit: limit,
            offset: offset,
            include: model.map || []
        }).catch(function(error) {
            served = true;
            res.json({
                status: 400,
                message: error.name || 'database error',
                data: error.message || 'error occured in database transaction'
            });
        });

        Observable.fromPromise(query)
            .map(entities => objectify.on(entities))
            .map(entities => urlify.on(req, entities))
            .map(entities => selectify.on(req, entities))
            .map(entities => sortify.on(req, entities))
            .map(entities => {

                let {href, next, previous, limit, offset} = urlify.collection(req, entities.length);

                let response = {
                    code: 200,
                    message: 'success',
                    data: entities,
                    href, limit, offset,
                    count: entities.length
                };

                if (next) {
                    response.next = next;
                }
                if (previous) {
                    response.previous = previous;
                }

                return response;
            })
            .subscribe(response => res.json(response), function(error) {
                if (!served) {
                    res.json({
                        status: 400,
                        message: error.name || 'database error',
                        data: error.message || 'error occured in database transaction'
                    });
                }
            });
    };

    return All;
}());

/**
 * Implementation of SRequest for Detail.
 * on orm.Model property needed to appended are;
 *  - idKey: string
 *  - includeModels: Array<orm.Model<?, ?>>
 */
const Detail = (function() {
    function Detail() {}

    Detail.prototype.on = function(req, res, model) {
        let objectId = parseInt(req.params.id || 0);

        if (!objectId) {
            throw {
                status: 400,
                message: 'invalid object id, check param id.',
                name: 'InvalidObjectId'
            };
        }

        let served = false;
        let where = toWhere(model.primaryKeyName || 'id', objectId);

        if (model.map) {
            where.include = model.map;
        }

        let query = model.find(where).catch(function(error) {
                served = true;
                res.json({
                    status: 400,
                    message: error.name || 'database error',
                    data: error.message || 'error occured in database transaction'
                });
            });

        Observable.fromPromise(query)
            .map(entity => objectify.on(entity))
            .mergeMap(function(entity) {
                if (isNullOrEmpty(entity)) {
                    res.json({
                        code: 400,
                        message: 'no such object exists.',
                        data: null
                    });

                    return Observable.empty();
                }

                return Observable.of(entity);
            })
            .map(entity => urlify.on(req, entity))
            .map(entity => selectify.on(req, entity))
            .map(function(entity) {
                return {
                    code: 200,
                    message: 'success',
                    data: entity
                };
            })
            .subscribe(response => res.json(response), function(error) {
                if (!served) {
                    res.json({
                        status: 400,
                        message: error.name || 'database error',
                        data: error.message || 'error occured in database transaction'
                    });
                }
            });
    };

    return Detail;
}());

/**
 * Implementation of SRequest for Create.
 */
const Create = (function() {
    function Create() {}

    Create.prototype.on = function(req, res, model) {
        let object = req.body || {};

        if (isNullOrEmpty(object)) {
            throw {
                status: 400,
                message: 'invalid object',
                name: 'InvalidObject'
            };
        }

        let served = false;
        let query = model.create(object).catch(function(error) {
                served = true;
                res.json({
                    status: 400,
                    message: error.name || 'database error',
                    data: error.message || 'error occured in database transaction'
                });
            });

        Observable.fromPromise(query)
            .map(entity => objectify.on(entity))
            .map(entity => urlify.on(req, entity))
            .map(entity => selectify.on(req, entity))
            .map(function(entity) {
                return {
                    code: 200,
                    message: 'success',
                    data: entity
                };
            })
            .subscribe(response => res.json(response), function(error) {
                if (!served) {
                    res.json({
                        status: 400,
                        message: error.name || 'database error',
                        data: error.message || 'error occured in database transaction'
                    });
                }
            });
    };

    return Create;
}());

/**
 * Implementation of SRequest for Update.
 */
const Update = (function() {
    function Update() {}

    Update.prototype.on = function(req, res, model) {
        let objectId = parseInt(req.params.id || 0);
        let object = (req.body || {});

        if (!objectId && isNullOrEmpty(object)) {
            throw {
                status: 400,
                message: 'no such object exists.',
                name: 'NoSuchObjectExists.'
            };
        }

        let served = false;
        let where = toWhere(model.primaryKeyName || 'id', objectId);

        if (model.map) {
            where.include = model.map;
        }

        let query = model.update(object, where).catch(function(error) {
                served = true;
                res.json({
                    status: 400,
                    message: error.name || 'database error',
                    data: error.message || 'error occured in database transaction'
                });
            })

        Observable.fromPromise(query)
            .concatMap(count => count)
            .map(function(count) {
                return {
                    code: 200,
                    message: 'success',
                    data: count
                };
            })
            .subscribe(response => res.json(response), function(error) {
                if (!served) {
                    res.json({
                        status: 400,
                        message: error.name || 'database error',
                        data: error.message || 'error occured in database transaction'
                    });
                }
            });
    };

    return Update;
}());

/**
 * Implementation of SRequest for Remove.
 */
const Remove = (function() {
    function Remove() {}

    Remove.prototype.on = function(req, res, model) {
        let objectId = parseInt(req.params.id || 0);

        if (!objectId) {
            throw {
                status: 400,
                message: 'no such object exists.',
                name: 'NoSuchObjectExists.'
            };
        }

        let served = false;
        let where = toWhere(model.primaryKeyName || 'id', objectId);

        if (model.map) {
            where.include = model.map;
        }

        let query = model.destroy(where).catch(function(error) {
                served = true;
                res.json({
                    status: 400,
                    message: error.name || 'database error',
                    data: error.message || 'error occured in database transaction'
                });
            });

        Observable.fromPromise(query)
            .map(function(count) {
                return {
                    code: 200,
                    message: 'success',
                    data: count
                };
            })
            .subscribe(response => res.json(response), function(error) {
                if (!served) {
                    res.json({
                        status: 400,
                        message: error.name || 'database error',
                        data: error.message || 'error occured in database transaction'
                    });
                }
            });
    };

    return Remove;
}());


/**
 * export implementations
 */
exports.implements = {
    All,
    Detail,
    Create,
    Update,
    Remove
};

/**
 * export handlers.
 */
module.exports = {
    all: new All(),
    detail: new Detail(),
    create: new Create(),
    update: new Update(),
    remove: new Remove(),

    error404: function(req, res, next) {
        next({
            status: 404,
            message: 'no such url exists.',
            name: 'NotFound.'
        });
    },
    error500: function(error, req, res, next) {
        res.json({
            code: error.status || 500,
            message: error.name || 'ServerError',
            data: error.message || 'internal server error'
        });
    }
};