##  RESTful - is easy to use restful service implementation for express and sequelize ##


### How to install ###

with node package manager aka npm;

`npm install --save restful-express-sequelize`

Documentation for `express` or `sequelize`

[Express](https://expressjs.com/en/4x/api.html) or [Sequelize](http://sequelize.readthedocs.io/en/v3/)


(PS: for database example check [model](#models))

in your server.js or index.js file;

```javascript
//imports
const express = require('express');
const bodyParser = require('body-parser');
const gzip = require('compression');
const restful = require('restful-express-sequelize');

// model generted by sequelize-cli
// (sequelize model:create --name country --attributes name:string,lang:string)
const db = require('./models');

// bind over ip and port instead of 127.0.0.1
const port = process.env.PORT || 8080;
const host = process.env.HOST || '192.168.1.100';

// express instance
const server = express();

// register body-parser middleware
server.use(bodyParser.json());
server.use(bodyParser.urlencoded({
    extended: true
}));

// register compression middleware
server.use(gzip({
    filter: function(req, res) {
        return !req.headers['x-no-gzip'];
    }
}));

// get items from models
let models = Object.values(db).filter(m => m.tableName).map(model => {
    // register as options you can add { model: xxx, methods: ['get', 'post'] } 
    // methods are (optional) defaults all registered ['get', 'post', 'put', 'delete'] 
    return {model};
});

// finally register your method(s) on base as '/api/v1/'
// base is (optional) restful.register(server, model)
// port is (optional) restful.register(server, model) if port is not 80 then we bind
// if you use it in local project or port specified on others it will be useful.
restful.register(server, models, '/api/v1', port);

// start serving
server.listen(port, host, function() {
    console.log('Server Running...');
});
```
### Models ###

in `/model` folder 

as country.js 
```javascript
'use strict';

module.exports = function(sequelize, DataTypes) {
    const Country = sequelize.define('Country', {
        countryName: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
        classMethods: {
            associate: function(models) {
                Country.hasMany(models.City, {
                    foreignKey: 'countryId'
                });

                // Country.map is for api will show assosiations
                Country.map = [models.City];
            }
        }
    });

    return Country;
};
```

as city.js 

```javascript
'use strict';

module.exports = function(sequelize, DataTypes) {
    const City = sequelize.define('City', {
        cityName: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
        classMethods: {
            associate: function(models) {
                City.belongsTo(models.Country, {
                    as: 'country'
                });
            }
        }
    });

    return City;
};
```

as index.js 

```javascript
'use strict';

const fs        = require('fs');
const path      = require('path');
const Sequelize = require('sequelize');
const basename  = path.basename(module.filename);
const config    = require(path.join(__dirname, '../config/config.json'));

// placeholder for all
let db = {};

// connect
const sequelize = new Sequelize(config.database, config.username, config.password, config.options);

// imports everything in this directory into entities and register relations later.
fs.readdirSync(__dirname)
    .filter(function(f) {
        return (f.indexOf('.') !== 0) && (f !== basename) && (f.slice(-3) === '.js');
    })
    .map(f => sequelize.import(path.join(__dirname, f)))
    .forEach(model => (db[model.name] = model));

// invoke associate methods on models
Object.values(db)
    .forEach(function(model) {
        if (model.associate) {
            // this will invoke our relationships
            model.associate(db);
        }
    });

// sync context once
sequelize.sync();

// exports
module.exports = db;
```

## For More and What we support ##

Registers your database context on restful definitions, and service is created with it at github [link.](https://github.com/droideveloper/RESTfulExample)

For instance your database table is "Country" in mysql registered as `/country` for methods:
  
  * GET     /country
  * GET     /country/:id
  * POST    /country
  * PUT     /country/:id
  * DELETE  /country/:id

and by passing methods args on your registeration in array `['get', 'post', 'put', 'delete']`
you are allowed to manipulate proper methods or register only your needs. P.S. ( as defaults all registered )

supports some default query options;
  
- for array Response:
  * select=property1,property2 (any property of model itself and some extras: id, href, createdAt, updatedAt)
  * sort=property,type (any property of model and type as 'desc' or 'asc' is default )
  * limit=number (25 is default)
  * offset=number (0 is default)  
    
- for object Response:
  * select=property1,property2 (any property of model itself and some extras: id, href, createdAt, updatedAt)  

response are wrapped as follows;

  for array responses:

  `next` or `previous` properties might not exists depending on context. (optionals)
  `data` property can be `null` or `[]`.

  ```json
  {
    "code": 200,
    "message": "success",
    "data": [{ }],
    "count": 1, 
    "href": "$href", 
    "next": "$next", 
    "previous": "$previous", 
    "limit": 25,
    "offset": 0
  }
  ```

  for object or primitive responses:

  `data` property can be `null` or `{}`.

  ```json
  {
    "code": 200,
    "message": "success",
    "data": { } 
  }
  ```

## Changes ##
- optional port added for local projects.
- bug fix.

## License ##

Copyright 2017 Fatih Şen and contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
