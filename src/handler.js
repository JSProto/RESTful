'use strict';

const _ = require('lodash');
const util = require('util');
const untyped = require('untyped');
const {Observable} = require('rxjs/Observable');

require('rxjs/add/observable/fromPromise');
require('rxjs/add/observable/empty');
require('rxjs/add/observable/of');
require('rxjs/add/operator/map');
require('rxjs/add/operator/timeout');
require('rxjs/add/operator/concatMap');
require('rxjs/add/operator/mergeMap');

const Exception = require('./errors');

/**
 * parse key-value
 */
let toWhere = function(key, value) {
    return _.set({}, key, value);
};

/**
 * Implementation of SObject
 */
class Objectify {
    on (data) {
        return JSON.parse(JSON.stringify(data));
    }
}


/**
 * Implementation of SQuery for ?fields=x,y,z
 */
class Selectify {
    on (req, data) {
        const fields = req.query.fields;
        if (fields) {
            if (Array.isArray(data)) {
                return data.map(entity => this.filter(fields, entity));
            }
            return this.filter(fields, data);
        }
        return data;
    }

    filter(properties, entity){
        return untyped.validate(entity, untyped.parse(properties));
    }
}

/**
 * Implementation of SQuery for ?sort=x,desc
 */
class Sortify {
    on (req, data) {
        let sortArgs = this.sorts(req.query.sort);

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
    }

    sorts (query) {
        let [property, desc = 'asc'] = (query || '').split(',').map(sort => sort.trim());

        return {
            property,
            desc: desc.toLowerCase() === 'desc'
        };
    }
}

/**
 * Implementation of SQuery for $href property
 */
