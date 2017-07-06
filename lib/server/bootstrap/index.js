/*
 * Copyright 2017 Alexandre Moreno <alex_moreno@tutk.com>
 *
 * This file is part of lwm2m-node-lib
 *
 * lwm2m-node-lib is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * lwm2m-node-lib is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with lwm2m-node-lib.
 * If not, seehttp://www.gnu.org/licenses/.
 *
 * For those usages not covered by the GNU Affero General Public License
 * please contact with::[contacto@tid.es]
 */

'use strict';

var Router = require('../../router');
var coap = require('coap');
var CoapServer = coap.createServer;
var Registry = require('../registry');
var debug = require('debug')('lwm2m');
var utils = require('../../utils');
var Server = require('../');

function defaultOptions(options) {
  return Object.assign({
    udpWindow: 100,
    type : 'udp6',
  }, options || {}, { proxy: true });
}

/**
 * Server constructor.
 *
 * Options:
 *
 * - `type`: indicates if the server should create IPv4 connections (udp4) or IPv6 connections (udp6). Defaults to udp6.
 * - `piggybackReplyMs`: set the number of milliseconds to wait for a piggyback response. Default 50.
 * - `registry`
 * - `schemas`: default schemas to use.
 *
 * Events:
 *
 * - `bootstrapRequest`: device bootstrap request.
 *
 * Examples:
 *
 *   var bootstrap = require('lwm2m').bootstrap;
 *   var server = bootstrap.createServer();
 *
 *   server.on('error', function(err) {
 *     throw err;
 *   });
 *
 *   server.on('close', function() {
 *     console.log('server is done');
 *   });
 *
 *   server.on('bootstrapRequest', function(params, accept) {
 *     console.log('endpoint %s contains %s', params.ep, params.payload);
 *     accept();
 *   });
 *
 *   // the default CoAP port is 5683
 *   server.listen();
 *
 * @param {Object} options
 */
function BServer(options) {
  if (!(this instanceof BServer)) {
    return new BServer(options);
  }

  var opts = defaultOptions(options);
  CoapServer.call(this, opts);

  var router = Router({
    udpWindow: opts.udpWindow,
    server: this,
    routes: [
      [ 'POST', /\/bs$/, require('./request') ],
    ]
  });

  this._registry = new Registry();
  this.on('request', router);
}

BServer.prototype = Object.create(CoapServer.prototype, {
  proxy: {
    value: Server.prototype.proxy
  },
  write: {
    value: Server.prototype.write
  }
  delete: {
    value: Server.prototype.delete
  },
  bootstrap: {
    value: true
  }
});

BServer.prototype.constructor = BServer;

BServer.prototype.finish = function(ep, callback) { 
  var processResponse = function(res) {
    return new Promise(function(resolve, reject) {
      if (res.code === '2.04') {
        resolve(res.payload.toString('utf8'));
      } else {
        reject(new errors.ClientError(res.code));
      }
    });
  };

  debug('Bootstrap finish request on device [%s]', ep);

  var registry = this._registry;

  var promise = registry.find(ep)
  .then(function(client) {
    return registry.unregister(client.location)
  })
  .then(function(client) {
    return this['proxy']({
      endpoint: ep, 
      method: 'POST',
      pathname: '/bs'
  })
  .then(processResponse); 

  if (callback) {
    utils.invoke(callback, promise);
  }

  return promise;
};

module.exports.createServer = BServer;
