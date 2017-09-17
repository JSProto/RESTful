
const BULK_UPDATE = {
    slug: 'bulk-update',
    error: {
        name: 'BULK_UPDATE',
        code: 400,
        reason: 'bulk update failed. did all resources exist?'
    },
    description: {
        mitigation: 'pass a list of resources in req.body, and make sure all resources to update do exist'
    }
};

const POST_RESOURCE = {
    slug: 'post-resource',
    error: {
        name: 'POST_RESOURCE',
        code: 400,
        reason: 'POST /:model/:id is not allowed.',
    },
    description: {
        mitigation: 'a) use PATCH /:model/:id instead of POST to update or b) use POST /:model to create a new resource'
    }
};

const UNKNOWN_FIELD = {
    slug: 'unknown-field',
    error: {
        name: 'UNKNOWN_FIELD',
        code: 400,
        reason: 'the :field of /:model/:id/:field is unknown.'
    },
    description: {
        mitigation: 'use OPTIONS /:model to get a list of (among others) all available :fields'
    }
};

const UNKNOWN_TYPE = {
    slug: 'unknown-type',
    error: {
        name: 'UNKNOWN_TYPE',
        reason: 'path extension none of (json|xml|yml)'
    },
    description: {
        mitigation: 'a) specify Accept: header instead, b) request the url with one of (json|xml|yml) as extension'
    }
};

const UNKNOWN_OBJECT_ID = {
    slug: 'unknown-object-id',
    error: {
        name: 'UNKNOWN_OBJECT_ID',
        code: 400,
        reason: 'the :id of /:model/:id is unknown.'
    },
    description: {
        mitigation: 'use GET /:model to get a list of (among others) all available resource :id'
    }
};

let Exception = function (baseUrl, exception, error) {
    return Object.assign({
        url: `${baseUrl}/error/${exception.slug}`
    }, exception.error);
};

Exception.types = {
    BULK_UPDATE,
    POST_RESOURCE,
    UNKNOWN_FIELD,
    UNKNOWN_TYPE,
    UNKNOWN_OBJECT_ID
};

Object.assign(Exception, Exception.types);

module.exports = Exception;