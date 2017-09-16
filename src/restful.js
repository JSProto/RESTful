'use strict';

const util = require('util');
const handler = require('./handler');
const {Router} = require('express');

/**
 * Resource implementation
 */
function RESTful() {}

/**
 * Register as array or single
 */
RESTful.register = function(server, options, base, port) {
    options.forEach(function(option) {
        let resource = null;

        if (port) {
            resource = RESTful.route(option, port)
        }
        else {
            resource = RESTful.route(option)
        }

        if (base) {
            server.use(base, resource);
        }
        else {
            server.use(resource);
        }
    });

    server.use(function(req, res, next) {
        handler.error404(req, res, next);
    });
    server.use(function(error, req, res, next) {
        handler.error500(error, req, res, next);
    });
};

/**
 * create route from option
 */
RESTful.route = function(option, port) {
    let router = Router();
    let path = (option.model.getTableName() || '').toLowerCase();
    let methods = option.methods || ['get', 'post', 'put', 'patch', 'delete'];
    let collection = util.format('/%s', path);
    let resource = util.format('/%s/:id', path);
    let field = util.format('/%s/:id/:field', path);
    let setXport = function(req, res, next){
        if (port) {
            req.xport = port;
        }
        next();
    };

    methods.forEach(function(method) {
        switch (method.toLowerCase()) {
            case 'get':
                [collection, resource, field].forEach(function(route) {
                    router.get(route, setXport, function(req, res) {
                        if (route.indexOf('/:id') === -1) {
                            handler.all.on(req, res, option.model);
                        }
                        else {
                            handler.detail.on(req, res, option.model);
                        }
                    });
                });
                break;

            case 'post':
                [collection].forEach(function(route) {
                    router.post(route, setXport, function(req, res) {
                        handler.create.on(req, res, option.model);
                    });
                });
                break;

            case 'put':
                // TODO method PUT must replace item
            case 'patch':
                [resource].forEach(function(route) {
                    router.patch(route, setXport, function(req, res) {
                        handler.update.on(req, res, option.model);
                    });
                });
                break;

            case 'delete':
                [resource].forEach(function(route) {
                    router.delete(route, setXport, function(req, res) {
                        handler.remove.on(req, res, option.model);
                    });
                });
                break;

            default:
                throw {
                    status: 404,
                    message: 'not supported method.',
                    name: 'NotFound'
                };
        }
    });

    return router;
};

module.exports = RESTful;