class Urlify {
    on (req, data) {
        if (_.isArray(data)) {
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
    }

    /**
     * create object href.
     */
    object (req, data) {
        let xport = req.xport || 80;
        let url;

        if (xport !== 80) {
            url = util.format('%s://%s:%d%s', req.protocol, req.hostname, xport, req.baseUrl);
        }
        else {
            url = util.format('%s://%s%s', req.protocol, req.hostname, req.baseUrl);
        }

        let collection = req.url.split('/').map(d => d.trim());

        if (!_.isEmpty(req.query)) {
            // if url has any kind of query then we split it before we format content (index 0 was problem, it should be index 1)
            let pathCollection = collection[1].split('?').map(d => d.trim());

            // detail object might contain only fields query for filtering on properties.
            if (req.query.fields) {
                return url.concat('/', pathCollection[0], '/', data.id, '?fields=', req.query.fields);
            }

            return url.concat('/', pathCollection[0], '/', data.id);
        }

        // if this object is already in detail context in use.
        if (req.url.indexOf('/'.concat(data.id)) !== -1) {
            return url.concat(req.url);
        }

        return url.concat(req.url, '/', data.id);
    }

    /**
     * create collection of object href.
     */
    collection (req, count) {
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
    }

    /**
     * read properties on query and write them again, as long as it is not `offset`
     */
    properties (uri, query, offset) {

        for (let property in query) {
            if (query.hasOwnProperty(property)) {
                uri = uri.concat(this.hasPreviousQuery(uri) ? '?' : '&', property, '=', property === 'offset' ? offset : query[property]);
            }
        }

        return uri;
    }

    /**
     * controls if uri has previously query.
     */
    hasPreviousQuery (uri) {
        return uri && uri.indexOf('?') === -1;
    }
}


let objectify = new Objectify();
let selectify = new Selectify();
let sortify = new Sortify();
let urlify = new Urlify();

/**
 * Implementation of SRequest for All.
 */
class All {
    on (req, res, model) {
        let served = false;
        let where = {};
        let options = {
            limit: parseInt(req.query.limit || 25),
            offset: parseInt(req.query.offset || 0),
            include: model.map || []
        };

        let onError = function (error) {
            if (!served) {
                res.json({
                    code: 400,
                    message: error.name || 'database error',
                    data: error.message || 'error occured in database transaction'
                });
            }
            served = true;
        };

        // ?:field=
        _.keys(_.omit(model.attributes, 'createdAt', 'updatedAt')).forEach(function(attribute) {
            ['', '~', '|', '^', '$', '*'].forEach(function(match) {
                let queryparam = attribute + match;

                if (queryparam in req.query) {
                    let value = req.query[queryparam];

                    switch (match) {
                        case '':
                            // exact match
                            where[attribute] = value;
                            break;

                        case '~':
                            // oneof match
                            where[attribute] = {
                                'in': value.split(',')
                            };
                            break;

                        case '|':
                            // prefix-/exact match
                            where[attribute] = {
                                like: value + '%'
                            };
                            break;

                        case '^':
                            // startswith match
                            where[attribute] = {
                                like: value + '%'
                            };
                            break;

                        case '$':
                            // endswith match
                            where[attribute] = {
                                like: '%' + value
                            };
                            break;

                        case '*':
                            // contains match
                            where[attribute] = {
                                like: '%' + value + '%'
                            };
                            break;
                    }
                }
            });
        });

        if (!_.isEmpty(where)) {
            options.where = where;
        }

        if ('fields' in req.query) {
            options.attributes = _.keys(untyped.parse(req.query.fields)).concat(['id']);
        }

        let query = model.all(options).catch(onError);

        Observable.fromPromise(query)
            .map(entities => objectify.on(entities))
            .map(entities => selectify.on(req, entities))
            .map(entities => urlify.on(req, entities))
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
            .subscribe(response => res.json(response), onError);
    }
}

/**
 * Implementation of SRequest for Detail.
 * on orm.Model property needed to appended are;
 *  - idKey: string
 *  - includeModels: Array<orm.Model<?, ?>>
 */
class Detail {
    on (req, res, model) {
        let served = false;
        let objectId = req.params.id;

        if (!objectId) {
            throw Exception(req.baseUrl, Exception.UNKNOWN_OBJECT_ID);
        }

        let onError = function (error) {
            if (!served) {
                res.json({
                    code: 400,
                    reason: error.reason || '',
                    name: error.name || 'database error',
                    message: error.message || 'error occured in database transaction',
                });
            }
            served = true;
        };

        let foreignKeys = _.entries(model.attributes)
            .filter(([,o]) => 'references' in o)
            .map(([attribute, {references}]) => ({
                attribute,
                references,
                model: _.find(model.sequelize.models, m => (m.getTableName() === references.model))
            }));

        let options = {};

        if (model.map) {
            options.include = model.map;
        }

        // ?fields=
        if ('fields' in req.query) {
            options.attributes = _.uniq(_.keys(untyped.parse(req.query.fields)).concat(['id']));
        }

        let query = model.findById(objectId, options).catch(onError).then(function(result){
            return Promise.all(foreignKeys.map(foreignkey => {
                let {references: {key}, attribute} = foreignkey;
                let value = result.dataValues[attribute];
                return foreignkey.model.findOne({
                    where: _.set({}, key, value)
                });
            }))
            .then(function(foreignValues) {
                _.zip(foreignKeys, foreignValues).forEach(([{attribute}, value]) => {
                    result.dataValues[attribute] = value;
                });
                return result;
            });

        });

        Observable.fromPromise(query)
            .map(entity => objectify.on(entity))
            .mergeMap(function(entity) {

                if (_.isEmpty(entity)) {
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
            .subscribe(response => res.json(response), onError);
    }
}


/**
 * Implementation of SRequest for Create.
 */
class Create {
    on (req, res, model) {
        let served = false;
        let object = req.body;

        if (_.isEmpty(object)) {
            throw Exception(req.baseUrl, Exception.UNKNOWN_OBJECT_ID);
        }

        let onError = function (error) {
            if (!served) {
                res.json({
                    code: 400,
                    reason: error.reason || '',
                    message: error.name || 'database error',
                    data: error.message || 'error occured in database transaction'
                });
            }
            served = true;
        };

        let query = model.create(object).catch(onError);

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
            .subscribe(response => res.json(response), onError);
    }
}

/**
 * Implementation of SRequest for Update.
 */
class Update {
    on (req, res, model) {
        let served = false;
        let objectId = req.params.id;
        let object = req.body;

        if (!objectId) {
            throw Exception(req.baseUrl, Exception.UNKNOWN_OBJECT_ID);
        }
        if (_.isEmpty(object)) {
            throw Exception(req.baseUrl, Exception.UNKNOWN_UPDATE_DATA);
        }

        let onError = function (error) {
            if (!served) {
                res.json({
                    code: 400,
                    reason: error.reason || '',
                    message: error.name || 'database error',
                    data: error.message || 'error occured in database transaction'
                });
            }
            served = true;
        };

        let options = {
            where: toWhere(model.primaryKeyName || 'id', objectId)
        };

        if (model.map) {
            options.include = model.map;
        }

        let query = model.update(object, options).catch(onError)

        Observable.fromPromise(query)
            .concatMap(count => count)
            .map(function(count) {
                return {
                    code: 200,
                    message: 'success',
                    data: count
                };
            })
            .subscribe(response => res.json(response), onError);
    }
}

/**
 * Implementation of SRequest for Remove.
 */
class Remove {
    on (req, res, model) {
        let served = false;
        let objectId = req.params.id;

        if (!objectId) {
            throw Exception(req.baseUrl, Exception.UNKNOWN_OBJECT_ID);
        }

        let onError = function (error) {
            if (!served) {
                res.json({
                    code: 400,
                    reason: error.reason || '',
                    message: error.name || 'database error',
                    data: error.message || 'error occured in database transaction'
                });
            }
            served = true;
        };

        let options = {
            where: toWhere(model.primaryKeyName || 'id', objectId),
            truncate: true,
            cascade: true
        }

        if (model.map) {
            options.include = model.map;
        }

        let query = model.destroy(options).catch(onError);

        Observable.fromPromise(query)
            .map(function(count) {
                return {
                    code: 200,
                    message: 'success',
                    data: count
                };
            })
            .subscribe(response => res.json(response), onError);
    }
}



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
            code: 404,
            message: 'no such url exists.',
            name: 'NotFound.'
        });
    },
    error500: function(error, req, res, next) {

        res.json({
            code: error.code || 500,
            name: error.name || 'ServerError',
            reason: error.reason || '',
            message: error.message || 'internal server error',
        });
    }
};