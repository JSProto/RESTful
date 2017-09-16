"use strict";

const util = require("util");
const handler = require("./handler");
const {Router} = require("express");

/**
 * Resource implementation
 */
function Resource() {}

/**
 * Register as array or single
 */
Resource.register = function(server, options, base, port) {
    options.forEach(function(option) {
        let resource = null;

        if (port) {
            resource = Resource.route(option, port)
        }
        else {
            resource = Resource.route(option)
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
Resource.route = function(option, port) {
    let route = Router();
    let methods = option.methods || ["get", "post", "put", "delete"];
    let path = (option.model.getTableName() || "").toLowerCase();

    methods.forEach(function(method) {
        switch (method.toLowerCase()) {
            case "get":
                {
                    [util.format("/%s", path), util.format("/%s/:id", path)].forEach(function(m) {
                        route.get(m, function(req, res) {
                            if (port) {
                                req.xport = port;
                            }

                            if (m.indexOf("/:id") === -1) {
                                handler.all.on(req, res, option.model);
                            }
                            else {
                                handler.detail.on(req, res, option.model);
                            }
                        });
                    });

                    break;
                }
            case "post":
                {
                    [util.format("/%s", path)].forEach(function(m) {
                        route.post(m, function(req, res) {
                            if (port) {
                                req.xport = port;
                            }
                            handler.create.on(req, res, option.model);
                        });
                    });
                    break;
                }
            case "put":
                {
                    [util.format("/%s/:id", path)].forEach(function(m) {
                        route.put(m, function(req, res) {
                            if (port) {
                                req.xport = port;
                            }
                            handler.update.on(req, res, option.model);
                        });
                    });
                    break;
                }
            case "delete":
                {
                    [util.format("/%s/:id", path)].forEach(function(m) {
                        route.delete(m, function(req, res) {
                            if (port) {
                                req.xport = port;
                            }
                            handler.remove.on(req, res, option.model);
                        });
                    });
                    break;
                }
            default:
                {
                    throw {
                        status: 404,
                        message: "not supported method.",
                        name: "NotFound"
                    };
                }
        }
    });

    return route;
};

module.exports = Resource;